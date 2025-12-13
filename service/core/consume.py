"""Consumption service core module

Provides core business logic for consumption records, remote billing, and statistics
"""

import json
import logging
from typing import Any
from uuid import UUID

import requests
from sqlmodel.ext.asyncio.session import AsyncSession

from common.code.error_code import ErrCode, ErrCodeError
from models.consume import ConsumeRecord, ConsumeRecordCreate, ConsumeRecordUpdate, UserConsumeSummary
from repos.consume import ConsumeRepository
from repos.redemption import RedemptionRepository

logger = logging.getLogger(__name__)

# BohrApp consumption service configuration
BOHRAPP_CONSUME_API = "https://openapi.dp.tech/openapi/v1/api/integral/consume"
BOHRAPP_X_APP_KEY = "xyzen-uuid1760783737"
BOHRAPP_DEFAULT_SKU_ID = 10049
BOHRAPP_DEFAULT_SCENE = "appCustomizeCharge"
BOHRAPP_DEFAULT_CHANGE_TYPE = 1


class ConsumeService:
    """Core business logic layer for consumption service"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.consume_repo = ConsumeRepository(db)
        self.redemption_repo = RedemptionRepository(db)

    async def create_consume_record(
        self,
        user_id: str,
        amount: int,
        auth_provider: str,
        access_key: str | None = None,
        sku_id: int | None = None,
        scene: str | None = None,
        session_id: UUID | None = None,
        topic_id: UUID | None = None,
        message_id: UUID | None = None,
        description: str | None = None,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
        total_tokens: int | None = None,
    ) -> ConsumeRecord:
        """
        Create consumption record and execute remote billing (if needed)

        Args:
            user_id: User ID
            amount: Consumption amount
            auth_provider: Authentication provider
            access_key: Access key (required for bohr_app)
            sku_id: SKU ID
            scene: Consumption scene
            session_id: Associated session ID
            topic_id: Associated topic ID
            message_id: Associated message ID
            description: Consumption description
            input_tokens: Number of input tokens used
            output_tokens: Number of output tokens generated
            total_tokens: Total tokens (input + output)

        Returns:
            Created consumption record
        """
        logger.info(f"Creating consume record for user {user_id}, amount: {amount}, provider: {auth_provider}")

        # Check virtual balance first
        wallet = await self.redemption_repo.get_user_wallet(user_id)
        virtual_balance = wallet.virtual_balance if wallet else 0

        logger.info(f"User {user_id} virtual balance: {virtual_balance}, required: {amount}")

        amount_from_virtual = 0
        amount_from_remote = amount

        # Use virtual balance first if available
        if virtual_balance > 0:
            amount_from_virtual = min(virtual_balance, amount)
            amount_from_remote = amount - amount_from_virtual

            logger.info(f"Using virtual balance: {amount_from_virtual}, remote billing needed: {amount_from_remote}")

            # Deduct from virtual balance
            await self.redemption_repo.deduct_wallet(user_id, amount_from_virtual)
            logger.info(f"Deducted {amount_from_virtual} from user {user_id} virtual balance")

        # Create consumption record (initial state is pending if remote billing needed, success if only virtual)
        initial_state = "pending" if amount_from_remote > 0 else "success"

        record_data = ConsumeRecordCreate(
            user_id=user_id,
            amount=amount,
            auth_provider=auth_provider,
            sku_id=sku_id,
            scene=scene,
            session_id=session_id,
            topic_id=topic_id,
            message_id=message_id,
            description=description,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            consume_state=initial_state,
        )

        # Save to database
        record = await self.consume_repo.create_consume_record(record_data, user_id)

        # If we still need remote billing
        if amount_from_remote > 0:
            logger.info(f"Need remote billing for remaining amount: {amount_from_remote}")

            # Execute remote billing only for bohr_app authentication
            if auth_provider.lower() == "bohr_app":
                if not access_key:
                    logger.error(f"Missing access_key for bohr_app consume, record {record.id}")

                    # Refund the virtual balance that was already deducted
                    if amount_from_virtual > 0:
                        await self.redemption_repo.credit_wallet(user_id, amount_from_virtual)
                        logger.info(
                            f"Refunded {amount_from_virtual} to user {user_id} virtual balance due to missing access_key"
                        )

                    # Update record state to failed
                    update_data = ConsumeRecordUpdate(
                        consume_state="failed", remote_error="Missing access_key for bohr_app authentication"
                    )
                    await self.consume_repo.update_consume_record(record.id, update_data)
                    record.consume_state = "failed"
                    record.remote_error = "Missing access_key for bohr_app authentication"

                    # Raise error to notify caller
                    raise ErrCode.MISSING_REQUIRED_FIELD.with_messages(
                        "access_key is required for bohr_app authentication"
                    )

                # Temporarily update record amount for remote billing
                original_amount = record.amount
                record.amount = amount_from_remote

                # Execute remote billing for the remaining amount
                await self._execute_remote_consume(record, access_key)

                # Restore original amount
                record.amount = original_amount

                # Update record in database with final state
                update_data = ConsumeRecordUpdate(consume_state=record.consume_state)
                await self.consume_repo.update_consume_record(record.id, update_data)
            else:
                logger.info(f"Non-bohr_app provider ({auth_provider}), skipping remote consume")
        else:
            logger.info("Consumption fully covered by virtual balance, no remote billing needed")

        # Update user consumption summary
        await self.consume_repo.increment_user_consume(
            user_id=user_id,
            auth_provider=auth_provider,
            amount=amount,
            consume_state=record.consume_state,
        )

        return record

    async def _execute_remote_consume(self, record: ConsumeRecord, access_key: str) -> None:
        """
        Execute remote billing API call (BohrApp)
        Args:
            record: Consumption record
            access_key: User's access key
        """
        try:
            logger.info(f"Executing remote consume for record {record.id}, amount: {record.amount}")
            headers = {
                "accessKey": access_key,
                "x-app-key": BOHRAPP_X_APP_KEY,
                "Content-Type": "application/json",
                "Accept": "*/*",
            }
            payload: dict[str, Any] = {
                "bizNo": record.biz_no,  # Use integer directly
                "changeType": BOHRAPP_DEFAULT_CHANGE_TYPE,
                "eventValue": record.amount,
                "skuId": record.sku_id or BOHRAPP_DEFAULT_SKU_ID,
                "scene": record.scene or BOHRAPP_DEFAULT_SCENE,
            }
            logger.debug(f"Remote consume request: {BOHRAPP_CONSUME_API}, payload: {payload}")
            response = requests.post(
                BOHRAPP_CONSUME_API,
                headers=headers,
                json=payload,
                timeout=10,
            )
            response_text = response.text
            logger.info(f"Remote consume response: status={response.status_code}, body={response_text}")
            # Optimize: Strict handling of BohrApp API response
            if response.status_code == 200:
                try:
                    response_data = response.json()
                except Exception as e:
                    update_data = ConsumeRecordUpdate(
                        consume_state="failed",
                        remote_error=f"Invalid JSON response: {e}",
                        remote_response=response_text,
                    )
                    logger.error(f"Remote consume JSON error: {e}")
                    await self.consume_repo.update_consume_record(record.id, update_data)
                    # Update local record object for consistency
                    record.consume_state = "failed"
                    record.remote_error = f"Invalid JSON response: {e}"
                    record.remote_response = response_text
                    return
                code = response_data.get("code")
                if code == 0:
                    update_data = ConsumeRecordUpdate(
                        consume_state="success",
                        remote_response=response_text,
                    )
                    await self.consume_repo.update_consume_record(record.id, update_data)
                    # Update local record object for consistency
                    record.consume_state = "success"
                    record.remote_response = response_text
                    logger.info(f"Remote consume succeeded for record {record.id}")
                else:
                    # Extract error information, handle possible dict or string format
                    error_data: dict[str, Any] | str = (
                        response_data.get("error") or response_data.get("msg") or "Unknown error from BohrApp API"
                    )

                    # If error_data is a dict, extract error message
                    if isinstance(error_data, dict):
                        error_message = error_data.get("msg") or error_data.get("message") or str(error_data)
                        # Serialize complete error details
                        error_details_json = json.dumps(error_data, ensure_ascii=False)
                    else:
                        error_message = str(error_data)
                        error_details_json = error_message

                    update_data = ConsumeRecordUpdate(
                        consume_state="failed",
                        remote_error=error_details_json,
                        remote_response=response_text,
                    )
                    await self.consume_repo.update_consume_record(record.id, update_data)
                    # Update local record object for consistency
                    record.consume_state = "failed"
                    record.remote_error = error_details_json  # Store complete error details (JSON string)
                    record.remote_response = response_text
                    logger.warning(f"Remote consume failed: {error_message}")

                    # Check if it's an insufficient balance error
                    if "余额不足" in error_message or "光子余额不足" in error_message:
                        raise ErrCode.INSUFFICIENT_BALANCE.with_messages(error_message)
            else:
                update_data = ConsumeRecordUpdate(
                    consume_state="failed",
                    remote_error=f"HTTP {response.status_code}: {response_text}",
                    remote_response=response_text,
                )
                await self.consume_repo.update_consume_record(record.id, update_data)
                # Update local record object for consistency
                record.consume_state = "failed"
                record.remote_error = f"HTTP {response.status_code}: {response_text}"
                record.remote_response = response_text
                logger.error(f"Remote consume HTTP error: {record.remote_error}")
        except ErrCodeError:
            # ErrCodeError (like INSUFFICIENT_BALANCE) has been handled and record updated above, re-raise directly
            raise
        except requests.RequestException as e:
            logger.error(f"Remote consume network error for record {record.id}: {e}")
            update_data = ConsumeRecordUpdate(
                consume_state="failed",
                remote_error=f"Network error: {str(e)}",
            )
            await self.consume_repo.update_consume_record(record.id, update_data)
            # Update local record object for consistency
            record.consume_state = "failed"
            record.remote_error = f"Network error: {str(e)}"
        except Exception as e:
            logger.error(f"Remote consume unexpected error for record {record.id}: {e}")
            update_data = ConsumeRecordUpdate(
                consume_state="failed",
                remote_error=f"Unexpected error: {str(e)}",
            )
            await self.consume_repo.update_consume_record(record.id, update_data)
            # Update local record object for consistency
            record.consume_state = "failed"
            record.remote_error = f"Unexpected error: {str(e)}"

    async def get_consume_record_by_id(self, record_id: UUID) -> ConsumeRecord | None:
        """Get consumption record"""
        return await self.consume_repo.get_consume_record_by_id(record_id)

    async def get_consume_record_by_biz_no(self, biz_no: int) -> ConsumeRecord | None:
        """Get consumption record by business ID (idempotency check)"""
        return await self.consume_repo.get_consume_record_by_biz_no(biz_no)

    async def get_user_consume_summary(self, user_id: str) -> UserConsumeSummary | None:
        """Get user consumption summary"""
        return await self.consume_repo.get_user_consume_summary(user_id)

    async def list_user_consume_records(self, user_id: str, limit: int = 100, offset: int = 0) -> list[ConsumeRecord]:
        """Get user consumption record list"""
        return await self.consume_repo.list_consume_records_by_user(user_id, limit, offset)


async def create_consume_for_chat(
    db: AsyncSession,
    user_id: str,
    auth_provider: str,
    amount: int,
    access_key: str | None = None,
    session_id: UUID | None = None,
    topic_id: UUID | None = None,
    message_id: UUID | None = None,
    description: str | None = None,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    total_tokens: int | None = None,
) -> ConsumeRecord:
    """
    Convenience function to create consumption record for chat

    Args:
        db: Database session
        user_id: User ID
        auth_provider: Authentication provider
        amount: Consumption amount
        access_key: Access key (required for bohr_app)
        session_id: Session ID
        topic_id: Topic ID
        message_id: Message ID
        description: Description
        input_tokens: Number of input tokens used
        output_tokens: Number of output tokens generated
        total_tokens: Total tokens (input + output)

    Returns:
        Consumption record
    """
    service = ConsumeService(db)
    return await service.create_consume_record(
        user_id=user_id,
        amount=amount,
        auth_provider=auth_provider,
        access_key=access_key,
        session_id=session_id,
        topic_id=topic_id,
        message_id=message_id,
        description=description or "Chat message consume",
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
    )

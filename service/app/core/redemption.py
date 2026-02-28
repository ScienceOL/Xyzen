"""Redemption service core module

Provides core business logic for redemption code generation and redemption
"""

import logging
import secrets
import string
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from app.common.code.error_code import ErrCode
from app.models.redemption import (
    RedemptionCode,
    RedemptionCodeCreate,
    RedemptionHistory,
    RedemptionHistoryCreate,
    UserWallet,
)
from app.repos.redemption import RedemptionRepository

logger = logging.getLogger(__name__)


class RedemptionService:
    """Core business logic layer for redemption service"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = RedemptionRepository(db)

    @staticmethod
    def generate_random_code(length: int = 12) -> str:
        """
        Generate a random redemption code.

        Args:
            length: Length of the code (default 12)

        Returns:
            A random alphanumeric code
        """
        # Use uppercase letters and digits for better readability
        # Exclude ambiguous characters like 0, O, I, 1
        alphabet = string.ascii_uppercase + string.digits
        alphabet = alphabet.replace("0", "").replace("O", "").replace("I", "").replace("1", "")
        code = "".join(secrets.choice(alphabet) for _ in range(length))
        return code

    async def create_redemption_code(
        self,
        amount: int,
        max_usage: int = 1,
        code: str | None = None,
        expires_at: datetime | None = None,
        description: str | None = None,
        is_active: bool = True,
        code_type: str = "credits",
        role_name: str | None = None,
        duration_days: int = 30,
    ) -> RedemptionCode:
        """
        Create a new redemption code (admin only).

        Args:
            amount: Virtual balance amount to credit
            max_usage: Maximum number of times this code can be used
            code: Custom code (if None, generates random code)
            expires_at: Expiration time (None means no expiration)
            description: Code description or notes
            is_active: Whether the code is active
            code_type: Code type ('credits' or 'subscription')
            role_name: Target subscription role name (required for subscription codes)
            duration_days: Subscription duration in days (for subscription codes)

        Returns:
            Created redemption code

        Raises:
            ErrCode.REDEMPTION_CODE_ALREADY_EXISTS: If code already exists
        """
        logger.info(f"Creating redemption code with amount: {amount}, max_usage: {max_usage}, type: {code_type}")

        # Validate code_type
        if code_type not in ("credits", "subscription"):
            raise ErrCode.INVALID_PARAMETER.with_messages("code_type must be 'credits' or 'subscription'")

        # Validate subscription-specific fields
        if code_type == "subscription":
            if not role_name:
                raise ErrCode.INVALID_PARAMETER.with_messages("role_name is required for subscription codes")
            if duration_days <= 0:
                raise ErrCode.INVALID_PARAMETER.with_messages("duration_days must be positive")

        # Generate code if not provided
        if code is None:
            # Keep generating until we find a unique code
            max_attempts = 10
            for attempt in range(max_attempts):
                code = self.generate_random_code()
                existing = await self.repo.get_redemption_code_by_code(code)
                if existing is None:
                    break
                logger.debug(f"Generated code {code} already exists, retrying... (attempt {attempt + 1})")
            else:
                raise ErrCode.UNKNOWN_ERROR.with_messages("Failed to generate unique redemption code")
        else:
            # Check if custom code already exists
            existing = await self.repo.get_redemption_code_by_code(code)
            if existing is not None:
                raise ErrCode.REDEMPTION_CODE_ALREADY_EXISTS.with_messages(f"Code '{code}' already exists")

        # Validate amount
        if code_type == "credits" and amount <= 0:
            raise ErrCode.INVALID_PARAMETER.with_messages("Amount must be positive")

        # Validate max_usage
        if max_usage <= 0:
            raise ErrCode.INVALID_PARAMETER.with_messages("Max usage must be positive")

        # Create redemption code
        code_data = RedemptionCodeCreate(
            code=code,
            amount=amount,
            max_usage=max_usage,
            is_active=is_active,
            expires_at=expires_at,
            description=description,
            code_type=code_type,
            role_name=role_name,
            duration_days=duration_days,
        )

        redemption_code = await self.repo.create_redemption_code(code_data)
        logger.info(f"Created redemption code: {redemption_code.id}, code: {redemption_code.code}")

        return redemption_code

    async def redeem_code(self, user_id: str, code: str) -> tuple[UserWallet, RedemptionHistory]:
        """
        Redeem a code for a user.

        Args:
            user_id: User ID who is redeeming
            code: Redemption code string

        Returns:
            Tuple of (updated wallet, redemption history)

        Raises:
            ErrCode.REDEMPTION_CODE_NOT_FOUND: If code doesn't exist
            ErrCode.REDEMPTION_CODE_INACTIVE: If code is not active
            ErrCode.REDEMPTION_CODE_EXPIRED: If code has expired
            ErrCode.REDEMPTION_CODE_MAX_USAGE: If code has reached max usage
            ErrCode.REDEMPTION_CODE_ALREADY_USED: If user has already used this code
        """
        logger.info(f"User {user_id} attempting to redeem code: {code}")

        # Get redemption code
        redemption_code = await self.repo.get_redemption_code_by_code(code)
        if redemption_code is None:
            raise ErrCode.REDEMPTION_CODE_NOT_FOUND.with_messages(f"Code '{code}' not found")

        # Check if code is active
        if not redemption_code.is_active:
            raise ErrCode.REDEMPTION_CODE_INACTIVE.with_messages(f"Code '{code}' is not active")

        # Check if code has expired
        if redemption_code.expires_at is not None:
            now = datetime.now(timezone.utc)
            if now > redemption_code.expires_at:
                raise ErrCode.REDEMPTION_CODE_EXPIRED.with_messages(f"Code '{code}' has expired")

        # Check if code has reached max usage
        if redemption_code.current_usage >= redemption_code.max_usage:
            raise ErrCode.REDEMPTION_CODE_MAX_USAGE.with_messages(f"Code '{code}' has reached maximum usage")

        # Check if user has already redeemed this code
        has_redeemed = await self.repo.check_user_redeemed_code(user_id, redemption_code.id)
        if has_redeemed:
            raise ErrCode.REDEMPTION_CODE_ALREADY_USED.with_messages(f"You have already redeemed code '{code}'")

        # All checks passed, proceed with redemption
        if redemption_code.code_type == "subscription":
            # Subscription code: upgrade user's subscription
            from app.core.subscription import SubscriptionService

            sub_service = SubscriptionService(self.db)
            role = await sub_service.repo.get_role_by_name(redemption_code.role_name or "")
            if role is None:
                raise ErrCode.INVALID_PARAMETER.with_messages(
                    f"Subscription role '{redemption_code.role_name}' not found"
                )

            expires_at = datetime.now(timezone.utc) + timedelta(days=redemption_code.duration_days)
            await sub_service.assign_role(user_id, role.id, expires_at)

            # Auto-claim monthly credits for the new subscription
            if role.monthly_credits > 0:
                await self.repo.credit_wallet_typed(
                    user_id,
                    role.monthly_credits,
                    "paid",
                    "subscription_monthly",
                    reference_id=str(redemption_code.id),
                )
                await sub_service.repo.update_last_credits_claimed(user_id)
                logger.info(f"Auto-claimed {role.monthly_credits} credits for user {user_id}")

            # Record history (amount=0 for subscription codes)
            wallet = await self.repo.get_or_create_user_wallet(user_id)
            history_data = RedemptionHistoryCreate(
                code_id=redemption_code.id,
                user_id=user_id,
                amount=0,
            )
            history = await self.repo.create_redemption_history(history_data)
            await self.repo.increment_code_usage(redemption_code.id)
            logger.info(
                f"User {user_id} subscription upgraded to {redemption_code.role_name} "
                f"for {redemption_code.duration_days} days via code {code}"
            )
        else:
            # Credits code: credit to paid balance
            wallet = await self.repo.credit_wallet_typed(
                user_id,
                redemption_code.amount,
                "paid",
                "redemption_code",
                reference_id=str(redemption_code.id),
            )
            logger.info(f"Credited {redemption_code.amount} to user {user_id}, new balance: {wallet.virtual_balance}")

            # 2. Create redemption history
            history_data = RedemptionHistoryCreate(
                code_id=redemption_code.id,
                user_id=user_id,
                amount=redemption_code.amount,
            )
            history = await self.repo.create_redemption_history(history_data)
            logger.info(f"Created redemption history: {history.id}")

            # 3. Increment code usage
            await self.repo.increment_code_usage(redemption_code.id)
            logger.info(
                f"Incremented code usage for {code}, "
                f"usage: {redemption_code.current_usage + 1}/{redemption_code.max_usage}"
            )

        return wallet, history

    async def get_user_wallet(self, user_id: str) -> UserWallet:
        """
        Get user wallet (create if not exists).

        Args:
            user_id: User ID

        Returns:
            User wallet
        """
        return await self.repo.get_or_create_user_wallet(user_id)

    async def get_user_redemption_history(
        self, user_id: str, limit: int = 100, offset: int = 0
    ) -> list[RedemptionHistory]:
        """
        Get user's redemption history.

        Args:
            user_id: User ID
            limit: Maximum number of records
            offset: Number of records to skip

        Returns:
            List of redemption history records
        """
        return await self.repo.get_user_redemption_history(user_id, limit, offset)

    async def list_redemption_codes(
        self, limit: int = 100, offset: int = 0, is_active: bool | None = None
    ) -> list[RedemptionCode]:
        """
        List redemption codes (admin only).

        Args:
            limit: Maximum number of codes
            offset: Number of codes to skip
            is_active: Filter by active status

        Returns:
            List of redemption codes
        """
        return await self.repo.list_redemption_codes(limit, offset, is_active)

    async def get_redemption_code_by_id(self, code_id: UUID) -> RedemptionCode | None:
        """
        Get redemption code by ID (admin only).

        Args:
            code_id: Code ID

        Returns:
            Redemption code or None
        """
        return await self.repo.get_redemption_code_by_id(code_id)

    async def deactivate_code(self, code_id: UUID) -> RedemptionCode:
        """
        Deactivate a redemption code (admin only).

        Args:
            code_id: Code ID to deactivate

        Returns:
            Updated redemption code

        Raises:
            ErrCode.REDEMPTION_CODE_NOT_FOUND: If code doesn't exist
        """
        from app.models.redemption import RedemptionCodeUpdate

        logger.info(f"Deactivating redemption code: {code_id}")

        code = await self.repo.get_redemption_code_by_id(code_id)
        if code is None:
            raise ErrCode.REDEMPTION_CODE_NOT_FOUND.with_messages(f"Code ID '{code_id}' not found")

        update_data = RedemptionCodeUpdate(is_active=False)
        updated_code = await self.repo.update_redemption_code(code_id, update_data)

        logger.info(f"Deactivated redemption code: {code_id}")
        return updated_code  # type: ignore

    async def credit_balance(
        self, user_id: str, amount: int, description: str = "积分充值", credit_type: str = "free"
    ) -> UserWallet:
        """
        Credit virtual balance directly to a user's wallet (for internal use).

        Args:
            user_id: User ID to credit
            amount: Amount to credit (must be positive)
            description: Description of the credit operation (used as source)
            credit_type: Credit category: "free", "paid", or "earned"

        Returns:
            Updated user wallet

        Raises:
            ErrCode.INVALID_PARAMETER: If amount is not positive
        """
        if amount <= 0:
            raise ErrCode.INVALID_PARAMETER.with_messages("Amount must be positive")

        logger.info(f"Crediting {amount} ({credit_type}) to user {user_id}: {description}")
        wallet = await self.repo.credit_wallet_typed(user_id, amount, credit_type, description)
        logger.info(f"Credited {amount} to user {user_id}, new balance: {wallet.virtual_balance}")

        return wallet


# Convenience function for easy access
async def redeem_code_for_user(db: AsyncSession, user_id: str, code: str) -> tuple[UserWallet, RedemptionHistory]:
    """
    Convenience function to redeem a code for a user.

    Args:
        db: Database session
        user_id: User ID
        code: Redemption code

    Returns:
        Tuple of (wallet, history)
    """
    service = RedemptionService(db)
    return await service.redeem_code(user_id, code)

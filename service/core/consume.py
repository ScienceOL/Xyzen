"""消费服务核心模块

提供消费记录、远程扣费、统计等核心业务逻辑
"""

import logging
from typing import List, Optional
from uuid import UUID

import requests
from sqlmodel.ext.asyncio.session import AsyncSession

from models.consume import ConsumeRecord, UserConsumeSummary
from repository.consume_repository import ConsumeRepository

logger = logging.getLogger(__name__)

# BohrApp 消费服务配置
BOHRAPP_CONSUME_API = "https://openapi.dp.tech/openapi/v1/api/integral/consume"
BOHRAPP_X_APP_KEY = "xyzen-uuid1760783737"
BOHRAPP_DEFAULT_SKU_ID = 10049
BOHRAPP_DEFAULT_SCENE = "appCustomizeCharge"
BOHRAPP_DEFAULT_CHANGE_TYPE = 1


class ConsumeService:
    """消费服务核心业务逻辑层"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = ConsumeRepository(db)

    async def create_consume_record(
        self,
        user_id: str,
        amount: int,
        auth_provider: str,
        access_key: Optional[str] = None,
        sku_id: Optional[int] = None,
        scene: Optional[str] = None,
        session_id: Optional[UUID] = None,
        topic_id: Optional[UUID] = None,
        message_id: Optional[UUID] = None,
        description: Optional[str] = None,
    ) -> ConsumeRecord:
        """
        创建消费记录并执行远程扣费（如果需要）

        Args:
            user_id: 用户ID
            amount: 消费金额
            auth_provider: 认证提供商
            access_key: 访问密钥（bohr_app时必需）
            sku_id: SKU ID
            scene: 消费场景
            session_id: 关联的会话ID
            topic_id: 关联的主题ID
            message_id: 关联的消息ID
            description: 消费描述

        Returns:
            创建的消费记录
        """
        logger.info(f"Creating consume record for user {user_id}, amount: {amount}, provider: {auth_provider}")

        # 创建消费记录（初始状态为 pending）
        record = ConsumeRecord(
            user_id=user_id,
            amount=amount,
            auth_provider=auth_provider,
            sku_id=sku_id,
            scene=scene,
            session_id=session_id,
            topic_id=topic_id,
            message_id=message_id,
            description=description,
            consume_state="pending",
        )

        # 保存到数据库
        record = await self.repo.create_consume_record(record)

        # 仅在 bohr_app 认证时执行远程扣费
        if auth_provider.lower() == "bohr_app":
            if not access_key:
                logger.warning(f"Missing access_key for bohr_app consume, record {record.id} stays pending")
                return record

            # 执行远程扣费
            await self._execute_remote_consume(record, access_key)
        else:
            logger.info(f"Non-bohr_app provider ({auth_provider}), skipping remote consume")

        # 更新用户消费汇总
        await self.repo.increment_user_consume(
            user_id=user_id,
            auth_provider=auth_provider,
            amount=amount,
            consume_state=record.consume_state,
        )

        return record

    async def _execute_remote_consume(self, record: ConsumeRecord, access_key: str) -> None:
        """
        执行远程扣费接口调用（BohrApp）
        Args:
            record: 消费记录
            access_key: 用户的访问密钥
        """
        try:
            logger.info(f"Executing remote consume for record {record.id}, amount: {record.amount}")
            headers = {
                "accessKey": access_key,
                "x-app-key": BOHRAPP_X_APP_KEY,
                "Content-Type": "application/json",
                "Accept": "*/*",
            }
            payload = {
                "bizNo": record.biz_no,  # 现在直接使用整数
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
            # 优化：严格处理BohrApp接口返回
            if response.status_code == 200:
                try:
                    response_data = response.json()
                except Exception as e:
                    record.consume_state = "failed"
                    record.remote_error = f"Invalid JSON response: {e}"
                    record.remote_response = response_text
                    logger.error(f"Remote consume JSON error: {e}")
                    await self.repo.update_consume_record(record)
                    return
                code = response_data.get("code")
                if code == 0:
                    record.consume_state = "success"
                    record.remote_response = response_text
                    logger.info(f"Remote consume succeeded for record {record.id}")
                else:
                    # 优先使用error字段，其次msg
                    error_msg = (
                        response_data.get("error") or response_data.get("msg") or "Unknown error from BohrApp API"
                    )
                    record.consume_state = "failed"
                    record.remote_error = error_msg
                    record.remote_response = response_text
                    logger.warning(f"Remote consume failed: {error_msg}")
            else:
                record.consume_state = "failed"
                record.remote_error = f"HTTP {response.status_code}: {response_text}"
                record.remote_response = response_text
                logger.error(f"Remote consume HTTP error: {record.remote_error}")
        except requests.RequestException as e:
            logger.error(f"Remote consume network error for record {record.id}: {e}")
            record.consume_state = "failed"
            record.remote_error = f"Network error: {str(e)}"
        except Exception as e:
            logger.error(f"Remote consume unexpected error for record {record.id}: {e}")
            record.consume_state = "failed"
            record.remote_error = f"Unexpected error: {str(e)}"
        finally:
            await self.repo.update_consume_record(record)

    async def get_consume_record_by_id(self, record_id: UUID) -> Optional[ConsumeRecord]:
        """获取消费记录"""
        return await self.repo.get_consume_record_by_id(record_id)

    async def get_consume_record_by_biz_no(self, biz_no: int) -> Optional[ConsumeRecord]:
        """通过业务ID获取消费记录（幂等检查）"""
        return await self.repo.get_consume_record_by_biz_no(biz_no)

    async def get_user_consume_summary(self, user_id: str) -> Optional[UserConsumeSummary]:
        """获取用户消费汇总"""
        return await self.repo.get_user_consume_summary(user_id)

    async def list_user_consume_records(self, user_id: str, limit: int = 100, offset: int = 0) -> List[ConsumeRecord]:
        """获取用户消费记录列表"""
        return await self.repo.list_consume_records_by_user(user_id, limit, offset)


async def create_consume_for_chat(
    db: AsyncSession,
    user_id: str,
    auth_provider: str,
    amount: int,
    access_key: Optional[str] = None,
    session_id: Optional[UUID] = None,
    topic_id: Optional[UUID] = None,
    message_id: Optional[UUID] = None,
    description: Optional[str] = None,
) -> ConsumeRecord:
    """
    为对话创建消费记录的便捷函数

    Args:
        db: 数据库会话
        user_id: 用户ID
        auth_provider: 认证提供商
        amount: 消费金额
        access_key: 访问密钥（bohr_app时必需）
        session_id: 会话ID
        topic_id: 主题ID
        message_id: 消息ID
        description: 描述

    Returns:
        消费记录
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
    )

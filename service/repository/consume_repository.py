"""消费记录 Repository

提供消费记录和用户消费汇总的数据访问接口
"""

import logging
from typing import List, Optional
from uuid import UUID

from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from models.consume import ConsumeRecord, UserConsumeSummary

logger = logging.getLogger(__name__)


class ConsumeRepository:
    """消费记录数据访问层"""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ========== ConsumeRecord CRUD 操作 ==========

    async def create_consume_record(self, record: ConsumeRecord) -> ConsumeRecord:
        """创建消费记录"""
        self.db.add(record)
        await self.db.commit()
        await self.db.refresh(record)
        logger.info(f"Created consume record: {record.id} for user {record.user_id}, amount: {record.amount}")
        return record

    async def get_consume_record_by_id(self, record_id: UUID) -> Optional[ConsumeRecord]:
        """通过ID获取消费记录"""
        result = await self.db.exec(select(ConsumeRecord).where(ConsumeRecord.id == record_id))
        return result.one_or_none()

    async def get_consume_record_by_biz_no(self, biz_no: int) -> Optional[ConsumeRecord]:
        """通过业务ID获取消费记录（用于幂等检查）"""
        result = await self.db.exec(select(ConsumeRecord).where(ConsumeRecord.biz_no == biz_no))
        return result.one_or_none()

    async def update_consume_record(self, record: ConsumeRecord) -> ConsumeRecord:
        """更新消费记录"""
        self.db.add(record)
        await self.db.commit()
        await self.db.refresh(record)
        logger.info(f"Updated consume record: {record.id}")
        return record

    async def list_consume_records_by_user(
        self, user_id: str, limit: int = 100, offset: int = 0
    ) -> List[ConsumeRecord]:
        """获取用户的消费记录列表"""
        result = await self.db.exec(
            select(ConsumeRecord)
            .where(ConsumeRecord.user_id == user_id)
            .order_by(ConsumeRecord.created_at.desc())  # type: ignore
            .limit(limit)
            .offset(offset)
        )
        return list(result.all())

    async def list_consume_records_by_session(self, session_id: UUID) -> List[ConsumeRecord]:
        """获取会话的消费记录列表"""
        result = await self.db.exec(
            select(ConsumeRecord)
            .where(ConsumeRecord.session_id == session_id)
            .order_by(ConsumeRecord.created_at.desc())  # type: ignore
        )
        return list(result.all())

    async def list_consume_records_by_topic(self, topic_id: UUID) -> List[ConsumeRecord]:
        """获取主题的消费记录列表"""
        result = await self.db.exec(
            select(ConsumeRecord)
            .where(ConsumeRecord.topic_id == topic_id)
            .order_by(ConsumeRecord.created_at.desc())  # type: ignore
        )
        return list(result.all())

    # ========== UserConsumeSummary CRUD 操作 ==========

    async def get_user_consume_summary(self, user_id: str) -> Optional[UserConsumeSummary]:
        """获取用户消费汇总"""
        result = await self.db.exec(select(UserConsumeSummary).where(UserConsumeSummary.user_id == user_id))
        return result.one_or_none()

    async def create_user_consume_summary(self, summary: UserConsumeSummary) -> UserConsumeSummary:
        """创建用户消费汇总"""
        self.db.add(summary)
        await self.db.commit()
        await self.db.refresh(summary)
        logger.info(f"Created user consume summary for user {summary.user_id}")
        return summary

    async def update_user_consume_summary(self, summary: UserConsumeSummary) -> UserConsumeSummary:
        """更新用户消费汇总"""
        self.db.add(summary)
        await self.db.commit()
        await self.db.refresh(summary)
        logger.info(f"Updated user consume summary for user {summary.user_id}")
        return summary

    async def increment_user_consume(
        self,
        user_id: str,
        auth_provider: str,
        amount: int,
        consume_state: str = "pending",
    ) -> UserConsumeSummary:
        """
        增加用户消费统计

        Args:
            user_id: 用户ID
            auth_provider: 认证提供商
            amount: 消费金额
            consume_state: 消费状态

        Returns:
            更新后的用户消费汇总
        """
        summary = await self.get_user_consume_summary(user_id)

        success = 1 if consume_state == "success" else 0
        failed = 1 if consume_state == "failed" else 0

        if summary is None:
            summary = UserConsumeSummary(
                user_id=user_id,
                auth_provider=auth_provider,
                total_amount=amount,
                total_count=1,
                success_count=success,
                failed_count=failed,
            )
            return await self.create_user_consume_summary(summary)
        else:
            summary.total_amount += amount
            summary.total_count += 1
            summary.success_count += success
            summary.failed_count += failed
            return await self.update_user_consume_summary(summary)

    # ========== 统计查询 ==========

    async def get_total_consume_by_user(self, user_id: str) -> int:
        """获取用户的总消费金额"""
        result = await self.db.exec(select(func.sum(ConsumeRecord.amount)).where(ConsumeRecord.user_id == user_id))
        total = result.one()
        return total or 0

    async def get_consume_count_by_user(self, user_id: str) -> int:
        """获取用户的消费次数"""
        result = await self.db.exec(
            select(func.count()).select_from(ConsumeRecord).where(ConsumeRecord.user_id == user_id)
        )
        return result.one() or 0

    async def get_remote_consume_success_count(self, user_id: str) -> int:
        """获取用户远程扣费成功次数（即成功状态的消费记录）"""
        result = await self.db.exec(
            select(func.count())
            .select_from(ConsumeRecord)
            .where(
                ConsumeRecord.user_id == user_id,
                ConsumeRecord.consume_state == "success",
            )
        )
        return result.one() or 0

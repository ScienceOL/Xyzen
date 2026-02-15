from uuid import UUID

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.chat_share import ChatShare, ShareStatus


class ChatShareRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(self, share: ChatShare) -> ChatShare:
        self.db.add(share)
        await self.db.flush()
        await self.db.refresh(share)
        return share

    async def get_by_id(self, share_id: UUID) -> ChatShare | None:
        return await self.db.get(ChatShare, share_id)

    async def get_by_token(self, token: str) -> ChatShare | None:
        stmt = select(ChatShare).where(ChatShare.token == token)
        result = await self.db.exec(stmt)
        return result.first()

    async def get_by_user(self, user_id: str) -> list[ChatShare]:
        stmt = select(ChatShare).where(ChatShare.user_id == user_id).order_by(ChatShare.created_at.desc())
        result = await self.db.exec(stmt)
        return list(result.all())

    async def update_status(self, share_id: UUID, status: ShareStatus) -> ChatShare | None:
        share = await self.db.get(ChatShare, share_id)
        if not share:
            return None
        share.status = status
        self.db.add(share)
        await self.db.flush()
        await self.db.refresh(share)
        return share

    async def increment_use_count(self, share_id: UUID) -> None:
        share = await self.db.get(ChatShare, share_id)
        if share:
            share.use_count += 1
            self.db.add(share)
            await self.db.flush()

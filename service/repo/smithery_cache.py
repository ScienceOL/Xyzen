import datetime as dt
from typing import Any, Dict, Optional

from models.smithery_cache import SmitheryServersCache as CacheModel
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession


class SmitheryCacheRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_key(self, key: str) -> Optional[CacheModel]:
        stmt = select(CacheModel).where(CacheModel.key == key)
        res = await self.db.exec(stmt)
        return res.first()

    async def upsert(
        self,
        *,
        key: str,
        params: Dict[str, Any] | None,
        data: Dict[str, Any],
        ttl_seconds: int,
    ) -> CacheModel:
        # Use timezone-aware now then strip tzinfo to keep naive UTC
        now = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
        expires_at = now + dt.timedelta(seconds=ttl_seconds)

        existing = await self.get_by_key(key)
        if existing:
            existing.params = params
            existing.data = data
            existing.updated_at = now
            existing.expires_at = expires_at
            await self.db.flush()
            await self.db.refresh(existing)
            return existing

        rec = CacheModel(key=key, params=params, data=data, expires_at=expires_at)
        self.db.add(rec)
        await self.db.flush()
        await self.db.refresh(rec)
        return rec

    async def increment_hits(self, record: CacheModel) -> None:
        record.hits = (record.hits or 0) + 1
        record.updated_at = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
        await self.db.flush()

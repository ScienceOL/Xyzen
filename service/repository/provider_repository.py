"""
This module contains the repository class for database operations related to the Provider model.
"""

import logging
from typing import List

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from models.provider import Provider

logger = logging.getLogger(__name__)


class ProviderRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_all_providers(self) -> List[Provider]:
        """Fetches all providers from the database."""
        logger.debug("Fetching all providers from the database")
        result = await self.db.exec(select(Provider))
        providers = result.all()
        logger.info(f"Found {len(providers)} providers in the database.")
        return list(providers)

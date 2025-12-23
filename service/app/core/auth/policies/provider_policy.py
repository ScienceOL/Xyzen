from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from app.common.code import ErrCode
from app.models.provider import Provider
from app.repos.provider import ProviderRepository

from .resource_policy import ResourcePolicyBase


class ProviderPolicy(ResourcePolicyBase[Provider]):
    def __init__(self, db: AsyncSession) -> None:
        self.provider_repo = ProviderRepository(db)

    async def authorize_read(self, resource_id: UUID, user_id: str) -> Provider:
        provider = await self.provider_repo.get_provider_by_id(resource_id)
        if not provider:
            raise ErrCode.PROVIDER_NOT_FOUND.with_messages(f"Provider {resource_id} not found")
        if provider.user_id == user_id or provider.is_system:
            return provider

        raise ErrCode.PROVIDER_ACCESS_DENIED.with_messages("Provider access denied")

    async def authorize_write(self, resource_id: UUID, user_id: str) -> Provider:
        provider = await self.provider_repo.get_provider_by_id(resource_id)
        if not provider:
            raise ErrCode.PROVIDER_NOT_FOUND.with_messages(f"Provider {resource_id} not found")

        if provider.is_system:
            raise ErrCode.PROVIDER_SYSTEM_READONLY.with_messages("System provider cannot be modified")

        if provider.user_id == user_id:
            return provider

        raise ErrCode.PROVIDER_NOT_OWNED.with_messages("Provider access denied")

    async def authorize_delete(self, resource_id: UUID, user_id: str) -> Provider:
        provider = await self.provider_repo.get_provider_by_id(resource_id)
        if not provider:
            raise ErrCode.PROVIDER_NOT_FOUND.with_messages(f"Provider {resource_id} not found")

        if provider.is_system:
            raise ErrCode.PROVIDER_SYSTEM_READONLY.with_messages("System provider cannot be modified")

        if provider.user_id == user_id:
            return provider

        raise ErrCode.PROVIDER_NOT_OWNED.with_messages("Provider access denied")

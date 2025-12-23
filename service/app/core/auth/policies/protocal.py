from uuid import UUID
from typing import Protocol, TypeVar, runtime_checkable

T = TypeVar("T", covariant=True)


@runtime_checkable
class ResourcePolicyProto(Protocol[T]):
    async def authorize_read(self, resource_id: UUID, user_id: str) -> T | None: ...
    async def authorize_write(self, resource_id: UUID, user_id: str) -> T | None: ...
    async def authorize_delete(self, resource_id: UUID, user_id: str) -> T | None: ...

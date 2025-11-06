from abc import ABC, abstractmethod
from typing import Generic, TypeVar
from uuid import UUID

T = TypeVar("T")


class ResourcePolicyBase(ABC, Generic[T]):
    @abstractmethod
    async def authorize_read(self, resource_id: UUID, user_id: str) -> T: ...
    @abstractmethod
    async def authorize_write(self, resource_id: UUID, user_id: str) -> T: ...
    @abstractmethod
    async def authorize_delete(self, resource_id: UUID, user_id: str) -> T: ...

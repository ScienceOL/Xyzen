from typing import Generic, TypeVar

from polyfactory.factories.pydantic_factory import ModelFactory
from sqlmodel import SQLModel

T = TypeVar("T", bound=SQLModel)


class BaseFactory(Generic[T], ModelFactory[T]):
    """Base factory for all SQLModel models."""

    __is_base_factory__ = True

from fastapi import Depends
from sqlmodel.ext.asyncio.session import AsyncSession
from middleware.database import get_session
from . import AuthorizationService


def get_auth_service(db: AsyncSession = Depends(get_session)) -> AuthorizationService:
    """FastAPI dependency for authorization service"""
    return AuthorizationService(db)

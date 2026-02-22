from fastapi import APIRouter

from app.configs import configs
from app.core.version import VersionInfo, get_version_info
from app.ee import edition

router = APIRouter(prefix="/system")


@router.get("/version", response_model=dict[str, str])
async def get_system_version() -> dict[str, str]:
    """
    Get the backend system version information.

    Returns version, commit SHA, build time, and backend framework.
    """
    info: VersionInfo = get_version_info()
    return info.to_dict()


@router.get("/edition")
async def get_system_edition() -> dict[str, str]:
    """Return the current deployment edition (``ce`` or ``ee``)."""
    return {"edition": edition()}


@router.get("/region")
async def get_system_region() -> dict[str, str]:
    """Return the deployment region."""
    return {"region": configs.Region}

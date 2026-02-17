"""Notification REST API endpoints."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.configs import configs
from app.infra.database import get_session
from app.middleware.auth import get_current_user
from app.models.push_subscription import PushSubscription
from app.repos.push_subscription import PushSubscriptionRepository

router = APIRouter(tags=["notifications"])


# --- Response / Request models -----------------------------------------------


class NotificationConfigResponse(BaseModel):
    enabled: bool
    app_identifier: str
    api_url: str
    ws_url: str
    vapid_public_key: str


class PushSubscriptionRequest(BaseModel):
    endpoint: str
    keys: dict[str, str]  # {p256dh: "...", auth: "..."}
    user_agent: str = ""


class PushSubscriptionResponse(BaseModel):
    success: bool


# --- Endpoints ----------------------------------------------------------------


@router.get("/config", response_model=NotificationConfigResponse)
async def get_notification_config() -> NotificationConfigResponse:
    """Public endpoint — returns whether notifications are enabled and the Novu app identifier."""
    return NotificationConfigResponse(
        enabled=configs.Novu.Enable,
        app_identifier=configs.Novu.AppIdentifier if configs.Novu.Enable else "",
        api_url=configs.Novu.PublicApiUrl if configs.Novu.Enable else "",
        ws_url=configs.Novu.PublicWsUrl if configs.Novu.Enable else "",
        vapid_public_key=configs.Novu.VapidPublicKey,
    )


@router.post("/push-subscription", response_model=PushSubscriptionResponse)
async def register_push_subscription(
    body: PushSubscriptionRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> PushSubscriptionResponse:
    """Register a Web Push subscription for the authenticated user."""
    repo = PushSubscriptionRepository(db)
    sub = PushSubscription(
        user_id=user_id,
        endpoint=body.endpoint,
        keys_p256dh=body.keys.get("p256dh", ""),
        keys_auth=body.keys.get("auth", ""),
        user_agent=body.user_agent,
    )
    await repo.upsert(sub)
    await db.commit()
    return PushSubscriptionResponse(success=True)


@router.delete("/push-subscription", response_model=PushSubscriptionResponse)
async def remove_push_subscription(
    body: PushSubscriptionRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> PushSubscriptionResponse:
    """Remove a Web Push subscription for the authenticated user."""
    repo = PushSubscriptionRepository(db)
    ok = await repo.delete_by_endpoint(body.endpoint)
    await db.commit()
    return PushSubscriptionResponse(success=ok)

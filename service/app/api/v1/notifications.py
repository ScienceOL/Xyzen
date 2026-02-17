"""Notification REST API endpoints."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.configs import configs
from app.middleware.auth import get_current_user

router = APIRouter(tags=["notifications"])


# --- Response / Request models -----------------------------------------------


class NotificationConfigResponse(BaseModel):
    enabled: bool
    app_identifier: str
    api_url: str
    ws_url: str


class DeviceTokenRequest(BaseModel):
    token: str
    provider_id: str = "fcm"


class DeviceTokenResponse(BaseModel):
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
    )


@router.post("/device-token", response_model=DeviceTokenResponse)
async def register_device_token(
    body: DeviceTokenRequest,
    user_id: str = Depends(get_current_user),
) -> DeviceTokenResponse:
    """Register an FCM push token for the authenticated user."""
    from app.core.notification.service import NotificationService

    svc = NotificationService()
    ok = svc.set_device_token(subscriber_id=user_id, token=body.token, provider_id=body.provider_id)
    return DeviceTokenResponse(success=ok)


@router.delete("/device-token", response_model=DeviceTokenResponse)
async def remove_device_token(
    body: DeviceTokenRequest,
    user_id: str = Depends(get_current_user),
) -> DeviceTokenResponse:
    """Remove an FCM push token for the authenticated user."""
    from app.core.notification.service import NotificationService

    svc = NotificationService()
    ok = svc.remove_device_token(subscriber_id=user_id, token=body.token, provider_id=body.provider_id)
    return DeviceTokenResponse(success=ok)

"""Payment API endpoints for checkout, status polling, and webhooks."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.payment.airwallex_client import AirwallexClient
from app.core.payment.service import PaymentService
from app.infra.database import get_session as get_db_session
from app.middleware.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["payment"])


# ---------- Request / Response Schemas ----------


class CheckoutRequest(BaseModel):
    plan_name: str = Field(description="Plan to subscribe: standard, professional, or ultra")
    payment_method: str = Field(default="alipaycn", description="Payment method: alipaycn, wechatpay")


class CheckoutResponse(BaseModel):
    order_id: str
    qr_code_url: str
    amount: int
    currency: str


class OrderStatusResponse(BaseModel):
    order_id: str
    status: str
    fulfilled: bool


# ---------- Endpoints ----------


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    body: CheckoutRequest,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> CheckoutResponse:
    """Create a payment checkout for a subscription plan.

    Returns a QR code URL for the user to scan and pay.
    """
    logger.info(f"User {current_user} creating checkout: plan={body.plan_name}, method={body.payment_method}")

    try:
        service = PaymentService(db)
        result = await service.create_subscription_checkout(
            user_id=current_user,
            plan_name=body.plan_name,
            payment_method=body.payment_method,
        )
        await db.commit()

        return CheckoutResponse(**result)

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Checkout failed for user {current_user}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create checkout",
        )


@router.get("/orders/{order_id}/status", response_model=OrderStatusResponse)
async def get_order_status(
    order_id: UUID,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> OrderStatusResponse:
    """Poll the status of a payment order.

    If the order is still pending, the backend will also check
    with Airwallex for the latest status.
    """
    try:
        service = PaymentService(db)
        result = await service.get_order_status(order_id, current_user)
        await db.commit()

        return OrderStatusResponse(**result)

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Status check failed for order {order_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to check order status",
        )


@router.post("/webhook/airwallex", status_code=200)
async def airwallex_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Receive Airwallex webhook notifications.

    Verifies HMAC-SHA256 signature before processing.
    No user authentication required — uses webhook secret instead.
    """
    raw_body = await request.body()
    timestamp = request.headers.get("x-timestamp", "")
    signature = request.headers.get("x-signature", "")

    if not AirwallexClient.verify_webhook_signature(timestamp, raw_body, signature):
        logger.warning("Webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = await request.json()
        event_type = payload.get("name", "")
        data = payload.get("data", {}).get("object", {})

        logger.info(f"Webhook received: {event_type}")

        service = PaymentService(db)
        await service.handle_webhook(event_type, data)
        await db.commit()

        return {"status": "ok"}

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Webhook processing failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook processing failed",
        )

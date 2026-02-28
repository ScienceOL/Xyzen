"""Payment API endpoints for checkout, capture, status polling, and webhooks."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.payment.provider import get_payment_provider
from app.core.payment.service import PaymentService
from app.infra.database import get_session as get_db_session
from app.middleware.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["payment"])


# ---------- Request / Response Schemas ----------


class CheckoutRequest(BaseModel):
    plan_name: str = Field(description="Plan to subscribe: standard, professional, or ultra")
    payment_method: str = Field(default="paypal", description="Payment method: paypal, alipaycn, wechatpay")


class TopUpCheckoutRequest(BaseModel):
    credits: int = Field(description="Number of credits to purchase (must be a positive multiple of credits_per_unit)")
    payment_method: str = Field(default="paypal", description="Payment method: paypal, alipaycn, wechatpay")


class SandboxAddonCheckoutRequest(BaseModel):
    quantity: int = Field(description="Number of extra sandbox slots to purchase", gt=0)
    payment_method: str = Field(default="paypal", description="Payment method: paypal, alipaycn, wechatpay")


class FullAccessCheckoutRequest(BaseModel):
    payment_method: str = Field(default="paypal", description="Payment method: paypal, alipaycn, wechatpay")


class CheckoutResponse(BaseModel):
    order_id: str
    provider_order_id: str = ""
    flow_type: str = "paypal_sdk"
    qr_code_url: str = ""
    approval_url: str = ""
    amount: int
    currency: str


class CaptureRequest(BaseModel):
    paypal_order_id: str = Field(default="", description="PayPal order ID (from JS SDK onApprove)")


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

    For PayPal: returns provider_order_id for JS SDK + approval_url.
    For Airwallex: returns qr_code_url for scan-to-pay.
    """
    logger.info("User %s creating checkout: plan=%s, method=%s", current_user, body.plan_name, body.payment_method)

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
        logger.error("Checkout failed for user %s: %s", current_user, e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create checkout",
        )


@router.post("/checkout/topup", response_model=CheckoutResponse)
async def create_topup_checkout(
    body: TopUpCheckoutRequest,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> CheckoutResponse:
    """Create a payment checkout to purchase top-up credits."""
    logger.info(
        "User %s creating top-up checkout: credits=%s, method=%s", current_user, body.credits, body.payment_method
    )

    try:
        service = PaymentService(db)
        result = await service.create_topup_checkout(
            user_id=current_user,
            credits=body.credits,
            payment_method=body.payment_method,
        )
        await db.commit()

        return CheckoutResponse(**result)

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error("Top-up checkout failed for user %s: %s", current_user, e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create top-up checkout",
        )


@router.post("/checkout/sandbox-addon", response_model=CheckoutResponse)
async def create_sandbox_addon_checkout(
    body: SandboxAddonCheckoutRequest,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> CheckoutResponse:
    """Create a payment checkout to purchase extra sandbox slots."""
    logger.info(
        "User %s creating sandbox add-on checkout: quantity=%s, method=%s",
        current_user,
        body.quantity,
        body.payment_method,
    )

    try:
        service = PaymentService(db)
        result = await service.create_sandbox_addon_checkout(
            user_id=current_user,
            quantity=body.quantity,
            payment_method=body.payment_method,
        )
        await db.commit()

        return CheckoutResponse(**result)

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error("Sandbox add-on checkout failed for user %s: %s", current_user, e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create sandbox add-on checkout",
        )


@router.post("/checkout/full-access", response_model=CheckoutResponse)
async def create_full_access_checkout(
    body: FullAccessCheckoutRequest,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> CheckoutResponse:
    """Create a payment checkout for a full model-access pass (30 days all models)."""
    logger.info("User %s creating full-access checkout: method=%s", current_user, body.payment_method)

    try:
        service = PaymentService(db)
        result = await service.create_full_access_checkout(
            user_id=current_user,
            payment_method=body.payment_method,
        )
        await db.commit()

        return CheckoutResponse(**result)

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error("Full-access checkout failed for user %s: %s", current_user, e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create full-access checkout",
        )


@router.post("/orders/{order_id}/capture", response_model=OrderStatusResponse)
async def capture_order(
    order_id: UUID,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> OrderStatusResponse:
    """Capture a payment order after user approval (e.g. PayPal popup).

    Called by the frontend after PayPal JS SDK's onApprove fires.
    For QR-based providers this acts as a status check.
    """
    try:
        service = PaymentService(db)
        result = await service.capture_order(order_id, current_user)
        await db.commit()

        return OrderStatusResponse(**result)

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error("Capture failed for order %s: %s", order_id, e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to capture order",
        )


@router.get("/orders/{order_id}/status", response_model=OrderStatusResponse)
async def get_order_status(
    order_id: UUID,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> OrderStatusResponse:
    """Poll the status of a payment order.

    If the order is still pending, the backend will check the
    payment provider for the latest status.
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
        logger.error("Status check failed for order %s: %s", order_id, e, exc_info=True)
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
    """
    raw_body = await request.body()
    wh_headers = {
        "x-timestamp": request.headers.get("x-timestamp", ""),
        "x-signature": request.headers.get("x-signature", ""),
    }

    provider = get_payment_provider("alipaycn")
    if not await provider.verify_webhook(wh_headers, raw_body):
        logger.warning("Airwallex webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = await request.json()
        event_type = payload.get("name", "")
        data = payload.get("data", {}).get("object", {})

        logger.info("Airwallex webhook received: %s", event_type)

        service = PaymentService(db)
        await service.handle_webhook("airwallex", event_type, data)
        await db.commit()

        return {"status": "ok"}

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error("Airwallex webhook processing failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook processing failed",
        )


@router.post("/webhook/paypal", status_code=200)
async def paypal_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Receive PayPal webhook notifications.

    Verifies signature via PayPal's verification API before processing.
    """
    raw_body = await request.body()
    wh_headers = {
        "paypal-auth-algo": request.headers.get("paypal-auth-algo", ""),
        "paypal-cert-url": request.headers.get("paypal-cert-url", ""),
        "paypal-transmission-id": request.headers.get("paypal-transmission-id", ""),
        "paypal-transmission-sig": request.headers.get("paypal-transmission-sig", ""),
        "paypal-transmission-time": request.headers.get("paypal-transmission-time", ""),
    }

    provider = get_payment_provider("paypal")
    if not await provider.verify_webhook(wh_headers, raw_body):
        logger.warning("PayPal webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = await request.json()
        event_type = payload.get("event_type", "")
        resource = payload.get("resource", {})

        logger.info("PayPal webhook received: %s", event_type)

        service = PaymentService(db)
        await service.handle_webhook("paypal", event_type, resource)
        await db.commit()

        return {"status": "ok"}

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error("PayPal webhook processing failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook processing failed",
        )

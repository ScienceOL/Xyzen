"""Payment business logic: checkout, fulfillment, and webhook handling."""

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.payment.airwallex_client import airwallex_client
from app.core.subscription import SubscriptionService
from app.core.user_events import broadcast_wallet_update
from app.configs import configs
from app.models.payment import PaymentOrderCreate
from app.repos.payment import PaymentRepository
from app.repos.redemption import RedemptionRepository
from app.repos.subscription import SubscriptionRepository

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------
# Pricing table (amounts in minor units: cents for USD, fen for CNY)
# ------------------------------------------------------------------

PLAN_PRICING: dict[str, dict[str, dict[str, int]]] = {
    "standard": {
        "CNY": {"amount": 2590, "credits": 3000},
        "USD": {"amount": 990, "credits": 5000},
    },
    "professional": {
        "CNY": {"amount": 8990, "credits": 10000},
        "USD": {"amount": 3690, "credits": 22000},
    },
    "ultra": {
        "CNY": {"amount": 26800, "credits": 60000},
        "USD": {"amount": 9990, "credits": 60000},
    },
}

# Map payment methods to their Airwallex type and flow
PAYMENT_METHOD_CONFIG: dict[str, dict[str, str]] = {
    "alipaycn": {"type": "alipaycn", "flow": "qrcode"},
    "wechatpay": {"type": "wechatpay", "flow": "qrcode"},
}


class PaymentService:
    """Orchestrates payment order creation, fulfillment, and status checks."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = PaymentRepository(db)

    async def create_subscription_checkout(
        self,
        user_id: str,
        plan_name: str,
        payment_method: str = "alipaycn",
    ) -> dict:
        """Create a subscription checkout: order → PaymentIntent → confirm QR.

        Returns:
            Dict with order_id, qr_code_url, amount, currency.
        """
        if plan_name not in PLAN_PRICING:
            raise HTTPException(status_code=400, detail=f"Unknown plan: {plan_name}")

        method_cfg = PAYMENT_METHOD_CONFIG.get(payment_method)
        if method_cfg is None:
            raise HTTPException(status_code=400, detail=f"Unsupported payment method: {payment_method}")

        # Determine currency based on payment method
        currency = "CNY" if payment_method in ("alipaycn", "wechatpay") else "USD"
        pricing = PLAN_PRICING[plan_name][currency]

        # 1. Create local order
        order = await self.repo.create_order(
            PaymentOrderCreate(
                user_id=user_id,
                order_type="subscription",
                plan_name=plan_name,
                amount=pricing["amount"],
                currency=currency,
                credits_amount=pricing["credits"],
                duration_days=30,
                payment_method=payment_method,
            )
        )

        # 2. Create PaymentIntent on Airwallex
        intent = await airwallex_client.create_payment_intent(
            amount=pricing["amount"],
            currency=currency,
            order_id=str(order.id),
            metadata={"user_id": user_id, "plan_name": plan_name},
            return_url=configs.Airwallex.ReturnUrl,
        )
        intent_id = intent["id"]

        # 3. Confirm to get QR code
        confirmation = await airwallex_client.confirm_payment_intent(
            intent_id=intent_id,
            payment_method_type=method_cfg["type"],
            flow=method_cfg["flow"],
        )

        # Extract QR code URL from next_action
        qr_code_url = ""
        next_action = confirmation.get("next_action", {})
        if next_action.get("type") == "render_qr_code":
            qr_code_url = next_action.get("data", {}).get("qr_code_url", "")
        elif next_action.get("url"):
            qr_code_url = next_action["url"]

        # 4. Save intent ID and QR to order
        await self.repo.set_intent_id_and_qr(order.id, intent_id, qr_code_url)

        logger.info(f"Checkout created: order={order.id}, intent={intent_id}")

        return {
            "order_id": str(order.id),
            "qr_code_url": qr_code_url,
            "amount": pricing["amount"],
            "currency": currency,
        }

    async def get_order_status(self, order_id: UUID, user_id: str) -> dict:
        """Get order status. If still pending, check Airwallex for updates.

        Returns:
            Dict with order_id, status, fulfilled.
        """
        order = await self.repo.get_order_by_id(order_id)
        if order is None:
            raise HTTPException(status_code=404, detail="Order not found")
        if order.user_id != user_id:
            raise HTTPException(status_code=403, detail="Not your order")

        # If still pending, poll Airwallex
        if order.status == "pending" and order.airwallex_intent_id:
            try:
                intent = await airwallex_client.get_payment_intent(order.airwallex_intent_id)
                remote_status = intent.get("status", "")
                if remote_status == "SUCCEEDED":
                    await self.repo.update_order_status(order.id, "succeeded")
                    await self._fulfill_order(order.id)
                    order.status = "succeeded"
                    order.fulfilled = True
                elif remote_status in ("CANCELLED", "EXPIRED"):
                    await self.repo.update_order_status(order.id, "failed")
                    order.status = "failed"
            except Exception:
                logger.warning(f"Failed to poll Airwallex for order {order_id}", exc_info=True)

        return {
            "order_id": str(order.id),
            "status": order.status,
            "fulfilled": order.fulfilled,
        }

    async def handle_webhook(self, event_type: str, data: dict) -> None:
        """Handle Airwallex webhook events.

        Only processes payment_intent.succeeded.
        """
        if event_type != "payment_intent.succeeded":
            logger.debug(f"Ignoring webhook event: {event_type}")
            return

        intent_id = data.get("id", "")
        if not intent_id:
            logger.warning("Webhook missing intent ID")
            return

        order = await self.repo.get_order_by_intent_id(intent_id)
        if order is None:
            logger.warning(f"No order found for intent {intent_id}")
            return

        await self.repo.update_order_status(order.id, "succeeded")
        await self._fulfill_order(order.id)

    async def _fulfill_order(self, order_id: UUID) -> None:
        """Fulfill a payment order: grant credits + upgrade subscription.

        Idempotent — checks the `fulfilled` flag before acting.
        """
        order = await self.repo.get_order_by_id(order_id)
        if order is None or order.fulfilled:
            return

        logger.info(f"Fulfilling order {order_id}: type={order.order_type}, plan={order.plan_name}")

        redemption_repo = RedemptionRepository(self.db)

        if order.order_type == "subscription":
            # 1. Upgrade subscription role
            sub_repo = SubscriptionRepository(self.db)
            role = await sub_repo.get_role_by_name(order.plan_name)
            if role is not None:
                sub_service = SubscriptionService(self.db)
                expires_at = datetime.now(timezone.utc) + timedelta(days=order.duration_days)
                await sub_service.assign_role(order.user_id, role.id, expires_at)

            # 2. Credit wallet
            if order.credits_amount > 0:
                wallet = await redemption_repo.credit_wallet_typed(
                    user_id=order.user_id,
                    amount=order.credits_amount,
                    credit_type="paid",
                    source="subscription_payment",
                    reference_id=str(order_id),
                )
                await broadcast_wallet_update(wallet)

        elif order.order_type == "topup":
            if order.credits_amount > 0:
                wallet = await redemption_repo.credit_wallet_typed(
                    user_id=order.user_id,
                    amount=order.credits_amount,
                    credit_type="paid",
                    source="topup_payment",
                    reference_id=str(order_id),
                )
                await broadcast_wallet_update(wallet)

        # 3. Mark fulfilled
        await self.repo.mark_fulfilled(order_id)
        logger.info(f"Order {order_id} fulfilled successfully")

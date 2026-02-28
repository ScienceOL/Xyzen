"""Payment business logic: checkout, fulfillment, and webhook handling.

Provider-agnostic — delegates to ``PaymentProvider`` implementations
for PayPal, Airwallex, or any future gateway.
"""

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession

from app.configs import configs
from app.core.payment.provider import get_payment_provider
from app.core.plan_catalog import get_full_access_pass_rate, get_plan_pricing, get_sandbox_addon_rate, get_topup_rate
from app.core.subscription import SubscriptionService
from app.core.user_events import broadcast_wallet_update
from app.models.payment import PaymentOrderCreate
from app.repos.payment import PaymentRepository
from app.repos.redemption import RedemptionRepository
from app.repos.subscription import SubscriptionRepository

logger = logging.getLogger(__name__)

# Map payment methods to their currency and provider hint
PAYMENT_METHOD_CONFIG: dict[str, dict[str, str]] = {
    "alipaycn": {"currency": "CNY", "provider": "airwallex"},
    "wechatpay": {"currency": "CNY", "provider": "airwallex"},
    "paypal": {"currency": "USD", "provider": "paypal"},
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
        payment_method: str = "paypal",
    ) -> dict:
        """Create a subscription checkout via the appropriate provider.

        Returns:
            Dict with order_id, flow_type, and provider-specific URLs.
        """
        method_cfg = PAYMENT_METHOD_CONFIG.get(payment_method)
        if method_cfg is None:
            raise HTTPException(status_code=400, detail=f"Unsupported payment method: {payment_method}")

        currency = method_cfg["currency"]
        pricing = get_plan_pricing(plan_name, currency)
        if pricing is None:
            raise HTTPException(status_code=400, detail=f"Unknown plan: {plan_name}")

        # 1. Create local order
        order = await self.repo.create_order(
            PaymentOrderCreate(
                user_id=user_id,
                order_type="subscription",
                plan_name=plan_name,
                amount=pricing.amount,
                currency=currency,
                credits_amount=pricing.credits,
                duration_days=30,
                payment_method=payment_method,
            )
        )

        # 2. Create order on payment provider
        provider = get_payment_provider(payment_method)
        result = await provider.create_order(
            amount=pricing.amount,
            currency=currency,
            order_id=str(order.id),
            metadata={"user_id": user_id, "plan_name": plan_name},
            return_url=configs.Payment.Airwallex.ReturnUrl,
        )

        # 3. Save provider reference to order
        await self.repo.set_provider_id_and_url(
            order.id,
            result.provider_order_id,
            result.qr_code_url or result.approval_url,
        )

        logger.info(
            "Checkout created: order=%s, provider_order=%s, flow=%s",
            order.id,
            result.provider_order_id,
            result.flow_type,
        )

        return {
            "order_id": str(order.id),
            "provider_order_id": result.provider_order_id,
            "flow_type": result.flow_type,
            "qr_code_url": result.qr_code_url,
            "approval_url": result.approval_url,
            "amount": pricing.amount,
            "currency": currency,
        }

    async def create_topup_checkout(
        self,
        user_id: str,
        credits: int,
        payment_method: str = "paypal",
    ) -> dict:
        """Create a top-up checkout to purchase credits.

        Returns:
            Dict with order_id, flow_type, and provider-specific URLs.
        """
        method_cfg = PAYMENT_METHOD_CONFIG.get(payment_method)
        if method_cfg is None:
            raise HTTPException(status_code=400, detail=f"Unsupported payment method: {payment_method}")

        currency = method_cfg["currency"]
        rate = get_topup_rate(currency)
        if rate is None:
            raise HTTPException(status_code=400, detail=f"Top-up not available for currency: {currency}")

        if credits <= 0 or credits % rate.credits_per_unit != 0:
            raise HTTPException(
                status_code=400,
                detail=f"Credits must be a positive multiple of {rate.credits_per_unit}",
            )

        units = credits // rate.credits_per_unit
        amount = units * rate.unit_amount

        order = await self.repo.create_order(
            PaymentOrderCreate(
                user_id=user_id,
                order_type="topup",
                amount=amount,
                currency=currency,
                credits_amount=credits,
                duration_days=0,
                payment_method=payment_method,
            )
        )

        provider = get_payment_provider(payment_method)
        result = await provider.create_order(
            amount=amount,
            currency=currency,
            order_id=str(order.id),
            metadata={"user_id": user_id, "credits": credits},
            return_url=configs.Payment.Airwallex.ReturnUrl,
        )

        await self.repo.set_provider_id_and_url(
            order.id,
            result.provider_order_id,
            result.qr_code_url or result.approval_url,
        )

        logger.info(
            "Top-up checkout created: order=%s, credits=%s, amount=%s %s",
            order.id,
            credits,
            amount,
            currency,
        )

        return {
            "order_id": str(order.id),
            "provider_order_id": result.provider_order_id,
            "flow_type": result.flow_type,
            "qr_code_url": result.qr_code_url,
            "approval_url": result.approval_url,
            "amount": amount,
            "currency": currency,
        }

    async def create_sandbox_addon_checkout(
        self,
        user_id: str,
        quantity: int,
        payment_method: str = "paypal",
    ) -> dict:
        """Create a sandbox add-on checkout.

        Returns:
            Dict with order_id, flow_type, and provider-specific URLs.
        """
        method_cfg = PAYMENT_METHOD_CONFIG.get(payment_method)
        if method_cfg is None:
            raise HTTPException(status_code=400, detail=f"Unsupported payment method: {payment_method}")

        currency = method_cfg["currency"]
        rate = get_sandbox_addon_rate(currency)
        if rate is None:
            raise HTTPException(status_code=400, detail=f"Sandbox add-on not available for currency: {currency}")

        if quantity <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be positive")

        # Verify user meets minimum plan requirement
        sub_repo = SubscriptionRepository(self.db)
        role = await sub_repo.get_user_role(user_id)
        if role is None or role.name == "free":
            raise HTTPException(
                status_code=403,
                detail=f"Sandbox add-on requires at least {rate.min_plan} plan",
            )

        from app.core.plan_catalog import get_plan_limits

        plan_limits = get_plan_limits()
        min_priority = plan_limits.get(rate.min_plan, plan_limits["standard"]).priority
        user_priority = plan_limits.get(role.name, plan_limits["free"]).priority
        if user_priority < min_priority:
            raise HTTPException(
                status_code=403,
                detail=f"Sandbox add-on requires at least {rate.min_plan} plan",
            )

        amount = quantity * rate.amount_per_sandbox

        order = await self.repo.create_order(
            PaymentOrderCreate(
                user_id=user_id,
                order_type="sandbox_addon",
                amount=amount,
                currency=currency,
                credits_amount=quantity,  # reuse field for quantity
                duration_days=0,
                payment_method=payment_method,
            )
        )

        provider = get_payment_provider(payment_method)
        result = await provider.create_order(
            amount=amount,
            currency=currency,
            order_id=str(order.id),
            metadata={"user_id": user_id, "quantity": quantity},
            return_url=configs.Payment.Airwallex.ReturnUrl,
        )

        await self.repo.set_provider_id_and_url(
            order.id,
            result.provider_order_id,
            result.qr_code_url or result.approval_url,
        )

        logger.info(
            "Sandbox add-on checkout created: order=%s, quantity=%s, amount=%s %s",
            order.id,
            quantity,
            amount,
            currency,
        )

        return {
            "order_id": str(order.id),
            "provider_order_id": result.provider_order_id,
            "flow_type": result.flow_type,
            "qr_code_url": result.qr_code_url,
            "approval_url": result.approval_url,
            "amount": amount,
            "currency": currency,
        }

    async def create_full_access_checkout(
        self,
        user_id: str,
        payment_method: str = "paypal",
    ) -> dict:
        """Create a checkout for a full model-access pass (30 days).

        Returns:
            Dict with order_id, flow_type, and provider-specific URLs.
        """
        method_cfg = PAYMENT_METHOD_CONFIG.get(payment_method)
        if method_cfg is None:
            raise HTTPException(status_code=400, detail=f"Unsupported payment method: {payment_method}")

        currency = method_cfg["currency"]
        rate = get_full_access_pass_rate(currency)
        if rate is None:
            raise HTTPException(status_code=400, detail=f"Full access pass not available for currency: {currency}")

        order = await self.repo.create_order(
            PaymentOrderCreate(
                user_id=user_id,
                order_type="full_access",
                amount=rate.amount,
                currency=currency,
                credits_amount=0,
                duration_days=rate.duration_days,
                payment_method=payment_method,
            )
        )

        provider = get_payment_provider(payment_method)
        result = await provider.create_order(
            amount=rate.amount,
            currency=currency,
            order_id=str(order.id),
            metadata={"user_id": user_id, "duration_days": rate.duration_days},
            return_url=configs.Payment.Airwallex.ReturnUrl,
        )

        await self.repo.set_provider_id_and_url(
            order.id,
            result.provider_order_id,
            result.qr_code_url or result.approval_url,
        )

        logger.info(
            "Full access pass checkout created: order=%s, amount=%s %s, days=%s",
            order.id,
            rate.amount,
            currency,
            rate.duration_days,
        )

        return {
            "order_id": str(order.id),
            "provider_order_id": result.provider_order_id,
            "flow_type": result.flow_type,
            "qr_code_url": result.qr_code_url,
            "approval_url": result.approval_url,
            "amount": rate.amount,
            "currency": currency,
        }

    async def capture_order(self, order_id: UUID, user_id: str) -> dict:
        """Capture a payment order (called after PayPal user approval).

        For QR-based providers this is a no-op / status check.

        Returns:
            Dict with order_id, status, fulfilled.
        """
        order = await self.repo.get_order_by_id(order_id)
        if order is None:
            raise HTTPException(status_code=404, detail="Order not found")
        if order.user_id != user_id:
            raise HTTPException(status_code=403, detail="Not your order")
        if not order.provider_order_id:
            raise HTTPException(status_code=400, detail="Order has no provider reference")

        provider = get_payment_provider(order.payment_method)
        capture_result = await provider.capture_order(order.provider_order_id)

        if capture_result.status in ("COMPLETED", "SUCCEEDED"):
            await self.repo.update_order_status(order.id, "succeeded")
            await self._fulfill_order(order.id)
            return {
                "order_id": str(order.id),
                "status": "succeeded",
                "fulfilled": True,
            }

        return {
            "order_id": str(order.id),
            "status": order.status,
            "fulfilled": order.fulfilled,
        }

    async def get_order_status(self, order_id: UUID, user_id: str) -> dict:
        """Get order status. If still pending, check provider for updates.

        Returns:
            Dict with order_id, status, fulfilled.
        """
        order = await self.repo.get_order_by_id(order_id)
        if order is None:
            raise HTTPException(status_code=404, detail="Order not found")
        if order.user_id != user_id:
            raise HTTPException(status_code=403, detail="Not your order")

        # If still pending, poll the payment provider
        if order.status == "pending" and order.provider_order_id:
            try:
                provider = get_payment_provider(order.payment_method)
                remote_status = await provider.get_order_status(order.provider_order_id)
                if remote_status in ("SUCCEEDED", "COMPLETED"):
                    await self.repo.update_order_status(order.id, "succeeded")
                    await self._fulfill_order(order.id)
                    order.status = "succeeded"
                    order.fulfilled = True
                elif remote_status in ("CANCELLED", "EXPIRED", "VOIDED"):
                    await self.repo.update_order_status(order.id, "failed")
                    order.status = "failed"
            except Exception:
                logger.warning("Failed to poll provider for order %s", order_id, exc_info=True)

        return {
            "order_id": str(order.id),
            "status": order.status,
            "fulfilled": order.fulfilled,
        }

    async def handle_webhook(self, source: str, event_type: str, data: dict) -> None:
        """Handle webhook events from any payment provider.

        Args:
            source: "airwallex" or "paypal".
            event_type: Provider-specific event name.
            data: Event data payload.
        """
        if source == "airwallex":
            await self._handle_airwallex_webhook(event_type, data)
        elif source == "paypal":
            await self._handle_paypal_webhook(event_type, data)
        else:
            logger.warning("Unknown webhook source: %s", source)

    async def _handle_airwallex_webhook(self, event_type: str, data: dict) -> None:
        if event_type != "payment_intent.succeeded":
            logger.debug("Ignoring Airwallex webhook event: %s", event_type)
            return

        intent_id = data.get("id", "")
        if not intent_id:
            logger.warning("Airwallex webhook missing intent ID")
            return

        order = await self.repo.get_order_by_provider_id(intent_id)
        if order is None:
            logger.warning("No order found for Airwallex intent %s", intent_id)
            return

        await self.repo.update_order_status(order.id, "succeeded")
        await self._fulfill_order(order.id)

    async def _handle_paypal_webhook(self, event_type: str, data: dict) -> None:
        if event_type != "CHECKOUT.ORDER.APPROVED":
            logger.debug("Ignoring PayPal webhook event: %s", event_type)
            return

        paypal_order_id = data.get("id", "")
        if not paypal_order_id:
            logger.warning("PayPal webhook missing order ID")
            return

        order = await self.repo.get_order_by_provider_id(paypal_order_id)
        if order is None:
            logger.warning("No order found for PayPal order %s", paypal_order_id)
            return

        # Capture the order server-side
        provider = get_payment_provider("paypal")
        capture_result = await provider.capture_order(paypal_order_id)

        if capture_result.status == "COMPLETED":
            await self.repo.update_order_status(order.id, "succeeded")
            await self._fulfill_order(order.id)

    async def _fulfill_order(self, order_id: UUID) -> None:
        """Fulfill a payment order: grant credits + upgrade subscription.

        Idempotent — checks the ``fulfilled`` flag before acting.
        """
        order = await self.repo.get_order_by_id(order_id)
        if order is None or order.fulfilled:
            return

        logger.info("Fulfilling order %s: type=%s, plan=%s", order_id, order.order_type, order.plan_name)

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

                # 3. Mark monthly credits as claimed so the user cannot double-claim
                await sub_repo.update_last_credits_claimed(order.user_id)

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

        elif order.order_type == "sandbox_addon":
            sub_repo = SubscriptionRepository(self.db)
            await sub_repo.add_purchased_sandbox_slots(order.user_id, order.credits_amount)

        elif order.order_type == "full_access":
            sub_repo = SubscriptionRepository(self.db)
            await sub_repo.extend_full_model_access(order.user_id, order.duration_days)

        # 3. Mark fulfilled
        await self.repo.mark_fulfilled(order_id)
        logger.info("Order %s fulfilled successfully", order_id)

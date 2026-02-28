"""Payment order data access layer."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.payment import PaymentOrder, PaymentOrderCreate

logger = logging.getLogger(__name__)


class PaymentRepository:
    """Data access layer for payment orders."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_order(self, data: PaymentOrderCreate) -> PaymentOrder:
        """Create a new payment order.

        This function does NOT commit the transaction, but it does flush the session.
        """
        logger.debug("Creating payment order for user: %s, type: %s", data.user_id, data.order_type)
        order = PaymentOrder(**data.model_dump())
        self.db.add(order)
        await self.db.flush()
        await self.db.refresh(order)
        logger.info("Created payment order: %s, amount: %s %s", order.id, order.amount, order.currency)
        return order

    async def get_order_by_id(self, order_id: UUID) -> PaymentOrder | None:
        """Fetch a payment order by ID."""
        return await self.db.get(PaymentOrder, order_id)

    async def get_order_by_provider_id(self, provider_order_id: str) -> PaymentOrder | None:
        """Fetch a payment order by provider order/intent ID."""
        result = await self.db.exec(select(PaymentOrder).where(PaymentOrder.provider_order_id == provider_order_id))
        return result.one_or_none()

    async def update_order_status(self, order_id: UUID, status: str) -> PaymentOrder | None:
        """Update the status of a payment order.

        This function does NOT commit the transaction.
        """
        order = await self.db.get(PaymentOrder, order_id)
        if order is None:
            return None
        order.status = status
        order.updated_at = datetime.now(timezone.utc)
        self.db.add(order)
        await self.db.flush()
        await self.db.refresh(order)
        logger.info("Updated payment order %s status to %s", order_id, status)
        return order

    async def set_provider_id_and_url(
        self,
        order_id: UUID,
        provider_order_id: str,
        url: str,
    ) -> PaymentOrder | None:
        """Set provider order ID and URL (QR code or approval link) on an order.

        This function does NOT commit the transaction.
        """
        order = await self.db.get(PaymentOrder, order_id)
        if order is None:
            return None
        order.provider_order_id = provider_order_id
        order.qr_code_url = url
        order.updated_at = datetime.now(timezone.utc)
        self.db.add(order)
        await self.db.flush()
        await self.db.refresh(order)
        logger.info("Set provider_order %s on order %s", provider_order_id, order_id)
        return order

    async def mark_fulfilled(self, order_id: UUID) -> PaymentOrder | None:
        """Mark a payment order as fulfilled (idempotent).

        This function does NOT commit the transaction.
        """
        order = await self.db.get(PaymentOrder, order_id)
        if order is None:
            return None
        if order.fulfilled:
            logger.info("Order %s already fulfilled, skipping", order_id)
            return order
        order.fulfilled = True
        order.fulfilled_at = datetime.now(timezone.utc)
        order.updated_at = datetime.now(timezone.utc)
        self.db.add(order)
        await self.db.flush()
        await self.db.refresh(order)
        logger.info("Marked order %s as fulfilled", order_id)
        return order

    async def list_user_orders(self, user_id: str, limit: int = 50, offset: int = 0) -> list[PaymentOrder]:
        """List payment orders for a user, newest first."""
        result = await self.db.exec(
            select(PaymentOrder)
            .where(PaymentOrder.user_id == user_id)
            .order_by(col(PaymentOrder.created_at).desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.all())

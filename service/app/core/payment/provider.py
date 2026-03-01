"""Payment provider abstraction — protocol + factory.

Allows PaymentService to work with any provider (PayPal, Airwallex, …)
without knowing the concrete implementation details.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Protocol, runtime_checkable

if TYPE_CHECKING:
    pass


@dataclass(frozen=True)
class CreateOrderResult:
    """Returned by ``create_order`` — contains provider-specific URLs."""

    provider_order_id: str
    flow_type: str  # "paypal_sdk" | "qrcode"
    approval_url: str = ""  # PayPal: redirect URL for JS SDK
    qr_code_url: str = ""  # Airwallex: QR code URL for scan-to-pay


@dataclass(frozen=True)
class CaptureResult:
    """Returned by ``capture_order`` after payment is captured."""

    provider_order_id: str
    status: str  # "COMPLETED", "SUCCEEDED", etc.
    raw: dict = field(default_factory=dict)


@runtime_checkable
class PaymentProvider(Protocol):
    """Protocol that all payment providers must satisfy."""

    async def create_order(
        self,
        amount: int,
        currency: str,
        order_id: str,
        metadata: dict | None = None,
        return_url: str = "",
        payment_method: str = "",
    ) -> CreateOrderResult: ...

    async def capture_order(self, provider_order_id: str) -> CaptureResult: ...

    async def get_order_status(self, provider_order_id: str) -> str: ...

    async def verify_webhook(self, headers: dict[str, str], body: bytes) -> bool: ...


def get_payment_provider(payment_method: str) -> PaymentProvider:
    """Return the appropriate payment provider for a given payment method.

    Uses ``configs.Payment.Provider`` to determine the routing:
      - ``"paypal"``   → always PayPalClient
      - ``"airwallex"`` → always AirwallexClient (adapter)
      - ``"auto"``     → dispatch by payment_method string
    """
    from app.configs import configs

    provider_setting = configs.Payment.Provider.lower()

    if provider_setting == "off":
        raise RuntimeError("Payment is disabled (XYZEN_PAYMENT_Provider=off)")
    elif provider_setting == "paypal":
        return _get_paypal()
    elif provider_setting == "airwallex":
        return _get_airwallex()
    else:  # "auto"
        if payment_method in ("alipaycn", "wechatpay"):
            return _get_airwallex()
        else:
            return _get_paypal()


def _get_paypal() -> PaymentProvider:
    from app.core.payment.paypal_client import paypal_client

    return paypal_client


def _get_airwallex() -> PaymentProvider:
    from app.core.payment.airwallex_client import airwallex_adapter

    return airwallex_adapter

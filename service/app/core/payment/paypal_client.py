"""PayPal REST API v2 client for order management.

Handles OAuth2 bearer-token caching and provides methods for the
Standard Checkout flow: create order → (user approves) → capture order.
"""

import base64
import logging
import time

import httpx

from app.configs import configs
from app.core.payment.provider import CaptureResult, CreateOrderResult

logger = logging.getLogger(__name__)


class PayPalClient:
    """Async HTTP client for PayPal REST API v2."""

    def __init__(self) -> None:
        self._base_url = configs.Payment.PayPal.BaseUrl
        self._client_id = configs.Payment.PayPal.ClientId
        self._secret = configs.Payment.PayPal.Secret
        self._webhook_id = configs.Payment.PayPal.WebhookId
        self._token: str = ""
        self._token_expires_at: float = 0.0
        self._http = httpx.AsyncClient(timeout=30.0)

    # ------------------------------------------------------------------
    # Auth
    # ------------------------------------------------------------------

    async def _ensure_token(self) -> str:
        """Obtain or refresh the OAuth2 bearer token.

        PayPal tokens are valid for ~9 hours. We refresh when less
        than 5 minutes remain.
        """
        if self._token and time.time() < self._token_expires_at - 300:
            return self._token

        credentials = base64.b64encode(f"{self._client_id}:{self._secret}".encode()).decode()

        resp = await self._http.post(
            f"{self._base_url}/v1/oauth2/token",
            headers={
                "Authorization": f"Basic {credentials}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={"grant_type": "client_credentials"},
        )
        resp.raise_for_status()
        data = resp.json()
        self._token = data["access_token"]
        self._token_expires_at = time.time() + data.get("expires_in", 32400)
        logger.info("PayPal auth token refreshed")
        return self._token

    async def _headers(self) -> dict[str, str]:
        token = await self._ensure_token()
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    # ------------------------------------------------------------------
    # Orders API v2
    # ------------------------------------------------------------------

    async def create_order(
        self,
        amount: int,
        currency: str,
        order_id: str,
        metadata: dict | None = None,
        return_url: str = "",
    ) -> CreateOrderResult:
        """Create a PayPal order (Standard Checkout).

        Args:
            amount: Amount in minor units (cents).
            currency: ISO currency code (e.g. USD).
            order_id: Internal order ID for reference_id.
            metadata: Unused (PayPal stores custom_id instead).
            return_url: Unused for JS SDK flow (SDK manages popup).

        Returns:
            CreateOrderResult with provider_order_id and approval_url.
        """
        decimal_amount = f"{amount / 100:.2f}"

        payload = {
            "intent": "CAPTURE",
            "purchase_units": [
                {
                    "reference_id": order_id,
                    "custom_id": order_id,
                    "amount": {
                        "currency_code": currency,
                        "value": decimal_amount,
                    },
                },
            ],
        }

        headers = await self._headers()
        resp = await self._http.post(
            f"{self._base_url}/v2/checkout/orders",
            headers=headers,
            json=payload,
        )
        if resp.status_code >= 400:
            logger.error("PayPal create order failed: %s %s", resp.status_code, resp.text)
        resp.raise_for_status()
        data = resp.json()

        paypal_order_id = data["id"]
        approval_url = ""
        for link in data.get("links", []):
            if link.get("rel") == "approve":
                approval_url = link["href"]
                break

        logger.info("Created PayPal order: %s", paypal_order_id)

        return CreateOrderResult(
            provider_order_id=paypal_order_id,
            flow_type="paypal_sdk",
            approval_url=approval_url,
        )

    async def capture_order(self, provider_order_id: str) -> CaptureResult:
        """Capture a PayPal order after user approval.

        Called by the backend after the frontend's PayPal JS SDK
        ``onApprove`` callback fires.
        """
        headers = await self._headers()
        resp = await self._http.post(
            f"{self._base_url}/v2/checkout/orders/{provider_order_id}/capture",
            headers=headers,
            json={},
        )
        if resp.status_code >= 400:
            logger.error("PayPal capture failed: %s %s", resp.status_code, resp.text)
        resp.raise_for_status()
        data = resp.json()

        status = data.get("status", "UNKNOWN")
        logger.info("Captured PayPal order %s, status=%s", provider_order_id, status)

        return CaptureResult(
            provider_order_id=provider_order_id,
            status=status,
            raw=data,
        )

    async def get_order_status(self, provider_order_id: str) -> str:
        """Get the current status of a PayPal order.

        Returns one of: CREATED, APPROVED, COMPLETED, VOIDED.
        """
        headers = await self._headers()
        resp = await self._http.get(
            f"{self._base_url}/v2/checkout/orders/{provider_order_id}",
            headers=headers,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("status", "UNKNOWN")

    async def verify_webhook(self, headers: dict[str, str], body: bytes) -> bool:
        """Verify a PayPal webhook notification via the REST API.

        PayPal verifies the signature server-side by replaying the event
        and comparing HMAC signatures.
        """
        if not self._webhook_id:
            logger.warning("PayPal webhook ID not configured, rejecting")
            return False

        api_headers = await self._headers()
        payload = {
            "auth_algo": headers.get("paypal-auth-algo", ""),
            "cert_url": headers.get("paypal-cert-url", ""),
            "transmission_id": headers.get("paypal-transmission-id", ""),
            "transmission_sig": headers.get("paypal-transmission-sig", ""),
            "transmission_time": headers.get("paypal-transmission-time", ""),
            "webhook_id": self._webhook_id,
            "webhook_event": body.decode("utf-8") if isinstance(body, bytes) else body,
        }

        # webhook_event needs to be a dict for JSON serialization
        import json

        try:
            payload["webhook_event"] = json.loads(body)
        except (json.JSONDecodeError, TypeError):
            logger.warning("Failed to parse webhook body as JSON")
            return False

        resp = await self._http.post(
            f"{self._base_url}/v1/notifications/verify-webhook-signature",
            headers=api_headers,
            json=payload,
        )
        if resp.status_code >= 400:
            logger.warning("PayPal webhook verification API failed: %s", resp.status_code)
            return False

        data = resp.json()
        return data.get("verification_status") == "SUCCESS"


# Module-level singleton
paypal_client = PayPalClient()

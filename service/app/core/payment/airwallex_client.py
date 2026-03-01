"""Airwallex HTTP client for payment intent management.

Also exports ``airwallex_adapter`` — a thin wrapper that conforms to the
``PaymentProvider`` protocol so the client can be used interchangeably
with other providers (e.g. PayPal).
"""

import hashlib
import hmac
import logging
import time
from datetime import datetime

import httpx

from app.configs import configs
from app.core.payment.provider import CaptureResult, CreateOrderResult

logger = logging.getLogger(__name__)


class AirwallexClient:
    """Async HTTP client for Airwallex API.

    Handles authentication token management with auto-refresh
    and provides methods for PaymentIntent lifecycle.
    """

    def __init__(self) -> None:
        self._base_url = configs.Payment.Airwallex.BaseUrl
        self._client_id = configs.Payment.Airwallex.ClientId
        self._api_key = configs.Payment.Airwallex.ApiKey
        self._webhook_secret = configs.Payment.Airwallex.WebhookSecret
        self._token: str = ""
        self._token_expires_at: float = 0.0
        self._http = httpx.AsyncClient(timeout=30.0)

    async def _ensure_token(self) -> str:
        """Obtain or refresh the bearer token.

        Airwallex tokens are valid for ~30 minutes. We refresh
        when there's less than 60 seconds remaining.
        """
        if self._token and time.time() < self._token_expires_at - 60:
            return self._token

        resp = await self._http.post(
            f"{self._base_url}/api/v1/authentication/login",
            headers={
                "x-client-id": self._client_id,
                "x-api-key": self._api_key,
                "Content-Type": "application/json",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        self._token = data["token"]
        # Airwallex returns expires_at as ISO string e.g. "2026-02-25T20:09:31+0000"
        expires_at_str = data.get("expires_at")
        if expires_at_str:
            dt = datetime.fromisoformat(expires_at_str.replace("+0000", "+00:00"))
            self._token_expires_at = dt.timestamp()
        else:
            self._token_expires_at = time.time() + 1800
        logger.info("Airwallex auth token refreshed")
        return self._token

    async def _headers(self) -> dict[str, str]:
        token = await self._ensure_token()
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    async def create_payment_intent(
        self,
        amount: int,
        currency: str,
        order_id: str,
        metadata: dict | None = None,
        return_url: str = "",
    ) -> dict:
        """Create a PaymentIntent on Airwallex.

        Args:
            amount: Amount in minor units (cents/fen).
            currency: ISO currency code (e.g. CNY, USD).
            order_id: Internal order ID for merchant_order_id.
            metadata: Optional key-value metadata.
            return_url: URL to redirect shopper after payment (required for LPMs).

        Returns:
            Airwallex PaymentIntent response dict.
        """
        # Airwallex expects amount as a decimal string (e.g. "25.90")
        decimal_amount = amount / 100

        payload: dict = {
            "amount": decimal_amount,
            "currency": currency,
            "merchant_order_id": order_id,
            "request_id": order_id,
            "metadata": metadata or {},
        }
        if return_url:
            payload["return_url"] = return_url

        headers = await self._headers()
        resp = await self._http.post(
            f"{self._base_url}/api/v1/pa/payment_intents/create",
            headers=headers,
            json=payload,
        )
        if resp.status_code >= 400:
            logger.error(f"Create PaymentIntent failed: {resp.status_code} {resp.text}")
        resp.raise_for_status()
        data = resp.json()
        logger.info(f"Created PaymentIntent: {data.get('id')}")
        return data

    async def confirm_payment_intent(
        self,
        intent_id: str,
        payment_method_type: str = "alipaycn",
        flow: str = "qrcode",
    ) -> dict:
        """Confirm a PaymentIntent with a specific payment method.

        For Alipay CN QR flow, use type='alipaycn' and flow='qrcode'.

        Returns:
            Confirmation response including next_action with QR code URL.
        """
        payload = {
            "request_id": f"{intent_id}_confirm",
            "payment_method": {
                "type": payment_method_type,
                payment_method_type: {
                    "flow": flow,
                },
            },
        }

        headers = await self._headers()
        resp = await self._http.post(
            f"{self._base_url}/api/v1/pa/payment_intents/{intent_id}/confirm",
            headers=headers,
            json=payload,
        )
        if resp.status_code >= 400:
            logger.error(f"Confirm PaymentIntent {intent_id} failed: {resp.status_code} {resp.text}")
        resp.raise_for_status()
        data = resp.json()
        logger.info(f"Confirmed PaymentIntent {intent_id}, status={data.get('status')}")
        return data

    async def get_payment_intent(self, intent_id: str) -> dict:
        """Retrieve the current state of a PaymentIntent."""
        headers = await self._headers()
        resp = await self._http.get(
            f"{self._base_url}/api/v1/pa/payment_intents/{intent_id}",
            headers=headers,
        )
        resp.raise_for_status()
        return resp.json()

    @staticmethod
    def verify_webhook_signature(timestamp: str, raw_body: bytes, signature: str) -> bool:
        """Verify Airwallex webhook HMAC-SHA256 signature.

        Args:
            timestamp: Value of x-timestamp header.
            raw_body: Raw request body bytes.
            signature: Value of x-signature header.

        Returns:
            True if the signature is valid.
        """
        secret = configs.Payment.Airwallex.WebhookSecret
        if not secret:
            logger.warning("Webhook secret not configured, rejecting")
            return False

        message = f"{timestamp}{raw_body.decode('utf-8')}"
        expected = hmac.new(
            secret.encode("utf-8"),
            message.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, signature)


# Module-level singleton
airwallex_client = AirwallexClient()


# ---------------------------------------------------------------------------
# PaymentProvider adapter
# ---------------------------------------------------------------------------


class _AirwallexAdapter:
    """Wraps ``AirwallexClient`` to conform to the ``PaymentProvider`` protocol.

    The create + confirm two-step Airwallex flow is collapsed into a single
    ``create_order`` call that returns a QR code URL.
    """

    def __init__(self, client: AirwallexClient) -> None:
        self._client = client

    async def create_order(
        self,
        amount: int,
        currency: str,
        order_id: str,
        metadata: dict | None = None,
        return_url: str = "",
        payment_method: str = "",
    ) -> CreateOrderResult:
        actual_return_url = return_url or configs.Payment.Airwallex.ReturnUrl

        # Resolve Airwallex payment_method_type from the app-level payment_method
        payment_method_type = "wechatpay" if payment_method == "wechatpay" else "alipaycn"

        intent = await self._client.create_payment_intent(
            amount=amount,
            currency=currency,
            order_id=order_id,
            metadata=metadata,
            return_url=actual_return_url,
        )
        intent_id = intent["id"]

        confirmation = await self._client.confirm_payment_intent(
            intent_id=intent_id,
            payment_method_type=payment_method_type,
            flow="qrcode",
        )

        next_action = confirmation.get("next_action", {})
        na_type = next_action.get("type", "")

        # Airwallex returns different shapes depending on payment method:
        #   alipaycn  → {type: "render_qrcode", qrcode: "...", url: "https://..."}
        #   wechatpay → {type: "render_qrcode", qrcode: "https://..."}
        # Prefer `url` (full checkout URL) over raw `qrcode` value.
        qr_code_url = ""
        if na_type in ("render_qr_code", "render_qrcode"):
            data = next_action.get("data", {})
            qr_code_url = (
                next_action.get("url")
                or data.get("qr_code_url")
                or data.get("code_url")
                or next_action.get("qrcode")
                or ""
            )
        if not qr_code_url:
            logger.warning("No QR URL extracted for %s, next_action=%s", payment_method_type, next_action)

        return CreateOrderResult(
            provider_order_id=intent_id,
            flow_type="qrcode",
            qr_code_url=qr_code_url,
        )

    async def capture_order(self, provider_order_id: str) -> CaptureResult:
        # Airwallex does not have a separate capture step for QR payments;
        # the payment completes when the user scans. This is a no-op.
        intent = await self._client.get_payment_intent(provider_order_id)
        return CaptureResult(
            provider_order_id=provider_order_id,
            status=intent.get("status", "UNKNOWN"),
            raw=intent,
        )

    async def get_order_status(self, provider_order_id: str) -> str:
        intent = await self._client.get_payment_intent(provider_order_id)
        return intent.get("status", "UNKNOWN")

    async def verify_webhook(self, headers: dict[str, str], body: bytes) -> bool:
        timestamp = headers.get("x-timestamp", "")
        signature = headers.get("x-signature", "")
        return AirwallexClient.verify_webhook_signature(timestamp, body, signature)


airwallex_adapter = _AirwallexAdapter(airwallex_client)

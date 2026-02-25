"""Airwallex HTTP client for payment intent management."""

import hashlib
import hmac
import logging
import time
from datetime import datetime

import httpx

from app.configs import configs

logger = logging.getLogger(__name__)


class AirwallexClient:
    """Async HTTP client for Airwallex API.

    Handles authentication token management with auto-refresh
    and provides methods for PaymentIntent lifecycle.
    """

    def __init__(self) -> None:
        self._base_url = configs.Airwallex.BaseUrl
        self._client_id = configs.Airwallex.ClientId
        self._api_key = configs.Airwallex.ApiKey
        self._webhook_secret = configs.Airwallex.WebhookSecret
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
                payment_method_type: {},
            },
            "payment_method_options": {
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
        secret = configs.Airwallex.WebhookSecret
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

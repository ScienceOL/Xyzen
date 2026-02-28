"""Payment gateway configuration — supports multiple providers via env vars.

Provider selection:
  - ``Provider = "paypal"``   → force PayPal for all payments
  - ``Provider = "airwallex"`` → force Airwallex for all payments
  - ``Provider = "auto"``     → pick per payment_method (paypal for card/paypal, airwallex for alipaycn/wechatpay)

Env-var examples (XYZEN_ prefix, _ nesting):
  XYZEN_PAYMENT_Provider=auto
  XYZEN_PAYMENT_PAYPAL_ClientId=AY...
  XYZEN_PAYMENT_PAYPAL_Secret=EF...
  XYZEN_PAYMENT_AIRWALLEX_ClientId=...
"""

from pydantic import Field
from pydantic_settings import BaseSettings


class PayPalConfig(BaseSettings):
    Enabled: bool = Field(default=False, description="Enable PayPal payment gateway")
    ClientId: str = Field(default="", description="PayPal REST app client ID")
    Secret: str = Field(default="", description="PayPal REST app secret")
    WebhookId: str = Field(default="", description="PayPal webhook ID for signature verification")
    BaseUrl: str = Field(
        default="https://api-m.sandbox.paypal.com",
        description="PayPal API base URL (use https://api-m.paypal.com for production)",
    )


class AirwallexConfig(BaseSettings):
    Enabled: bool = Field(default=False, description="Enable Airwallex payment gateway")
    ClientId: str = Field(default="", description="Airwallex API client ID")
    ApiKey: str = Field(default="", description="Airwallex API key")
    WebhookSecret: str = Field(default="", description="Airwallex webhook signing secret")
    BaseUrl: str = Field(
        default="https://api-demo.airwallex.com",
        description="Airwallex API base URL (use https://api.airwallex.com for production)",
    )
    ReturnUrl: str = Field(
        default="http://localhost:32233",
        description="URL to redirect shopper after payment completion",
    )


class PaymentConfig(BaseSettings):
    Provider: str = Field(
        default="auto",
        description="Payment provider: 'paypal', 'airwallex', or 'auto' (picks per payment method)",
    )
    PayPal: PayPalConfig = Field(
        default_factory=PayPalConfig,
        description="PayPal gateway configuration",
    )
    Airwallex: AirwallexConfig = Field(
        default_factory=AirwallexConfig,
        description="Airwallex gateway configuration",
    )

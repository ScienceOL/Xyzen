"""Pydantic response schemas for the plan catalog API."""

from pydantic import BaseModel, Field


class PaymentMethodInfo(BaseModel):
    """A payment method available in this deployment."""

    key: str = Field(description="Payment method identifier (e.g. 'alipaycn', 'wechatpay', 'paypal')")
    flow_type: str = Field(description="Checkout flow type: 'qrcode' or 'paypal_sdk'")
    currency: str = Field(description="ISO currency code (e.g. 'CNY', 'USD')")
    display_name_key: str = Field(description="i18n key for display name")
    sdk_config: dict[str, str] = Field(default_factory=dict, description="SDK config (e.g. PayPal client_id)")


class PlanFeatureResponse(BaseModel):
    key: str = Field(description="i18n key suffix (e.g. 'liteStandard')")
    included: bool
    params: dict[str, str | int] = Field(default_factory=dict)


class CurrencyPricingResponse(BaseModel):
    currency: str
    amount: int = Field(description="Minor units (cents / fen)")
    display_price: str
    credits: int
    first_month_amount: int | None = None
    first_month_display: str | None = None


class PlanLimitsResponse(BaseModel):
    """Resource limits merged from DB SubscriptionRole at runtime."""

    storage: str = Field(description="Human-readable storage limit")
    max_file_count: int
    max_parallel_chats: int
    max_sandboxes: int
    max_scheduled_tasks: int
    max_terminals: int
    monthly_credits: int
    max_model_tier: str


class PlanResponse(BaseModel):
    plan_key: str
    display_name_key: str
    is_free: bool = False
    highlight: bool = False
    badge_key: str | None = None
    pricing: list[CurrencyPricingResponse]
    features: list[PlanFeatureResponse]
    limits: PlanLimitsResponse | None = None


class TopUpRateResponse(BaseModel):
    currency: str
    credits_per_unit: int
    unit_amount: int
    display_rate: str
    payment_methods: list[str] = Field(default_factory=list)


class SandboxAddonRateResponse(BaseModel):
    currency: str
    amount_per_sandbox: int
    display_rate: str
    min_plan: str


class FullAccessPassRateResponse(BaseModel):
    currency: str
    amount: int
    display_price: str
    duration_days: int
    display_rate: str


class PlanCatalogResponse(BaseModel):
    """Full catalog response for a deployment region."""

    region: str
    plans: list[PlanResponse]
    topup_rates: list[TopUpRateResponse]
    sandbox_addon_rates: list[SandboxAddonRateResponse]
    full_access_pass_rates: list[FullAccessPassRateResponse] = Field(default_factory=list)
    payment_methods: list[PaymentMethodInfo] = Field(default_factory=list)
    payment_enabled: bool = Field(default=True, description="False when PAYMENT_Provider=off")
    paypal_client_id: str = Field(default="", description="Deprecated: use payment_methods instead")

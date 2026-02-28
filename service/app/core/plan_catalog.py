"""Unified subscription plan catalog — the single source of truth.

Consolidates pricing, features, top-up rates, and sandbox add-on rates
that were previously split across PLAN_PRICING (payment/service.py),
frontend hardcoded builders (PointsInfoModal.tsx), and DB SubscriptionRole.

Region-aware: uses the same ``configs.Region`` pattern as model_tier.py.
"""

from dataclasses import dataclass, field

_MB = 1024 * 1024
_GB = 1024 * _MB


@dataclass(frozen=True)
class PlanLimitsDefinition:
    """Resource limits — synced to DB SubscriptionRole at startup."""

    display_name: str
    storage_limit_bytes: int
    max_file_count: int
    max_file_upload_bytes: int
    max_parallel_chats: int
    max_sandboxes: int
    max_scheduled_tasks: int
    max_terminals: int
    max_deployments: int
    monthly_credits: int
    max_model_tier: str  # lite / standard / pro / ultra
    is_default: bool
    priority: int


_PLAN_LIMITS: dict[str, PlanLimitsDefinition] = {
    "free": PlanLimitsDefinition(
        display_name="Free",
        storage_limit_bytes=100 * _MB,
        max_file_count=200,
        max_file_upload_bytes=20 * _MB,
        max_parallel_chats=1,
        max_sandboxes=1,
        max_scheduled_tasks=1,
        max_terminals=1,
        max_deployments=1,
        monthly_credits=0,
        max_model_tier="lite",
        is_default=True,
        priority=0,
    ),
    "standard": PlanLimitsDefinition(
        display_name="Standard",
        storage_limit_bytes=1 * _GB,
        max_file_count=1000,
        max_file_upload_bytes=100 * _MB,
        max_parallel_chats=3,
        max_sandboxes=3,
        max_scheduled_tasks=3,
        max_terminals=3,
        max_deployments=3,
        monthly_credits=5000,
        max_model_tier="standard",
        is_default=False,
        priority=1,
    ),
    "professional": PlanLimitsDefinition(
        display_name="Professional",
        storage_limit_bytes=10 * _GB,
        max_file_count=5000,
        max_file_upload_bytes=200 * _MB,
        max_parallel_chats=6,
        max_sandboxes=6,
        max_scheduled_tasks=6,
        max_terminals=6,
        max_deployments=6,
        monthly_credits=22000,
        max_model_tier="pro",
        is_default=False,
        priority=2,
    ),
    "ultra": PlanLimitsDefinition(
        display_name="Ultra",
        storage_limit_bytes=100 * _GB,
        max_file_count=50000,
        max_file_upload_bytes=500 * _MB,
        max_parallel_chats=10,
        max_sandboxes=10,
        max_scheduled_tasks=10,
        max_terminals=10,
        max_deployments=10,
        monthly_credits=60000,
        max_model_tier="ultra",
        is_default=False,
        priority=3,
    ),
}


def get_plan_limits() -> dict[str, PlanLimitsDefinition]:
    """Return the plan limits definitions (region-independent)."""
    return _PLAN_LIMITS


@dataclass(frozen=True)
class PlanFeatureEntry:
    """A feature line for a plan card. ``key`` is an i18n key suffix."""

    key: str
    included: bool
    params: dict[str, str | int] = field(default_factory=dict)


@dataclass(frozen=True)
class CurrencyPricing:
    """Pricing for one plan in one currency."""

    currency: str
    amount: int  # minor units (cents / fen)
    display_price: str  # e.g. "$9.9", "¥25.9"
    credits: int
    first_month_amount: int | None = None
    first_month_display: str | None = None


@dataclass(frozen=True)
class PlanCatalogEntry:
    """One subscription plan (free / standard / professional / ultra)."""

    plan_key: str
    display_name_key: str  # i18n key for the plan name
    pricing: list[CurrencyPricing]
    features: list[PlanFeatureEntry]
    is_free: bool = False
    highlight: bool = False
    badge_key: str | None = None


@dataclass(frozen=True)
class TopUpRate:
    """Credits top-up exchange rate."""

    currency: str
    credits_per_unit: int
    unit_amount: int  # minor units
    display_rate: str
    payment_methods: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class SandboxAddonRate:
    """Sandbox add-on pricing."""

    currency: str
    amount_per_sandbox: int  # minor units
    display_rate: str
    min_plan: str


@dataclass(frozen=True)
class RegionCatalog:
    """All catalog data for one deployment region."""

    plans: list[PlanCatalogEntry]
    topup_rates: list[TopUpRate]
    sandbox_addon_rates: list[SandboxAddonRate]


# ---------------------------------------------------------------------------
# Region: Global (default) — USD pricing
# ---------------------------------------------------------------------------

_GLOBAL_CATALOG = RegionCatalog(
    plans=[
        PlanCatalogEntry(
            plan_key="free",
            display_name_key="subscription.plan.free",
            is_free=True,
            pricing=[
                CurrencyPricing(currency="USD", amount=0, display_price="$0", credits=0),
            ],
            features=[
                PlanFeatureEntry(key="liteModels", included=True),
                PlanFeatureEntry(key="basicFeatures", included=True),
                PlanFeatureEntry(key="moreProductivity", included=False),
                PlanFeatureEntry(key="advancedModels", included=False),
            ],
        ),
        PlanCatalogEntry(
            plan_key="standard",
            display_name_key="subscription.plan.standard",
            pricing=[
                CurrencyPricing(currency="USD", amount=990, display_price="$9.9", credits=5000),
            ],
            features=[
                PlanFeatureEntry(key="allBasic", included=True),
                PlanFeatureEntry(key="standardModels", included=True),
                PlanFeatureEntry(key="expandedResources", included=True),
                PlanFeatureEntry(key="proUltraModels", included=False),
            ],
        ),
        PlanCatalogEntry(
            plan_key="professional",
            display_name_key="subscription.plan.professional",
            pricing=[
                CurrencyPricing(currency="USD", amount=3690, display_price="$36.9", credits=22000),
            ],
            features=[
                PlanFeatureEntry(key="allStandard", included=True),
                PlanFeatureEntry(key="proModels", included=True),
                PlanFeatureEntry(key="prioritySupport", included=True),
                PlanFeatureEntry(key="ultraModels", included=False),
            ],
        ),
        PlanCatalogEntry(
            plan_key="ultra",
            display_name_key="subscription.plan.ultra",
            pricing=[
                CurrencyPricing(currency="USD", amount=9990, display_price="$99.9", credits=60000),
            ],
            features=[
                PlanFeatureEntry(key="allPro", included=True),
                PlanFeatureEntry(key="ultraModels", included=True),
                PlanFeatureEntry(key="maxResources", included=True),
                PlanFeatureEntry(key="dedicated", included=True),
            ],
        ),
    ],
    topup_rates=[
        TopUpRate(
            currency="USD",
            credits_per_unit=500,
            unit_amount=100,  # $1
            display_rate="subscription.topUp.rateIntl",
            payment_methods=["alipaycn", "wechatpay"],
        ),
    ],
    sandbox_addon_rates=[
        SandboxAddonRate(
            currency="USD",
            amount_per_sandbox=500,  # $5
            display_rate="subscription.sandboxAddon.rateIntl",
            min_plan="standard",
        ),
    ],
)

# ---------------------------------------------------------------------------
# Region: China — CNY pricing with first-month promos
# ---------------------------------------------------------------------------

_CHINA_CATALOG = RegionCatalog(
    plans=[
        PlanCatalogEntry(
            plan_key="free",
            display_name_key="subscription.plan.free",
            is_free=True,
            pricing=[
                CurrencyPricing(currency="CNY", amount=0, display_price="¥0", credits=0),
            ],
            features=[
                PlanFeatureEntry(key="liteModels", included=True),
                PlanFeatureEntry(key="basicFeatures", included=True),
                PlanFeatureEntry(key="moreProductivity", included=False),
                PlanFeatureEntry(key="advancedModels", included=False),
            ],
        ),
        PlanCatalogEntry(
            plan_key="standard",
            display_name_key="subscription.plan.standard",
            pricing=[
                CurrencyPricing(
                    currency="CNY",
                    amount=2590,
                    display_price="¥25.9",
                    credits=3000,
                    first_month_amount=1990,
                    first_month_display="¥19.9",
                ),
            ],
            features=[
                PlanFeatureEntry(key="allBasic", included=True),
                PlanFeatureEntry(key="standardModels", included=True),
                PlanFeatureEntry(key="expandedResources", included=True),
                PlanFeatureEntry(key="proUltraModels", included=False),
            ],
        ),
        PlanCatalogEntry(
            plan_key="professional",
            display_name_key="subscription.plan.professional",
            pricing=[
                CurrencyPricing(
                    currency="CNY",
                    amount=8990,
                    display_price="¥89.9",
                    credits=10000,
                    first_month_amount=7990,
                    first_month_display="¥79.9",
                ),
            ],
            features=[
                PlanFeatureEntry(key="allStandard", included=True),
                PlanFeatureEntry(key="proModels", included=True),
                PlanFeatureEntry(key="prioritySupport", included=True),
                PlanFeatureEntry(key="ultraModels", included=False),
            ],
        ),
        PlanCatalogEntry(
            plan_key="ultra",
            display_name_key="subscription.plan.ultraChina",
            pricing=[
                CurrencyPricing(currency="CNY", amount=26800, display_price="¥268.0", credits=60000),
            ],
            features=[
                PlanFeatureEntry(key="allPro", included=True),
                PlanFeatureEntry(key="ultraModels", included=True),
                PlanFeatureEntry(key="maxResources", included=True),
                PlanFeatureEntry(key="dedicated", included=True),
            ],
        ),
    ],
    topup_rates=[
        TopUpRate(
            currency="CNY",
            credits_per_unit=100,
            unit_amount=100,  # ¥1
            display_rate="subscription.topUp.rateChina",
            payment_methods=["alipaycn", "wechatpay"],
        ),
    ],
    sandbox_addon_rates=[
        SandboxAddonRate(
            currency="CNY",
            amount_per_sandbox=2000,  # ¥20
            display_rate="subscription.sandboxAddon.rateChina",
            min_plan="standard",
        ),
    ],
)

# ---------------------------------------------------------------------------
# Region lookup
# ---------------------------------------------------------------------------

REGION_CATALOGS: dict[str, RegionCatalog] = {
    "global": _GLOBAL_CATALOG,
    "zh-cn": _CHINA_CATALOG,
}


def _get_region() -> str:
    from app.configs import configs

    return configs.Region.lower()


# ---------------------------------------------------------------------------
# Public accessor functions
# ---------------------------------------------------------------------------


def get_plan_catalog() -> RegionCatalog:
    """Return the plan catalog for the current deployment region."""
    return REGION_CATALOGS.get(_get_region(), _GLOBAL_CATALOG)


def get_plan_pricing(plan_key: str, currency: str) -> CurrencyPricing | None:
    """Look up pricing for a specific plan + currency.

    Used by PaymentService to replace the old PLAN_PRICING dict.
    """
    catalog = get_plan_catalog()
    for plan in catalog.plans:
        if plan.plan_key == plan_key:
            for p in plan.pricing:
                if p.currency == currency:
                    return p
    return None


def get_catalog_region() -> str:
    """Return the region key used for the current catalog."""
    region = _get_region()
    return region if region in REGION_CATALOGS else "global"

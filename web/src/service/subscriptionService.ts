import { http } from "@/service/http/client";

// ==================== Types ====================

export interface SubscriptionRoleRead {
  id: string;
  name: string;
  display_name: string;
  storage_limit_bytes: number;
  max_file_count: number;
  max_file_upload_bytes: number;
  max_parallel_chats: number;
  max_sandboxes: number;
  max_scheduled_tasks: number;
  max_terminals: number;
  monthly_credits: number;
  max_model_tier: string;
  is_default: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface UserSubscriptionRead {
  id: string;
  user_id: string;
  role_id: string;
  expires_at: string | null;
  last_credits_claimed_at: string | null;
  purchased_sandbox_slots: number;
  full_model_access_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionResponse {
  subscription: UserSubscriptionRead;
  role: SubscriptionRoleRead;
  can_claim_credits: boolean;
  effective_max_model_tier: string;
}

export interface ClaimCreditsResponse {
  amount_credited: number;
  message: string;
}

export interface PlansResponse {
  plans: SubscriptionRoleRead[];
}

export interface AdminSubscriptionEntry {
  subscription: UserSubscriptionRead;
  role_name: string | null;
  role_display_name: string | null;
}

export interface AdminSubscriptionsResponse {
  subscriptions: AdminSubscriptionEntry[];
  total: number;
}

export interface AdminAssignRoleRequest {
  user_id: string;
  role_id: string;
  expires_at?: string | null;
}

export interface UsageBucket {
  used: number;
  limit: number;
}

export interface StorageBucket {
  used_bytes: number;
  limit_bytes: number;
  usage_percentage: number;
}

export interface UsageResponse {
  role_name: string;
  role_display_name: string;
  chats: UsageBucket;
  sandboxes: UsageBucket;
  scheduled_tasks: UsageBucket;
  terminals: UsageBucket;
  storage: StorageBucket;
  files: UsageBucket;
}

// ==================== Plan Catalog Types ====================

export interface PlanFeatureResponse {
  key: string;
  included: boolean;
  params: Record<string, string | number>;
}

export interface CurrencyPricingResponse {
  currency: string;
  amount: number;
  display_price: string;
  credits: number;
  first_month_amount: number | null;
  first_month_display: string | null;
}

export interface PlanLimitsResponse {
  storage: string;
  max_file_count: number;
  max_parallel_chats: number;
  max_sandboxes: number;
  max_scheduled_tasks: number;
  max_terminals: number;
  monthly_credits: number;
  max_model_tier: string;
}

export interface PlanResponse {
  plan_key: string;
  display_name_key: string;
  is_free: boolean;
  highlight: boolean;
  badge_key: string | null;
  pricing: CurrencyPricingResponse[];
  features: PlanFeatureResponse[];
  limits: PlanLimitsResponse | null;
}

export interface TopUpRateResponse {
  currency: string;
  credits_per_unit: number;
  unit_amount: number;
  display_rate: string;
  payment_methods: string[];
}

export interface SandboxAddonRateResponse {
  currency: string;
  amount_per_sandbox: number;
  display_rate: string;
  min_plan: string;
}

export interface FullAccessPassRateResponse {
  currency: string;
  amount: number;
  display_price: string;
  duration_days: number;
  display_rate: string;
}

export interface PaymentMethodInfo {
  key: string;
  flow_type: "qrcode" | "paypal_sdk";
  currency: string;
  display_name_key: string;
  sdk_config: Record<string, string>;
}

export interface PlanCatalogResponse {
  region: string;
  plans: PlanResponse[];
  topup_rates: TopUpRateResponse[];
  sandbox_addon_rates: SandboxAddonRateResponse[];
  full_access_pass_rates: FullAccessPassRateResponse[];
  payment_methods: PaymentMethodInfo[];
  payment_enabled: boolean;
  paypal_client_id: string;
}

// ==================== Service ====================

class SubscriptionService {
  async getSubscription(): Promise<SubscriptionResponse> {
    return http.get("/xyzen/api/v1/subscription");
  }

  async getPlans(): Promise<PlansResponse> {
    return http.get("/xyzen/api/v1/subscription/plans", { auth: false });
  }

  async getCatalog(): Promise<PlanCatalogResponse> {
    return http.get("/xyzen/api/v1/subscription/plans/catalog", {
      auth: false,
    });
  }

  async getUsage(): Promise<UsageResponse> {
    return http.get("/xyzen/api/v1/subscription/usage");
  }

  async claimCredits(): Promise<ClaimCreditsResponse> {
    return http.post("/xyzen/api/v1/subscription/claim-credits");
  }

  async adminListSubscriptions(
    adminSecret: string,
  ): Promise<AdminSubscriptionsResponse> {
    return http.get("/xyzen/api/v1/subscription/admin/subscriptions", {
      auth: false,
      headers: { "X-Admin-Secret": adminSecret },
    });
  }

  async adminAssignRole(
    adminSecret: string,
    data: AdminAssignRoleRequest,
  ): Promise<SubscriptionResponse> {
    return http.post("/xyzen/api/v1/subscription/admin/assign", data, {
      auth: false,
      headers: { "X-Admin-Secret": adminSecret },
    });
  }
}

export const subscriptionService = new SubscriptionService();

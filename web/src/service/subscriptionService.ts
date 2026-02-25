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
  created_at: string;
  updated_at: string;
}

export interface SubscriptionResponse {
  subscription: UserSubscriptionRead;
  role: SubscriptionRoleRead;
  can_claim_credits: boolean;
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
  storage: StorageBucket;
  files: UsageBucket;
}

// ==================== Service ====================

class SubscriptionService {
  async getSubscription(): Promise<SubscriptionResponse> {
    return http.get("/xyzen/api/v1/subscription");
  }

  async getPlans(): Promise<PlansResponse> {
    return http.get("/xyzen/api/v1/subscription/plans", { auth: false });
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

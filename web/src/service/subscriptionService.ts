import { authService } from "@/service/authService";
import { useXyzen } from "@/store";

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
  created_at: string;
  updated_at: string;
}

export interface SubscriptionResponse {
  subscription: UserSubscriptionRead;
  role: SubscriptionRoleRead;
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
  storage: StorageBucket;
  files: UsageBucket;
}

// ==================== Service ====================

class SubscriptionService {
  private getBackendUrl(): string {
    const { backendUrl } = useXyzen.getState();
    if (!backendUrl || backendUrl === "") {
      if (typeof window !== "undefined") {
        return `${window.location.protocol}//${window.location.host}`;
      }
    }
    return backendUrl;
  }

  private createAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const token = authService.getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  async getSubscription(): Promise<SubscriptionResponse> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/subscription`,
      { method: "GET", headers: this.createAuthHeaders() },
    );
    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.detail?.msg || error.detail || "Failed to get subscription",
      );
    }
    return response.json();
  }

  async getPlans(): Promise<PlansResponse> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/subscription/plans`,
      { method: "GET" },
    );
    if (!response.ok) {
      throw new Error("Failed to get plans");
    }
    return response.json();
  }

  async getUsage(): Promise<UsageResponse> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/subscription/usage`,
      { method: "GET", headers: this.createAuthHeaders() },
    );
    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.detail?.msg || error.detail || "Failed to get usage",
      );
    }
    return response.json();
  }

  async adminListSubscriptions(
    adminSecret: string,
  ): Promise<AdminSubscriptionsResponse> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/subscription/admin/subscriptions`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Secret": adminSecret,
        },
      },
    );
    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.detail?.msg ||
          error.detail ||
          "Failed to get admin subscriptions",
      );
    }
    return response.json();
  }

  async adminAssignRole(
    adminSecret: string,
    data: AdminAssignRoleRequest,
  ): Promise<SubscriptionResponse> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/subscription/admin/assign`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Secret": adminSecret,
        },
        body: JSON.stringify(data),
      },
    );
    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.detail?.msg || error.detail || "Failed to assign role",
      );
    }
    return response.json();
  }
}

export const subscriptionService = new SubscriptionService();

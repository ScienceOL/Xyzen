import { authService } from "@/service/authService";
import { useXyzen } from "@/store";

export interface NotificationConfig {
  enabled: boolean;
  app_identifier: string;
  api_url: string;
  ws_url: string;
  vapid_public_key: string;
}

interface PushSubscriptionPayload {
  endpoint: string;
  keys: Record<string, string>;
  user_agent?: string;
}

interface PushSubscriptionResponse {
  success: boolean;
}

class NotificationService {
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

  async getConfig(): Promise<NotificationConfig> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/notifications/config`,
    );

    if (!response.ok) {
      throw new Error("Failed to fetch notification config");
    }

    return response.json();
  }

  async registerPushSubscription(
    subscription: PushSubscriptionPayload,
  ): Promise<PushSubscriptionResponse> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/notifications/push-subscription`,
      {
        method: "POST",
        headers: this.createAuthHeaders(),
        body: JSON.stringify(subscription),
      },
    );

    if (!response.ok) {
      throw new Error("Failed to register push subscription");
    }

    return response.json();
  }

  async removePushSubscription(
    endpoint: string,
  ): Promise<PushSubscriptionResponse> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/notifications/push-subscription`,
      {
        method: "DELETE",
        headers: this.createAuthHeaders(),
        body: JSON.stringify({ endpoint, keys: {} }),
      },
    );

    if (!response.ok) {
      throw new Error("Failed to remove push subscription");
    }

    return response.json();
  }
}

export const notificationService = new NotificationService();

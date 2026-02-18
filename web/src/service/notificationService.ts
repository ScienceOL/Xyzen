import { http } from "@/service/http/client";

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
  async getConfig(): Promise<NotificationConfig> {
    return http.get("/xyzen/api/v1/notifications/config", { auth: false });
  }

  async registerPushSubscription(
    subscription: PushSubscriptionPayload,
  ): Promise<PushSubscriptionResponse> {
    return http.post(
      "/xyzen/api/v1/notifications/push-subscription",
      subscription,
    );
  }

  async removePushSubscription(
    endpoint: string,
  ): Promise<PushSubscriptionResponse> {
    return http.delete("/xyzen/api/v1/notifications/push-subscription", {
      endpoint,
      keys: {},
    });
  }
}

export const notificationService = new NotificationService();

import { authService } from "@/service/authService";
import { useXyzen } from "@/store";

export interface NotificationConfig {
  enabled: boolean;
  app_identifier: string;
  api_url: string;
  ws_url: string;
}

interface DeviceTokenResponse {
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

  async registerDeviceToken(
    token: string,
    providerId: string = "fcm",
  ): Promise<DeviceTokenResponse> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/notifications/device-token`,
      {
        method: "POST",
        headers: this.createAuthHeaders(),
        body: JSON.stringify({ token, provider_id: providerId }),
      },
    );

    if (!response.ok) {
      throw new Error("Failed to register device token");
    }

    return response.json();
  }

  async removeDeviceToken(
    token: string,
    providerId: string = "fcm",
  ): Promise<DeviceTokenResponse> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/notifications/device-token`,
      {
        method: "DELETE",
        headers: this.createAuthHeaders(),
        body: JSON.stringify({ token, provider_id: providerId }),
      },
    );

    if (!response.ok) {
      throw new Error("Failed to remove device token");
    }

    return response.json();
  }
}

export const notificationService = new NotificationService();

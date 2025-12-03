import { authService } from "@/service/authService";
import { useXyzen } from "@/store";

export interface RedeemCodeRequest {
  code: string;
}

export interface RedeemCodeResponse {
  success: boolean;
  amount_credited: number;
  new_balance: number;
  message: string;
}

export interface UserWalletResponse {
  user_id: string;
  virtual_balance: number;
  total_credited: number;
  total_consumed: number;
  created_at: string;
  updated_at: string;
}

export interface RedemptionHistoryResponse {
  id: string;
  code_id: string;
  user_id: string;
  amount: number;
  redeemed_at: string;
}

class RedemptionService {
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

  /**
   * Redeem a code to get virtual balance
   */
  async redeemCode(code: string): Promise<RedeemCodeResponse> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/redemption/redeem`,
      {
        method: "POST",
        headers: this.createAuthHeaders(),
        body: JSON.stringify({ code }),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.detail?.msg || error.detail || "Failed to redeem code",
      );
    }

    return response.json();
  }

  /**
   * Get user wallet information
   */
  async getUserWallet(): Promise<UserWalletResponse> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/redemption/wallet`,
      {
        method: "GET",
        headers: this.createAuthHeaders(),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.detail?.msg || error.detail || "Failed to get wallet",
      );
    }

    return response.json();
  }

  /**
   * Get user redemption history
   */
  async getRedemptionHistory(
    limit = 100,
    offset = 0,
  ): Promise<RedemptionHistoryResponse[]> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/redemption/history?limit=${limit}&offset=${offset}`,
      {
        method: "GET",
        headers: this.createAuthHeaders(),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.detail?.msg || error.detail || "Failed to get history",
      );
    }

    return response.json();
  }
}

export const redemptionService = new RedemptionService();

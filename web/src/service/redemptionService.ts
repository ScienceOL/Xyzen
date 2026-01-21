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

export interface DailyTokenStatsResponse {
  date: string;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  total_amount: number;
  record_count: number;
}

export interface UserConsumptionResponse {
  user_id: string;
  username: string;
  auth_provider: string;
  total_amount: number;
  total_count: number;
  success_count: number;
  failed_count: number;
}

export interface ConsumeRecordResponse {
  id: string;
  user_id: string;
  amount: number;
  auth_provider: string;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  consume_state: string;
  created_at: string;
}

export interface DailyUserActivityResponse {
  date: string;
  active_users: number;
  new_users: number;
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

  /**
   * Get daily token statistics (admin only)
   */
  async getDailyTokenStats(
    adminSecret: string,
    date?: string,
    tz?: string,
  ): Promise<DailyTokenStatsResponse> {
    const url = new URL(
      `${this.getBackendUrl()}/xyzen/api/v1/redemption/admin/stats/daily-tokens`,
    );
    if (date) {
      url.searchParams.append("date", date);
    }
    if (tz) {
      url.searchParams.append("tz", tz);
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Secret": adminSecret,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.detail?.msg || error.detail || "Failed to get daily token stats",
      );
    }

    return response.json();
  }

  /**
   * Get top users by consumption (admin only)
   */
  async getTopUsersByConsumption(
    adminSecret: string,
    limit = 20,
  ): Promise<UserConsumptionResponse[]> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/redemption/admin/stats/top-users?limit=${limit}`,
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
        error.detail?.msg || error.detail || "Failed to get top users",
      );
    }

    return response.json();
  }

  /**
   * Get all consume records (admin only)
   */
  async getConsumeRecords(
    adminSecret: string,
    startDate?: string,
    endDate?: string,
    tz?: string,
    limit = 10000,
    offset = 0,
  ): Promise<ConsumeRecordResponse[]> {
    const url = new URL(
      `${this.getBackendUrl()}/xyzen/api/v1/redemption/admin/stats/consume-records`,
    );
    if (startDate) {
      url.searchParams.append("start_date", startDate);
    }
    if (endDate) {
      url.searchParams.append("end_date", endDate);
    }
    if (tz) {
      url.searchParams.append("tz", tz);
    }
    url.searchParams.append("limit", limit.toString());
    url.searchParams.append("offset", offset.toString());

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Secret": adminSecret,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.detail?.msg || error.detail || "Failed to get consume records",
      );
    }

    return response.json();
  }

  /**
   * Get all consume records by auto-pagination (admin only)
   *
   * NOTE: Use with a date range to avoid downloading excessive data.
   */
  async getAllConsumeRecords(
    adminSecret: string,
    startDate?: string,
    endDate?: string,
    tz?: string,
    pageSize = 10000,
  ): Promise<ConsumeRecordResponse[]> {
    const all: ConsumeRecordResponse[] = [];
    let offset = 0;

    while (true) {
      const page = await this.getConsumeRecords(
        adminSecret,
        startDate,
        endDate,
        tz,
        pageSize,
        offset,
      );
      all.push(...page);

      if (page.length < pageSize) {
        break;
      }

      offset += pageSize;
    }

    return all;
  }

  /**
   * Get user activity statistics (admin only)
   */
  async getUserActivityStats(
    adminSecret: string,
    startDate?: string,
    endDate?: string,
    tz?: string,
  ): Promise<DailyUserActivityResponse[]> {
    const url = new URL(
      `${this.getBackendUrl()}/xyzen/api/v1/redemption/admin/stats/user-activity`,
    );
    if (startDate) {
      url.searchParams.append("start_date", startDate);
    }
    if (endDate) {
      url.searchParams.append("end_date", endDate);
    }
    if (tz) {
      url.searchParams.append("tz", tz);
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Secret": adminSecret,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.detail?.msg ||
          error.detail ||
          "Failed to get user activity stats",
      );
    }

    return response.json();
  }
}

export const redemptionService = new RedemptionService();

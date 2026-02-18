import { http } from "@/service/http/client";

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

export interface AdminCode {
  id: string;
  code: string;
  amount: number;
  max_usage: number;
  current_usage: number;
  is_active: boolean;
  expires_at: string | null;
  description: string | null;
  code_type: string;
  role_name: string | null;
  duration_days: number;
  created_at: string;
}

class RedemptionService {
  async redeemCode(code: string): Promise<RedeemCodeResponse> {
    return http.post("/xyzen/api/v1/redemption/redeem", { code });
  }

  async getUserWallet(): Promise<UserWalletResponse> {
    return http.get("/xyzen/api/v1/redemption/wallet");
  }

  async getRedemptionHistory(
    limit = 100,
    offset = 0,
  ): Promise<RedemptionHistoryResponse[]> {
    return http.get("/xyzen/api/v1/redemption/history", {
      params: { limit, offset },
    });
  }

  async getDailyTokenStats(
    adminSecret: string,
    date?: string,
    tz?: string,
  ): Promise<DailyTokenStatsResponse> {
    return http.get("/xyzen/api/v1/redemption/admin/stats/daily-tokens", {
      auth: false,
      headers: { "X-Admin-Secret": adminSecret },
      params: { date, tz },
    });
  }

  async getTopUsersByConsumption(
    adminSecret: string,
    limit = 20,
  ): Promise<UserConsumptionResponse[]> {
    return http.get("/xyzen/api/v1/redemption/admin/stats/top-users", {
      auth: false,
      headers: { "X-Admin-Secret": adminSecret },
      params: { limit },
    });
  }

  async getConsumeRecords(
    adminSecret: string,
    startDate?: string,
    endDate?: string,
    tz?: string,
    limit = 10000,
    offset = 0,
  ): Promise<ConsumeRecordResponse[]> {
    return http.get("/xyzen/api/v1/redemption/admin/stats/consume-records", {
      auth: false,
      headers: { "X-Admin-Secret": adminSecret },
      params: {
        start_date: startDate,
        end_date: endDate,
        tz,
        limit,
        offset,
      },
    });
  }

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

  async getUserActivityStats(
    adminSecret: string,
    startDate?: string,
    endDate?: string,
    tz?: string,
  ): Promise<DailyUserActivityResponse[]> {
    return http.get("/xyzen/api/v1/redemption/admin/stats/user-activity", {
      auth: false,
      headers: { "X-Admin-Secret": adminSecret },
      params: { start_date: startDate, end_date: endDate, tz },
    });
  }

  async adminListCodes(
    adminSecret: string,
    limit = 50,
  ): Promise<{ codes: AdminCode[] }> {
    return http.get("/xyzen/api/v1/redemption/admin/codes", {
      auth: false,
      headers: { "X-Admin-Secret": adminSecret },
      params: { limit },
    });
  }

  async adminCreateCode(
    adminSecret: string,
    payload: Record<string, unknown>,
  ): Promise<AdminCode> {
    return http.post("/xyzen/api/v1/redemption/admin/codes", payload, {
      auth: false,
      headers: { "X-Admin-Secret": adminSecret },
    });
  }

  async adminDeactivateCode(
    adminSecret: string,
    codeId: string,
  ): Promise<void> {
    return http.post(
      `/xyzen/api/v1/redemption/admin/codes/${codeId}/deactivate`,
      undefined,
      {
        auth: false,
        headers: { "X-Admin-Secret": adminSecret },
      },
    );
  }
}

export const redemptionService = new RedemptionService();

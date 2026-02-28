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
  free_balance: number;
  paid_balance: number;
  earned_balance: number;
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
  model_tier: string | null;
  model_name: string | null;
  provider: string | null;
  cost_usd: number | null;
  record_type: string | null;
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

// ==================== New Aggregated Stats Interfaces ====================

export interface ConsumptionHeatmapEntry {
  date: string;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  credits: number;
  cost_usd: number;
  record_count: number;
  llm_count: number;
  tool_call_count: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  by_tier: Record<string, Record<string, number>>; // values include cost_usd (float)
}

export interface UserConsumptionHeatmapEntry {
  date: string;
  active_users: number;
  total_tokens: number;
  credits: number;
  cost_usd: number;
  record_count: number;
}

export interface ConsumptionTopUserEntry {
  user_id: string;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  credits: number;
  cost_usd: number;
  record_count: number;
  llm_count: number;
  tool_call_count: number;
  subscription_tier: string;
  by_tier: Record<string, Record<string, number>>;
}

export interface RedemptionHeatmapEntry {
  date: string;
  total_credits: number;
  redemption_count: number;
  unique_users: number;
}

export interface RedemptionRankingEntry {
  user_id: string;
  total_credits: number;
  redemption_count: number;
}

export interface NewUsersHeatmapEntry {
  date: string;
  new_users: number;
}

export interface ProviderOption {
  value: string;
  label: string;
}

export interface FilterOptionsResponse {
  providers: ProviderOption[];
  models: string[];
  tiers: string[];
  tools: string[];
}

export interface ModelOptionsResponse {
  models: string[];
}

export interface CreditHeatmapEntry {
  date: string;
  total_credits: number;
  transaction_count: number;
  unique_users: number;
  welcome_bonus_credits: number;
  redemption_code_credits: number;
  subscription_monthly_credits: number;
  daily_checkin_credits: number;
}

export interface CreditRankingEntry {
  user_id: string;
  total_credits: number;
  transaction_count: number;
  welcome_bonus_credits: number;
  redemption_code_credits: number;
  subscription_monthly_credits: number;
  daily_checkin_credits: number;
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

  // ==================== New Aggregated Stats Methods ====================

  async getConsumptionHeatmap(
    adminSecret: string,
    year: number,
    tz?: string,
    modelTier?: string,
    modelName?: string,
    provider?: string,
    toolName?: string,
  ): Promise<ConsumptionHeatmapEntry[]> {
    return http.get(
      "/xyzen/api/v1/redemption/admin/stats/consumption-heatmap",
      {
        auth: false,
        headers: { "X-Admin-Secret": adminSecret },
        params: {
          year,
          tz,
          model_tier: modelTier,
          model_name: modelName,
          provider,
          tool_name: toolName,
        },
      },
    );
  }

  async getUserConsumptionHeatmap(
    adminSecret: string,
    year: number,
    tz?: string,
    modelTier?: string,
    modelName?: string,
    provider?: string,
    toolName?: string,
  ): Promise<UserConsumptionHeatmapEntry[]> {
    return http.get(
      "/xyzen/api/v1/redemption/admin/stats/user-consumption-heatmap",
      {
        auth: false,
        headers: { "X-Admin-Secret": adminSecret },
        params: {
          year,
          tz,
          model_tier: modelTier,
          model_name: modelName,
          provider,
          tool_name: toolName,
        },
      },
    );
  }

  async getConsumptionTopUsers(
    adminSecret: string,
    year: number,
    tz?: string,
    date?: string,
    modelTier?: string,
    modelName?: string,
    limit = 20,
    search?: string,
    provider?: string,
    includeTiers?: boolean,
    toolName?: string,
  ): Promise<ConsumptionTopUserEntry[]> {
    return http.get(
      "/xyzen/api/v1/redemption/admin/stats/consumption-top-users",
      {
        auth: false,
        headers: { "X-Admin-Secret": adminSecret },
        params: {
          year,
          tz,
          date,
          model_tier: modelTier,
          model_name: modelName,
          limit,
          search,
          provider,
          include_tiers: includeTiers || undefined,
          tool_name: toolName,
        },
      },
    );
  }

  async getRedemptionHeatmap(
    adminSecret: string,
    year: number,
    tz?: string,
  ): Promise<RedemptionHeatmapEntry[]> {
    return http.get("/xyzen/api/v1/redemption/admin/stats/redemption-heatmap", {
      auth: false,
      headers: { "X-Admin-Secret": adminSecret },
      params: { year, tz },
    });
  }

  async getRedemptionRankings(
    adminSecret: string,
    year: number,
    tz?: string,
    date?: string,
    limit = 20,
    search?: string,
  ): Promise<RedemptionRankingEntry[]> {
    return http.get(
      "/xyzen/api/v1/redemption/admin/stats/redemption-rankings",
      {
        auth: false,
        headers: { "X-Admin-Secret": adminSecret },
        params: { year, tz, date, limit, search },
      },
    );
  }

  async getNewUsersHeatmap(
    adminSecret: string,
    year: number,
    tz?: string,
  ): Promise<NewUsersHeatmapEntry[]> {
    return http.get("/xyzen/api/v1/redemption/admin/stats/new-users-heatmap", {
      auth: false,
      headers: { "X-Admin-Secret": adminSecret },
      params: { year, tz },
    });
  }

  async getFilterOptions(
    adminSecret: string,
    year: number,
    tz?: string,
    provider?: string,
  ): Promise<FilterOptionsResponse> {
    return http.get("/xyzen/api/v1/redemption/admin/stats/filter-options", {
      auth: false,
      headers: { "X-Admin-Secret": adminSecret },
      params: { year, tz, provider },
    });
  }

  async getModelOptions(adminSecret: string): Promise<ModelOptionsResponse> {
    return http.get("/xyzen/api/v1/redemption/admin/stats/model-options", {
      auth: false,
      headers: { "X-Admin-Secret": adminSecret },
    });
  }

  async getCreditHeatmap(
    adminSecret: string,
    year: number,
    tz?: string,
    source?: string,
    tier?: string,
  ): Promise<CreditHeatmapEntry[]> {
    return http.get("/xyzen/api/v1/redemption/admin/stats/credit-heatmap", {
      auth: false,
      headers: { "X-Admin-Secret": adminSecret },
      params: { year, tz, source, tier },
    });
  }

  async getCreditRankings(
    adminSecret: string,
    year: number,
    tz?: string,
    source?: string,
    tier?: string,
    date?: string,
    limit = 20,
    search?: string,
  ): Promise<CreditRankingEntry[]> {
    return http.get("/xyzen/api/v1/redemption/admin/stats/credit-rankings", {
      auth: false,
      headers: { "X-Admin-Secret": adminSecret },
      params: { year, tz, source, tier, date, limit, search },
    });
  }
}

export const redemptionService = new RedemptionService();

import { http } from "@/service/http/client";

export interface DeveloperWallet {
  available_balance: number;
  total_earned: number;
  total_withdrawn: number;
}

export interface DeveloperEarning {
  id: string;
  marketplace_id: string;
  consumer_user_id: string;
  fork_mode: string;
  rate: number;
  amount: number;
  total_consumed: number;
  status: string;
  created_at: string;
}

export interface EarningsListResponse {
  earnings: DeveloperEarning[];
  total: number;
}

export interface EarningsSummaryItem {
  marketplace_id: string;
  fork_mode: string;
  total_earned: number;
  total_consumed: number;
  earning_count: number;
  last_earned_at: string | null;
  agent_name: string | null;
  agent_avatar: string | null;
}

export interface WithdrawResponse {
  withdrawn: number;
  developer_balance: number;
  user_balance: number;
}

export interface RewardRates {
  editable: number;
  locked: number;
}

export interface ListingEarningsStats {
  total_earned: number;
  total_consumed: number;
  earning_count: number;
}

class DeveloperService {
  async getWallet(): Promise<DeveloperWallet> {
    return http.get("/xyzen/api/v1/developer/wallet");
  }

  async getEarnings(params?: {
    marketplace_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<EarningsListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.marketplace_id)
      searchParams.append("marketplace_id", params.marketplace_id);
    if (params?.limit) searchParams.append("limit", params.limit.toString());
    if (params?.offset) searchParams.append("offset", params.offset.toString());
    const qs = searchParams.toString();
    return http.get(`/xyzen/api/v1/developer/earnings${qs ? `?${qs}` : ""}`);
  }

  async getEarningsSummary(): Promise<{ items: EarningsSummaryItem[] }> {
    return http.get("/xyzen/api/v1/developer/earnings/summary");
  }

  async withdraw(amount: number): Promise<WithdrawResponse> {
    return http.post("/xyzen/api/v1/developer/withdraw", { amount });
  }

  async getRewardRates(): Promise<RewardRates> {
    return http.get("/xyzen/api/v1/developer/reward-rates");
  }

  async getListingEarnings(
    marketplaceId: string,
  ): Promise<ListingEarningsStats> {
    return http.get(`/xyzen/api/v1/marketplace/${marketplaceId}/earnings`);
  }
}

export const developerService = new DeveloperService();

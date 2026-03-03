import { http } from "@/service/http/client";

// ==================== Types ====================

export interface RewardData {
  credits: number;
  credit_type: string;
  full_model_access_days: number;
  model_access_tier: string;
  milestone_reached: boolean;
  milestone_name: string;
}

export interface Milestone {
  consecutive_day: number;
  milestone_name: string;
  access_days: number;
  tier: string;
}

export interface CampaignStatusResponse {
  id: string;
  name: string;
  display_name_key: string;
  description_key: string;
  mode: string;
  total_days: number;
  claimed_today: boolean;
  consecutive_days: number;
  total_claims: number;
  completed: boolean;
  next_reward_preview: RewardData | null;
  milestones: Milestone[] | null;
}

export interface ClaimResultResponse {
  day_number: number;
  consecutive_days: number;
  reward: RewardData;
}

// ==================== Service ====================

class GiftService {
  async getActiveCampaigns(): Promise<CampaignStatusResponse[]> {
    return http.get("/xyzen/api/v1/gifts/active");
  }

  async claimGift(campaignId: string): Promise<ClaimResultResponse> {
    return http.post(`/xyzen/api/v1/gifts/${campaignId}/claim`);
  }
}

export const giftService = new GiftService();

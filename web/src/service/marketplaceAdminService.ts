import { http } from "@/service/http/client";

// ==================== Response Types ====================

export interface MarketplaceOverview {
  total_listings: number;
  published_listings: number;
  unpublished_listings: number;
  official_listings: number;
  community_listings: number;
  total_forks: number;
  total_views: number;
  total_likes: number;
  total_developer_earnings: number;
  total_developer_consumed: number;
  unique_developers: number;
}

export interface AdminMarketplaceListing {
  id: string;
  name: string;
  description: string | null;
  avatar: string | null;
  scope: string;
  is_published: boolean;
  fork_mode: string;
  user_id: string | null;
  author_display_name: string | null;
  tags: string[];
  likes_count: number;
  forks_count: number;
  views_count: number;
  total_earned: number;
  total_consumed: number;
  created_at: string;
  updated_at: string;
  first_published_at: string | null;
}

export interface AdminListingsResponse {
  listings: AdminMarketplaceListing[];
  total: number;
}

export interface EarningsHeatmapEntry {
  date: string;
  total_earned: number;
  total_consumed: number;
  earning_count: number;
}

export interface TopAgentEntry {
  id: string;
  name: string | null;
  avatar: string | null;
  scope: string | null;
  is_published: boolean | null;
  forks_count: number;
  views_count: number;
  likes_count: number;
  total_earned: number;
  total_consumed: number;
  author_display_name: string | null;
}

export interface TopDeveloperEntry {
  developer_user_id: string;
  total_earned: number;
  total_consumed: number;
  earning_count: number;
  listing_count: number;
  available_balance: number;
  subscription_tier: string;
}

export interface DeveloperAgentEntry {
  marketplace_id: string;
  name: string | null;
  avatar: string | null;
  scope: string | null;
  is_published: boolean | null;
  forks_count: number;
  views_count: number;
  likes_count: number;
  total_earned: number;
  total_consumed: number;
  earning_count: number;
}

// ==================== Service ====================

class MarketplaceAdminService {
  private headers(adminSecret: string) {
    return { "X-Admin-Secret": adminSecret };
  }

  async getOverview(adminSecret: string): Promise<MarketplaceOverview> {
    return http.get("/xyzen/api/v1/admin/marketplace/overview", {
      auth: false,
      headers: this.headers(adminSecret),
    });
  }

  async getListings(
    adminSecret: string,
    params: {
      search?: string;
      scope?: string;
      is_published?: boolean;
      sort_by?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<AdminListingsResponse> {
    return http.get("/xyzen/api/v1/admin/marketplace/listings", {
      auth: false,
      headers: this.headers(adminSecret),
      params,
    });
  }

  async getListingDetail(
    adminSecret: string,
    listingId: string,
  ): Promise<AdminMarketplaceListing & { readme?: string }> {
    return http.get(`/xyzen/api/v1/admin/marketplace/listings/${listingId}`, {
      auth: false,
      headers: this.headers(adminSecret),
    });
  }

  async togglePublish(
    adminSecret: string,
    listingId: string,
  ): Promise<{ id: string; is_published: boolean }> {
    return http.post(
      `/xyzen/api/v1/admin/marketplace/listings/${listingId}/toggle-publish`,
      undefined,
      {
        auth: false,
        headers: this.headers(adminSecret),
      },
    );
  }

  async deleteListing(
    adminSecret: string,
    listingId: string,
  ): Promise<{ success: boolean }> {
    return http.delete(
      `/xyzen/api/v1/admin/marketplace/listings/${listingId}`,
      undefined,
      {
        auth: false,
        headers: this.headers(adminSecret),
      },
    );
  }

  async getEarningsHeatmap(
    adminSecret: string,
    year: number,
    tz?: string,
    subscriptionTier?: string,
  ): Promise<EarningsHeatmapEntry[]> {
    return http.get("/xyzen/api/v1/admin/marketplace/heatmap/earnings", {
      auth: false,
      headers: this.headers(adminSecret),
      params: { year, tz, subscription_tier: subscriptionTier },
    });
  }

  async getTopAgents(
    adminSecret: string,
    sortBy = "earned",
    limit = 20,
  ): Promise<TopAgentEntry[]> {
    return http.get("/xyzen/api/v1/admin/marketplace/top-agents", {
      auth: false,
      headers: this.headers(adminSecret),
      params: { sort_by: sortBy, limit },
    });
  }

  async getTopDevelopers(
    adminSecret: string,
    year: number,
    tz?: string,
    date?: string,
    limit = 20,
  ): Promise<TopDeveloperEntry[]> {
    return http.get("/xyzen/api/v1/admin/marketplace/top-developers", {
      auth: false,
      headers: this.headers(adminSecret),
      params: { year, tz, date, limit },
    });
  }

  async getDeveloperAgents(
    adminSecret: string,
    devUserId: string,
  ): Promise<DeveloperAgentEntry[]> {
    return http.get(
      `/xyzen/api/v1/admin/marketplace/developers/${devUserId}/agents`,
      {
        auth: false,
        headers: this.headers(adminSecret),
      },
    );
  }
}

export const marketplaceAdminService = new MarketplaceAdminService();

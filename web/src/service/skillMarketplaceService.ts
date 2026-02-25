import { http } from "@/service/http/client";

export type SkillMarketplaceScope = "official" | "community";

export interface SkillMarketplaceListing {
  id: string;
  skill_id: string;
  active_snapshot_id: string;
  user_id: string | null;
  author_display_name: string | null;
  author_avatar_url: string | null;
  name: string;
  description: string | null;
  tags: string[];
  likes_count: number;
  forks_count: number;
  views_count: number;
  is_published: boolean;
  scope: SkillMarketplaceScope;
  created_at: string;
  updated_at: string;
  first_published_at: string | null;
  has_liked: boolean;
  readme: string | null;
}

export interface SkillSnapshotRead {
  id: string;
  skill_id: string;
  version: number;
  skill_md_content: string;
  resource_manifest: Array<{
    path: string;
    size_bytes: number;
    content_hash: string;
  }>;
  skill_metadata: {
    name: string;
    description?: string;
    license?: string;
    compatibility?: string;
  };
  commit_message: string;
  created_at: string;
}

export interface SkillMarketplaceListingWithSnapshot extends SkillMarketplaceListing {
  snapshot: SkillSnapshotRead;
  has_liked: boolean;
}

export interface SkillPublishRequest {
  skill_id: string;
  commit_message: string;
  is_published?: boolean;
  readme?: string | null;
}

export interface SkillPublishResponse {
  marketplace_id: string;
  skill_id: string;
  snapshot_version: number;
  is_published: boolean;
  readme: string | null;
}

export interface SkillUpdateListingRequest {
  is_published?: boolean;
  readme?: string | null;
}

export interface SkillForkRequest {
  custom_name?: string;
}

export interface SkillForkResponse {
  skill_id: string;
  name: string;
  original_marketplace_id: string;
}

export interface SkillLikeResponse {
  is_liked: boolean;
  likes_count: number;
}

export interface SkillSearchParams {
  query?: string;
  tags?: string[];
  scope?: SkillMarketplaceScope;
  sort_by?: "likes" | "forks" | "views" | "recent" | "oldest";
  limit?: number;
  offset?: number;
}

// ============================================================================
// Service
// ============================================================================

class SkillMarketplaceService {
  async publishSkill(
    request: SkillPublishRequest,
  ): Promise<SkillPublishResponse> {
    return http.post("/xyzen/api/v1/skill-marketplace/publish", request);
  }

  async unpublishSkill(marketplaceId: string): Promise<void> {
    return http.post(
      `/xyzen/api/v1/skill-marketplace/unpublish/${marketplaceId}`,
    );
  }

  async updateListing(
    marketplaceId: string,
    request: SkillUpdateListingRequest,
  ): Promise<SkillMarketplaceListing> {
    return http.patch(
      `/xyzen/api/v1/skill-marketplace/${marketplaceId}`,
      request,
    );
  }

  async forkSkill(
    marketplaceId: string,
    request: SkillForkRequest = {},
  ): Promise<SkillForkResponse> {
    return http.post(
      `/xyzen/api/v1/skill-marketplace/fork/${marketplaceId}`,
      request,
    );
  }

  async searchListings(
    params: SkillSearchParams = {},
  ): Promise<SkillMarketplaceListing[]> {
    const searchParams = new URLSearchParams();
    if (params.query) searchParams.append("query", params.query);
    if (params.tags && params.tags.length > 0) {
      params.tags.forEach((tag) => searchParams.append("tags", tag));
    }
    if (params.scope) searchParams.append("scope", params.scope);
    if (params.sort_by) searchParams.append("sort_by", params.sort_by);
    if (params.limit !== undefined)
      searchParams.append("limit", params.limit.toString());
    if (params.offset !== undefined)
      searchParams.append("offset", params.offset.toString());

    const queryString = searchParams.toString();
    const path = `/xyzen/api/v1/skill-marketplace/${queryString ? `?${queryString}` : ""}`;

    return http.get(path);
  }

  async getListing(
    marketplaceId: string,
  ): Promise<SkillMarketplaceListingWithSnapshot> {
    return http.get(`/xyzen/api/v1/skill-marketplace/${marketplaceId}`);
  }

  async toggleLike(marketplaceId: string): Promise<SkillLikeResponse> {
    return http.post(`/xyzen/api/v1/skill-marketplace/${marketplaceId}/like`);
  }

  async getMyListings(): Promise<SkillMarketplaceListing[]> {
    return http.get("/xyzen/api/v1/skill-marketplace/my-listings/all");
  }

  async getStarredListings(): Promise<SkillMarketplaceListing[]> {
    return http.get("/xyzen/api/v1/skill-marketplace/starred");
  }

  async getListingHistory(marketplaceId: string): Promise<SkillSnapshotRead[]> {
    return http.get(`/xyzen/api/v1/skill-marketplace/${marketplaceId}/history`);
  }

  async getTrendingListings(limit = 10): Promise<SkillMarketplaceListing[]> {
    return http.get("/xyzen/api/v1/skill-marketplace/trending", {
      params: { limit },
    });
  }

  async getRecentlyPublishedListings(
    limit = 6,
  ): Promise<SkillMarketplaceListing[]> {
    return http.get("/xyzen/api/v1/skill-marketplace/recently-published", {
      params: { limit },
    });
  }
}

export const skillMarketplaceService = new SkillMarketplaceService();

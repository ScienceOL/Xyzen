import { http } from "@/service/http/client";

export type ForkMode = "editable" | "locked";
export type MarketplaceScope = "official" | "community";

export interface MarketplaceListing {
  id: string;
  agent_id: string;
  active_snapshot_id: string;
  user_id: string | null;
  author_display_name: string | null;
  author_avatar_url: string | null;
  name: string;
  description: string | null;
  avatar: string | null;
  tags: string[];
  likes_count: number;
  forks_count: number;
  views_count: number;
  is_published: boolean;
  fork_mode: ForkMode;
  scope: MarketplaceScope;
  created_at: string;
  updated_at: string;
  first_published_at: string | null;
  has_liked: boolean;
  readme: string | null;
}

export interface AgentSnapshot {
  id: string;
  agent_id: string;
  version: number;
  configuration: {
    name: string;
    description?: string;
    avatar?: string;
    tags: string[];
    model?: string;
    temperature?: number;
    prompt?: string; // Legacy field, kept for backward compat
    require_tool_confirmation: boolean;
    scope: string;
    graph_config?: Record<string, unknown> | null; // Source of truth for agent configuration
  };
  mcp_server_configs: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
  knowledge_set_config: {
    id: string;
    name: string;
    description?: string;
    file_count: number;
    file_ids: string[];
    total_size_bytes?: number;
  } | null;
  skill_configs: Array<{
    id: string;
    name: string;
    description?: string;
    scope: string;
  }>;
  commit_message: string;
  created_at: string;
}

export interface MarketplaceListingWithSnapshot extends MarketplaceListing {
  snapshot: AgentSnapshot;
  has_liked: boolean;
}

export interface UpdateAgentRequest {
  name?: string;
  description?: string;
  avatar?: string;
  tags?: string[];
  readme?: string | null;
  commit_message: string;
  graph_config?: Record<string, unknown> | null;
}

export interface PublishRequest {
  agent_id: string;
  commit_message: string;
  is_published?: boolean;
  readme?: string | null;
  fork_mode?: ForkMode;
  knowledge_set_id?: string | null;
  skill_ids?: string[];
}

export interface PublishResponse {
  marketplace_id: string;
  agent_id: string;
  snapshot_version: number;
  is_published: boolean;
  readme: string | null;
}

export interface UpdateListingRequest {
  is_published?: boolean;
  readme?: string | null;
  fork_mode?: ForkMode;
}

export interface ForkRequest {
  custom_name?: string;
}

export interface ForkResponse {
  agent_id: string;
  name: string;
  original_marketplace_id: string;
}

export interface LikeResponse {
  is_liked: boolean;
  likes_count: number;
}

export interface RequirementsResponse {
  mcp_servers: Array<{
    name: string;
    description?: string;
  }>;
  knowledge_base: {
    name: string;
    file_count: number;
    total_size_bytes: number;
  } | null;
  skills: Array<{
    name: string;
    description?: string;
    scope: string;
  }>;
  provider_needed: boolean;
  graph_config?: Record<string, unknown> | null; // For agent type detection
}

export interface SearchParams {
  query?: string;
  tags?: string[];
  scope?: MarketplaceScope;
  sort_by?: "likes" | "forks" | "views" | "recent" | "oldest";
  limit?: number;
  offset?: number;
}

// ============================================================================
// Service
// ============================================================================

class MarketplaceService {
  async publishAgent(request: PublishRequest): Promise<PublishResponse> {
    return http.post("/xyzen/api/v1/marketplace/publish", request);
  }

  async unpublishAgent(marketplaceId: string): Promise<void> {
    return http.post(`/xyzen/api/v1/marketplace/unpublish/${marketplaceId}`);
  }

  async updateListing(
    marketplaceId: string,
    request: UpdateListingRequest,
  ): Promise<MarketplaceListing> {
    return http.patch(`/xyzen/api/v1/marketplace/${marketplaceId}`, request);
  }

  async forkAgent(
    marketplaceId: string,
    request: ForkRequest = {},
  ): Promise<ForkResponse> {
    return http.post(
      `/xyzen/api/v1/marketplace/fork/${marketplaceId}`,
      request,
    );
  }

  async searchListings(
    params: SearchParams = {},
  ): Promise<MarketplaceListing[]> {
    // tags needs special handling: multiple values with same key
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
    const path = `/xyzen/api/v1/marketplace/${queryString ? `?${queryString}` : ""}`;

    return http.get(path);
  }

  async getListingPublic(
    marketplaceId: string,
  ): Promise<MarketplaceListingWithSnapshot> {
    // Public endpoint — auth is optional (token sent if available)
    return http.get(`/xyzen/api/v1/marketplace/${marketplaceId}`);
  }

  async getRequirementsPublic(
    marketplaceId: string,
  ): Promise<RequirementsResponse> {
    // Public endpoint — auth is optional (token sent if available)
    return http.get(`/xyzen/api/v1/marketplace/${marketplaceId}/requirements`);
  }

  async getListing(
    marketplaceId: string,
  ): Promise<MarketplaceListingWithSnapshot> {
    return http.get(`/xyzen/api/v1/marketplace/${marketplaceId}`);
  }

  async getRequirements(marketplaceId: string): Promise<RequirementsResponse> {
    return http.get(`/xyzen/api/v1/marketplace/${marketplaceId}/requirements`);
  }

  async toggleLike(marketplaceId: string): Promise<LikeResponse> {
    return http.post(`/xyzen/api/v1/marketplace/${marketplaceId}/like`);
  }

  async getMyListings(): Promise<MarketplaceListing[]> {
    return http.get("/xyzen/api/v1/marketplace/my-listings/all");
  }

  async getStarredListings(): Promise<MarketplaceListing[]> {
    return http.get("/xyzen/api/v1/marketplace/starred");
  }

  async getListingHistory(marketplaceId: string): Promise<AgentSnapshot[]> {
    return http.get(`/xyzen/api/v1/marketplace/${marketplaceId}/history`);
  }

  async publishVersion(
    marketplaceId: string,
    version: number,
  ): Promise<MarketplaceListing> {
    return http.post(
      `/xyzen/api/v1/marketplace/${marketplaceId}/publish-version`,
      { version },
    );
  }

  async updateAgentAndPublish(
    marketplaceId: string,
    request: UpdateAgentRequest,
  ): Promise<MarketplaceListing> {
    return http.patch(
      `/xyzen/api/v1/marketplace/${marketplaceId}/agent`,
      request,
    );
  }

  async pullListingUpdate(agentId: string): Promise<{
    agent_id: string;
    updated: boolean;
    new_version: number | null;
    message: string;
  }> {
    return http.post(`/xyzen/api/v1/marketplace/agents/${agentId}/pull-update`);
  }

  async getTrendingListings(limit = 10): Promise<MarketplaceListing[]> {
    return http.get("/xyzen/api/v1/marketplace/trending", {
      params: { limit },
    });
  }

  async getRecentlyPublishedListings(limit = 6): Promise<MarketplaceListing[]> {
    return http.get("/xyzen/api/v1/marketplace/recently-published", {
      params: { limit },
    });
  }
}

export const marketplaceService = new MarketplaceService();

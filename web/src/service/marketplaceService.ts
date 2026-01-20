import { authService } from "@/service/authService";
import { useXyzen } from "@/store";

/**
 * Marketplace Service
 *
 * Handles all API interactions for the agent marketplace feature.
 */

export interface MarketplaceListing {
  id: string;
  agent_id: string;
  active_snapshot_id: string;
  user_id: string;
  name: string;
  description: string | null;
  avatar: string | null;
  tags: string[];
  likes_count: number;
  forks_count: number;
  views_count: number;
  is_published: boolean;
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
  } | null;
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
  } | null;
  provider_needed: boolean;
  graph_config?: Record<string, unknown> | null; // For agent type detection
}

export interface SearchParams {
  query?: string;
  tags?: string[];
  sort_by?: "likes" | "forks" | "views" | "recent" | "oldest";
  limit?: number;
  offset?: number;
}

// ============================================================================
// Service
// ============================================================================

class MarketplaceService {
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
      headers["Authorization"] = `Bearer ${token}`;
    }

    return headers;
  }

  /**
   * Publish an agent to the marketplace
   */
  async publishAgent(request: PublishRequest): Promise<PublishResponse> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/marketplace/publish`,
      {
        method: "POST",
        headers: this.createAuthHeaders(),
        body: JSON.stringify(request),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to publish agent: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Unpublish a marketplace listing
   */
  async unpublishAgent(marketplaceId: string): Promise<void> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/marketplace/unpublish/${marketplaceId}`,
      {
        method: "POST",
        headers: this.createAuthHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to unpublish agent: ${response.statusText}`);
    }
  }

  /**
   * Update listing details (e.g. README)
   */
  async updateListing(
    marketplaceId: string,
    request: UpdateListingRequest,
  ): Promise<MarketplaceListing> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/marketplace/${marketplaceId}`,
      {
        method: "PATCH",
        headers: this.createAuthHeaders(),
        body: JSON.stringify(request),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to update listing: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Fork an agent from the marketplace
   */
  async forkAgent(
    marketplaceId: string,
    request: ForkRequest = {},
  ): Promise<ForkResponse> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/marketplace/fork/${marketplaceId}`,
      {
        method: "POST",
        headers: this.createAuthHeaders(),
        body: JSON.stringify(request),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fork agent: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Search marketplace listings
   */
  async searchListings(
    params: SearchParams = {},
  ): Promise<MarketplaceListing[]> {
    const searchParams = new URLSearchParams();

    if (params.query) {
      searchParams.append("query", params.query);
    }

    if (params.tags && params.tags.length > 0) {
      params.tags.forEach((tag) => searchParams.append("tags", tag));
    }

    if (params.sort_by) {
      searchParams.append("sort_by", params.sort_by);
    }

    if (params.limit !== undefined) {
      searchParams.append("limit", params.limit.toString());
    }

    if (params.offset !== undefined) {
      searchParams.append("offset", params.offset.toString());
    }

    const queryString = searchParams.toString();
    const url = `${this.getBackendUrl()}/xyzen/api/v1/marketplace/${queryString ? `?${queryString}` : ""}`;

    const response = await fetch(url, {
      method: "GET",
      headers: this.createAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to search listings: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get a marketplace listing with its snapshot
   */
  async getListing(
    marketplaceId: string,
  ): Promise<MarketplaceListingWithSnapshot> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/marketplace/${marketplaceId}`,
      {
        method: "GET",
        headers: this.createAuthHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to get listing: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get requirements for a marketplace listing
   */
  async getRequirements(marketplaceId: string): Promise<RequirementsResponse> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/marketplace/${marketplaceId}/requirements`,
      {
        method: "GET",
        headers: this.createAuthHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to get requirements: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Toggle like on a marketplace listing
   */
  async toggleLike(marketplaceId: string): Promise<LikeResponse> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/marketplace/${marketplaceId}/like`,
      {
        method: "POST",
        headers: this.createAuthHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to toggle like: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get current user's marketplace listings
   */
  async getMyListings(): Promise<MarketplaceListing[]> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/marketplace/my-listings/all`,
      {
        method: "GET",
        headers: this.createAuthHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to get my listings: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get starred marketplace listings
   */
  async getStarredListings(): Promise<MarketplaceListing[]> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/marketplace/starred`,
      {
        method: "GET",
        headers: this.createAuthHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to get starred listings: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get version history of a marketplace listing
   */
  async getListingHistory(marketplaceId: string): Promise<AgentSnapshot[]> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/marketplace/${marketplaceId}/history`,
      {
        method: "GET",
        headers: this.createAuthHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to get listing history: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Publish a specific version of the agent
   */
  async publishVersion(
    marketplaceId: string,
    version: number,
  ): Promise<MarketplaceListing> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/marketplace/${marketplaceId}/publish-version`,
      {
        method: "POST",
        headers: this.createAuthHeaders(),
        body: JSON.stringify({ version }),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to publish version: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Update agent and publish a new version
   */
  async updateAgentAndPublish(
    marketplaceId: string,
    request: UpdateAgentRequest,
  ): Promise<MarketplaceListing> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/marketplace/${marketplaceId}/agent`,
      {
        method: "PATCH",
        headers: this.createAuthHeaders(),
        body: JSON.stringify(request),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to update agent and publish: ${response.statusText}`,
      );
    }

    return response.json();
  }

  /**
   * Pull update for a forked agent
   */
  async pullListingUpdate(agentId: string): Promise<{
    agent_id: string;
    updated: boolean;
    new_version: number | null;
    message: string;
  }> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/marketplace/agents/${agentId}/pull-update`,
      {
        method: "POST",
        headers: this.createAuthHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to pull listing update: ${response.statusText}`);
    }

    return response.json();
  }
}

export const marketplaceService = new MarketplaceService();

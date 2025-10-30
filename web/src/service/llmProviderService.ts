import { authService } from "@/service/authService";
import { useXyzen } from "@/store";
import type {
  LlmProviderCreate,
  LlmProviderResponse,
  LlmProviderUpdate,
  ProviderTemplate,
} from "@/types/llmProvider";

class LlmProviderService {
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
   * Get provider templates for UI
   */
  async getProviderTemplates(): Promise<ProviderTemplate[]> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/providers/templates`,
    );
    if (!response.ok) {
      throw new Error("Failed to fetch provider templates");
    }
    return response.json();
  }

  /**
   * Get current user's providers
   */
  async getMyProviders(): Promise<LlmProviderResponse[]> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/providers/me`,
      {
        headers: this.createAuthHeaders(),
      },
    );
    if (!response.ok) {
      throw new Error("Failed to fetch your providers");
    }
    return response.json();
  }


  /**
   * Create a new provider
   */
  async createProvider(
    provider: LlmProviderCreate,
  ): Promise<LlmProviderResponse> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/providers/`,
      {
        method: "POST",
        headers: this.createAuthHeaders(),
        body: JSON.stringify(provider),
      },
    );
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create provider: ${error}`);
    }
    return response.json();
  }

  /**
   * Get a single provider by ID
   */
  async getProvider(id: string): Promise<LlmProviderResponse> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/providers/${id}`,
      {
        headers: this.createAuthHeaders(),
      },
    );
    if (!response.ok) {
      throw new Error("Failed to fetch provider");
    }
    return response.json();
  }

  /**
   * Update a provider
   */
  async updateProvider(
    id: string,
    provider: LlmProviderUpdate,
  ): Promise<LlmProviderResponse> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/providers/${id}`,
      {
        method: "PATCH",
        headers: this.createAuthHeaders(),
        body: JSON.stringify(provider),
      },
    );
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to update provider: ${error}`);
    }
    return response.json();
  }

  /**
   * Delete a provider
   */
  async deleteProvider(id: string): Promise<void> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/providers/${id}`,
      {
        method: "DELETE",
        headers: this.createAuthHeaders(),
      },
    );
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to delete provider: ${error}`);
    }
  }
}

export const llmProviderService = new LlmProviderService();

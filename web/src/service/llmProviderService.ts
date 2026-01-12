import { authService } from "@/service/authService";
import { useXyzen } from "@/store";
import type {
  LlmProviderCreate,
  LlmProviderResponse,
  LlmProviderUpdate,
  ModelRegistry,
  ProviderTemplate,
  ModelInfo,
  DefaultModelConfig,
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

  private getProviderDisplayName(type: string): string {
    const displayNames: Record<string, string> = {
      openai: "OpenAI",
      azure_openai: "Azure OpenAI",
      google: "Google",
      google_vertex: "Google Vertex AI",
    };
    return displayNames[type] || type;
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

    const modelRegistry: ModelRegistry = await response.json();

    // Transform dict to array of templates
    return Object.entries(modelRegistry).map(([providerType, models]) => ({
      type: providerType,
      display_name: this.getProviderDisplayName(providerType),
      models: models,
    }));
  }

  /**
   * Get supported models list
   */
  async getSupportedModels(): Promise<string[]> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/providers/models`,
    );
    if (!response.ok) {
      throw new Error("Failed to fetch supported models");
    }
    return response.json();
  }

  /**
   * Get available models for user's providers
   * Returns a map of provider ID to list of models
   */
  async getAvailableModels(): Promise<Record<string, ModelInfo[]>> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/providers/available-models`,
      {
        headers: this.createAuthHeaders(),
      },
    );
    if (!response.ok) {
      throw new Error("Failed to fetch available models");
    }
    return response.json();
  }

  /**
   * Get default model configuration from system LLM config
   */
  async getDefaultModelConfig(): Promise<DefaultModelConfig> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/providers/default-model`,
    );
    if (!response.ok) {
      throw new Error("Failed to fetch default model config");
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
   * Get system providers only (no user-defined providers)
   */
  async getSystemProviders(): Promise<LlmProviderResponse[]> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/providers/system`,
      {
        headers: this.createAuthHeaders(),
      },
    );
    if (!response.ok) {
      throw new Error("Failed to fetch system providers");
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

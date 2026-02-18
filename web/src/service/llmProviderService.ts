import { http } from "@/service/http/client";
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
  private getProviderDisplayName(type: string): string {
    const displayNames: Record<string, string> = {
      openai: "OpenAI",
      azure_openai: "Azure OpenAI",
      google: "Google",
      google_vertex: "Google Vertex AI",
    };
    return displayNames[type] || type;
  }

  async getProviderTemplates(): Promise<ProviderTemplate[]> {
    const modelRegistry: ModelRegistry = await http.get(
      "/xyzen/api/v1/providers/templates",
      { auth: false },
    );

    return Object.entries(modelRegistry).map(([providerType, models]) => ({
      type: providerType,
      display_name: this.getProviderDisplayName(providerType),
      models: models,
    }));
  }

  async getSupportedModels(): Promise<string[]> {
    return http.get("/xyzen/api/v1/providers/models", { auth: false });
  }

  async getAvailableModels(): Promise<Record<string, ModelInfo[]>> {
    return http.get("/xyzen/api/v1/providers/available-models");
  }

  async getDefaultModelConfig(): Promise<DefaultModelConfig> {
    return http.get("/xyzen/api/v1/providers/default-model", { auth: false });
  }

  async getMyProviders(): Promise<LlmProviderResponse[]> {
    return http.get("/xyzen/api/v1/providers/me");
  }

  async getSystemProviders(): Promise<LlmProviderResponse[]> {
    return http.get("/xyzen/api/v1/providers/system");
  }

  async createProvider(
    provider: LlmProviderCreate,
  ): Promise<LlmProviderResponse> {
    return http.post("/xyzen/api/v1/providers/", provider);
  }

  async getProvider(id: string): Promise<LlmProviderResponse> {
    return http.get(`/xyzen/api/v1/providers/${id}`);
  }

  async updateProvider(
    id: string,
    provider: LlmProviderUpdate,
  ): Promise<LlmProviderResponse> {
    return http.patch(`/xyzen/api/v1/providers/${id}`, provider);
  }

  async deleteProvider(id: string): Promise<void> {
    return http.delete(`/xyzen/api/v1/providers/${id}`);
  }
}

export const llmProviderService = new LlmProviderService();

import { llmProviderService } from "@/service/llmProviderService";
import type { DefaultModelConfig } from "@/types/llmProvider";

/**
 * Core business logic for provider/model management
 */
class ProviderCore {
  private defaultModelConfig: DefaultModelConfig | null = null;
  private defaultModelConfigPromise: Promise<DefaultModelConfig> | null = null;

  /**
   * Get the default model configuration from the system
   * Caches the result to avoid multiple API calls
   */
  async getDefaultModelConfig(): Promise<DefaultModelConfig> {
    if (this.defaultModelConfig) {
      return this.defaultModelConfig;
    }

    if (this.defaultModelConfigPromise) {
      return this.defaultModelConfigPromise;
    }

    this.defaultModelConfigPromise = llmProviderService
      .getDefaultModelConfig()
      .then((config) => {
        this.defaultModelConfig = config;
        this.defaultModelConfigPromise = null;
        return config;
      })
      .catch((error) => {
        console.error("Failed to fetch default model config:", error);
        this.defaultModelConfigPromise = null;
        throw error;
      });

    return this.defaultModelConfigPromise;
  }

  /**
   * Get the system provider ID that matches the default model's provider type
   * Returns null if no matching system provider is found
   */
  async getDefaultSystemProviderId(
    llmProviders: Array<{
      id: string;
      provider_type: string;
      is_system: boolean;
    }>,
  ): Promise<string | null> {
    try {
      const defaultConfig = await this.getDefaultModelConfig();
      const systemProvider = llmProviders.find(
        (p) => p.provider_type === defaultConfig.provider_type && p.is_system,
      );
      return systemProvider?.id || null;
    } catch (error) {
      console.error("Failed to get default system provider:", error);
      return null;
    }
  }

  /**
   * Get the default model name from system config
   */
  async getDefaultModelName(): Promise<string | null> {
    try {
      const defaultConfig = await this.getDefaultModelConfig();
      return defaultConfig.key;
    } catch (error) {
      console.error("Failed to get default model name:", error);
      return null;
    }
  }

  /**
   * Get default provider and model for session creation
   * Returns both provider_id and model name, or null values if not available
   */
  async getDefaultProviderAndModel(
    llmProviders: Array<{
      id: string;
      provider_type: string;
      is_system: boolean;
    }>,
  ): Promise<{ providerId: string | null; model: string | null }> {
    try {
      const defaultConfig = await this.getDefaultModelConfig();

      // Reverse mapping from LiteLLM provider to system provider type
      // This matches the backend mapping in service/core/llm/service.py
      const litellmToSystemMapping: Record<string, string> = {
        openai: "openai",
        azure: "azure_openai",
        google: "google",
        vertex_ai: "google_vertex",
        "vertex_ai-language-models": "google_vertex",
      };

      // First try exact match with provider_type from backend
      let matchedProvider = llmProviders.find(
        (p) => p.provider_type === defaultConfig.provider_type,
      );

      // If not found, try mapping from litellm_provider
      if (!matchedProvider && defaultConfig.litellm_provider) {
        const mappedProviderType =
          litellmToSystemMapping[defaultConfig.litellm_provider];

        if (mappedProviderType) {
          matchedProvider = llmProviders.find(
            (p) => p.provider_type === mappedProviderType,
          );
        }
      }

      if (matchedProvider) {
        return {
          providerId: matchedProvider.id,
          model: defaultConfig.key,
        };
      }

      console.error("No matching provider found for default model");
      return { providerId: null, model: null };
    } catch (error) {
      console.error("Failed to get default provider and model:", error);
      return { providerId: null, model: null };
    }
  }

  /**
   * Clear cached default model config (useful for testing or when config changes)
   */
  clearCache(): void {
    this.defaultModelConfig = null;
    this.defaultModelConfigPromise = null;
  }
}

export const providerCore = new ProviderCore();

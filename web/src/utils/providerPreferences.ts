import type { LlmProviderResponse } from "@/types/llmProvider";

interface UserProviderPreferences {
  defaultProviderId: string | null;
  lastUsedProviders: Record<string, string>; // agentId -> providerId
}

/**
 * Manager for client-side provider preferences using localStorage
 */
export class ProviderPreferencesManager {
  private static STORAGE_KEY = "xyzen_provider_preferences";

  /**
   * Get user's provider preferences from localStorage
   */
  static getPreferences(): UserProviderPreferences {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          defaultProviderId: parsed.defaultProviderId || null,
          lastUsedProviders: parsed.lastUsedProviders || {},
        };
      }
    } catch (error) {
      console.warn("Failed to load provider preferences:", error);
    }

    // Return default preferences
    return {
      defaultProviderId: null,
      lastUsedProviders: {},
    };
  }

  /**
   * Save user's provider preferences to localStorage
   */
  private static savePreferences(preferences: UserProviderPreferences): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
      console.error("Failed to save provider preferences:", error);
    }
  }

  /**
   * Set the user's global default provider
   */
  static setDefaultProvider(providerId: string | null): void {
    const preferences = this.getPreferences();
    preferences.defaultProviderId = providerId;
    this.savePreferences(preferences);
  }

  /**
   * Get the user's global default provider ID
   */
  static getDefaultProviderId(): string | null {
    return this.getPreferences().defaultProviderId;
  }

  /**
   * Get the user's global default provider from available providers
   */
  static getDefaultProvider(
    availableProviders: LlmProviderResponse[],
  ): LlmProviderResponse | null {
    const defaultId = this.getDefaultProviderId();
    if (!defaultId) return null;

    return availableProviders.find((p) => p.id === defaultId) || null;
  }

  /**
   * Set the last used provider for a specific agent
   */
  static setLastUsedProviderForAgent(
    agentId: string,
    providerId: string,
  ): void {
    const preferences = this.getPreferences();
    preferences.lastUsedProviders[agentId] = providerId;
    this.savePreferences(preferences);
  }

  /**
   * Get the last used provider for a specific agent
   */
  static getLastUsedProviderForAgent(agentId: string): string | null {
    return this.getPreferences().lastUsedProviders[agentId] || null;
  }

  /**
   * Clear all preferences (useful for logout or reset)
   */
  static clearPreferences(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.error("Failed to clear provider preferences:", error);
    }
  }

  /**
   * Migrate from database-based defaults (temporary migration helper)
   * Call this once when providers are first loaded
   */
  static migrateFromDatabaseDefault(providers: LlmProviderResponse[]): void {
    const preferences = this.getPreferences();

    // Only migrate if no local default is set
    if (!preferences.defaultProviderId) {
      // Find the database default (if any exists from old data)
      const databaseDefault = providers.find(
        (p) => p.is_default && !p.is_system,
      );

      if (databaseDefault) {
        console.info(
          "Migrating database default provider to local preferences:",
          databaseDefault.name,
        );
        this.setDefaultProvider(databaseDefault.id);
      }
    }
  }
}

/**
 * Provider resolution logic with clear hierarchy
 */
export function resolveProviderForAgent(
  agent: { id: string; provider_id?: string | null } | null,
  availableProviders: LlmProviderResponse[],
): LlmProviderResponse | null {
  // 1. Agent has explicit provider
  if (agent?.provider_id) {
    const agentProvider = availableProviders.find(
      (p) => p.id === agent.provider_id,
    );
    if (agentProvider) {
      return agentProvider;
    }
  }

  // 2. User's local default preference
  const userDefault =
    ProviderPreferencesManager.getDefaultProvider(availableProviders);
  if (userDefault && !userDefault.is_system) {
    return userDefault;
  }

  // 3. System provider fallback
  const systemProvider = availableProviders.find((p) => p.is_system);
  if (systemProvider) {
    return systemProvider;
  }

  // 4. First available user provider
  const userProviders = availableProviders.filter((p) => !p.is_system);
  return userProviders[0] || null;
}

/**
 * Get a human-readable description of where the provider comes from
 */
export function getProviderSourceDescription(
  agent: { id: string; provider_id?: string | null } | null,
  provider: LlmProviderResponse | null,
  availableProviders: LlmProviderResponse[],
): string {
  if (!provider) return "无提供商";

  // Agent-specific provider
  if (agent?.provider_id === provider.id) {
    return "助手指定";
  }

  // User's global default
  const userDefault =
    ProviderPreferencesManager.getDefaultProvider(availableProviders);
  if (userDefault?.id === provider.id && !provider.is_system) {
    return "全局默认";
  }

  // System provider
  if (provider.is_system) {
    return "系统";
  }

  // First available fallback
  return "自动选择";
}

import { llmProviderService } from "@/service/llmProviderService";
import type {
  LlmProviderCreate,
  LlmProviderResponse,
  LlmProviderUpdate,
  ProviderTemplate,
  ModelInfo,
} from "@/types/llmProvider";
import {
  ProviderPreferencesManager,
  resolveProviderForAgent,
} from "@/utils/providerPreferences";
import type { StateCreator } from "zustand";
import type { XyzenState } from "../types";

export interface ProviderSlice {
  llmProviders: LlmProviderResponse[];
  llmProvidersLoading: boolean;
  providerTemplates: ProviderTemplate[];
  templatesLoading: boolean;
  availableModels: Record<string, ModelInfo[]>;
  availableModelsLoading: boolean;
  userDefaultProviderId: string | null;

  fetchProviderTemplates: () => Promise<void>;
  fetchMyProviders: () => Promise<void>;
  fetchAvailableModels: () => Promise<void>;
  addProvider: (provider: LlmProviderCreate) => Promise<void>;
  updateProvider: (id: string, provider: LlmProviderUpdate) => Promise<void>;
  removeProvider: (id: string) => Promise<void>;

  // New local default management methods
  initializeProviderPreferences: () => void;
  setUserDefaultProvider: (providerId: string | null) => void;
  getUserDefaultProvider: () => LlmProviderResponse | null;
  resolveProviderForAgent: (
    agent: { id: string; provider_id?: string | null } | null,
  ) => LlmProviderResponse | null;
}

export const createProviderSlice: StateCreator<
  XyzenState,
  [["zustand/immer", never]],
  [],
  ProviderSlice
> = (set, get) => ({
  llmProviders: [],
  llmProvidersLoading: false,
  providerTemplates: [],
  templatesLoading: false,
  availableModels: {},
  availableModelsLoading: false,
  userDefaultProviderId: null,

  fetchProviderTemplates: async () => {
    set({ templatesLoading: true });
    try {
      const templates = await llmProviderService.getProviderTemplates();
      set({ providerTemplates: templates, templatesLoading: false });
    } catch (error) {
      console.error("Failed to fetch provider templates:", error);
      set({ templatesLoading: false });
    }
  },

  fetchMyProviders: async () => {
    set({ llmProvidersLoading: true });
    try {
      const providers = await llmProviderService.getMyProviders();
      set({ llmProviders: providers, llmProvidersLoading: false });

      // Initialize preferences on first load and handle migration
      get().initializeProviderPreferences();
      ProviderPreferencesManager.migrateFromDatabaseDefault(providers);

      // Also fetch available models for these providers
      get().fetchAvailableModels();
    } catch (error) {
      console.error("Failed to fetch your providers:", error);
      set({ llmProvidersLoading: false });
    }
  },

  fetchAvailableModels: async () => {
    set({ availableModelsLoading: true });
    try {
      const models = await llmProviderService.getAvailableModels();
      set({ availableModels: models, availableModelsLoading: false });
    } catch (error) {
      console.error("Failed to fetch available models:", error);
      set({ availableModelsLoading: false });
    }
  },

  initializeProviderPreferences: () => {
    const defaultProviderId = ProviderPreferencesManager.getDefaultProviderId();
    set({ userDefaultProviderId: defaultProviderId });
  },

  setUserDefaultProvider: (providerId) => {
    ProviderPreferencesManager.setDefaultProvider(providerId);
    set({ userDefaultProviderId: providerId });
  },

  getUserDefaultProvider: () => {
    const { llmProviders, userDefaultProviderId } = get();
    if (!userDefaultProviderId) return null;
    return llmProviders.find((p) => p.id === userDefaultProviderId) || null;
  },

  resolveProviderForAgent: (agent) => {
    const { llmProviders } = get();
    return resolveProviderForAgent(agent, llmProviders);
  },

  addProvider: async (provider) => {
    try {
      const newProvider = await llmProviderService.createProvider(provider);
      set((state: ProviderSlice) => {
        state.llmProviders.push(newProvider);
      });

      // Auto-set as default if it's the first user provider and no default is set
      const { llmProviders, userDefaultProviderId } = get();
      const userProviders = llmProviders.filter((p) => !p.is_system);
      if (userProviders.length === 1 && !userDefaultProviderId) {
        get().setUserDefaultProvider(newProvider.id);
      }

      get().closeAddLlmProviderModal();
      get().closeSettingsModal();

      // Refresh available models
      get().fetchAvailableModels();
    } catch (error) {
      console.error("Failed to add provider:", error);
      throw error;
    }
  },

  updateProvider: async (id, provider) => {
    try {
      const updatedProvider = await llmProviderService.updateProvider(
        id,
        provider,
      );
      set((state: ProviderSlice) => {
        const index = state.llmProviders.findIndex((p) => p.id === id);
        if (index !== -1) {
          state.llmProviders[index] = updatedProvider;
        }
      });
    } catch (error) {
      console.error("Failed to update provider:", error);
      throw error;
    }
  },

  removeProvider: async (id) => {
    try {
      await llmProviderService.deleteProvider(id);
      set((state: ProviderSlice) => {
        state.llmProviders = state.llmProviders.filter((p) => p.id !== id);
      });

      // Clear default if we deleted the default provider
      const { userDefaultProviderId } = get();
      if (userDefaultProviderId === id) {
        get().setUserDefaultProvider(null);
      }

      // Refresh available models
      get().fetchAvailableModels();
    } catch (error) {
      console.error("Failed to remove provider:", error);
      throw error;
    }
  },
});

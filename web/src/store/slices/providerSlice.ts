import { llmProviderService } from "@/service/llmProviderService";
import type {
  LlmProviderCreate,
  LlmProviderResponse,
  LlmProviderUpdate,
  ProviderTemplate,
} from "@/types/llmProvider";
import type { StateCreator } from "zustand";
import type { XyzenState } from "../types";

export interface ProviderSlice {
  llmProviders: LlmProviderResponse[];
  llmProvidersLoading: boolean;
  providerTemplates: ProviderTemplate[];
  templatesLoading: boolean;
  defaultProvider: LlmProviderResponse | null;
  defaultProviderLoading: boolean;

  fetchProviderTemplates: () => Promise<void>;
  fetchMyProviders: () => Promise<void>;
  fetchDefaultProvider: () => Promise<void>;
  addProvider: (provider: LlmProviderCreate) => Promise<void>;
  updateProvider: (id: string, provider: LlmProviderUpdate) => Promise<void>;
  removeProvider: (id: string) => Promise<void>;
  setAsDefault: (id: string) => Promise<void>;
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
  defaultProvider: null,
  defaultProviderLoading: false,

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
    } catch (error) {
      console.error("Failed to fetch your providers:", error);
      set({ llmProvidersLoading: false });
    }
  },

  fetchDefaultProvider: async () => {
    set({ defaultProviderLoading: true });
    try {
      const provider = await llmProviderService.getMyDefaultProvider();
      set({ defaultProvider: provider, defaultProviderLoading: false });
    } catch (error) {
      console.error("Failed to fetch default provider:", error);
      set({ defaultProvider: null, defaultProviderLoading: false });
    }
  },

  addProvider: async (provider) => {
    try {
      const newProvider = await llmProviderService.createProvider(provider);
      set((state: ProviderSlice) => {
        state.llmProviders.push(newProvider);
      });
      // Refresh default provider in case this became the default
      await get().fetchDefaultProvider();
      get().closeAddLlmProviderModal();
      get().closeSettingsModal();
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
      // Refresh default if this was the default provider
      if (get().defaultProvider?.id === id) {
        await get().fetchDefaultProvider();
      }
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
      // Refresh default provider if we deleted it
      if (get().defaultProvider?.id === id) {
        await get().fetchDefaultProvider();
      }
    } catch (error) {
      console.error("Failed to remove provider:", error);
      throw error;
    }
  },

  setAsDefault: async (id) => {
    try {
      const updatedProvider = await llmProviderService.setDefaultProvider(id);
      set({ defaultProvider: updatedProvider });
      // Refresh all providers to update is_default flags
      await get().fetchMyProviders();
    } catch (error) {
      console.error("Failed to set default provider:", error);
      throw error;
    }
  },
});

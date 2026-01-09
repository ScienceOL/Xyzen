/**
 * Provider Slice - UI State Only
 *
 * This slice now only manages UI-related state for providers.
 * Server state (providers list, templates, available models) has been
 * migrated to TanStack Query hooks in @/hooks/queries/useProvidersQuery.ts
 *
 * BREAKING CHANGES:
 * - llmProviders -> useMyProviders().data
 * - llmProvidersLoading -> useMyProviders().isLoading
 * - providerTemplates -> useProviderTemplates().data
 * - templatesLoading -> useProviderTemplates().isLoading
 * - availableModels -> useAvailableModels().data
 * - availableModelsLoading -> useAvailableModels().isLoading
 * - fetchProviderTemplates -> auto-fetched by hook
 * - fetchMyProviders -> auto-fetched by hook
 * - fetchAvailableModels -> auto-fetched by hook
 * - addProvider -> useCreateProvider().mutateAsync
 * - updateProvider -> useUpdateProvider().mutateAsync
 * - removeProvider -> useDeleteProvider().mutateAsync
 */

import {
  ProviderPreferencesManager,
  resolveProviderForAgent,
} from "@/utils/providerPreferences";
import type { LlmProviderResponse } from "@/types/llmProvider";
import type { StateCreator } from "zustand";
import type { XyzenState } from "../types";

/**
 * Provider slice interface - UI state only
 */
export interface ProviderSlice {
  // UI State
  userDefaultProviderId: string | null;

  // UI State Methods
  initializeProviderPreferences: () => void;
  setUserDefaultProvider: (providerId: string | null) => void;
  getUserDefaultProvider: (
    providers: LlmProviderResponse[],
  ) => LlmProviderResponse | null;
  resolveProviderForAgent: (
    agent: { id: string; provider_id?: string | null } | null,
    providers: LlmProviderResponse[],
  ) => LlmProviderResponse | null;

  // ========== DEPRECATED - Use TanStack Query hooks instead ==========
  // These are kept temporarily for backward compatibility during migration
  /** @deprecated Use useMyProviders().data instead */
  llmProviders: LlmProviderResponse[];
  /** @deprecated Use useMyProviders().isLoading instead */
  llmProvidersLoading: boolean;
  /** @deprecated Use useProviderTemplates().data instead */
  providerTemplates: never[];
  /** @deprecated Use useProviderTemplates().isLoading instead */
  templatesLoading: boolean;
  /** @deprecated Use useAvailableModels().data instead */
  availableModels: Record<string, never[]>;
  /** @deprecated Use useAvailableModels().isLoading instead */
  availableModelsLoading: boolean;
  /** @deprecated Use useMyProviders() - data is auto-fetched */
  fetchMyProviders: () => Promise<void>;
  /** @deprecated Use useProviderTemplates() - data is auto-fetched */
  fetchProviderTemplates: () => Promise<void>;
  /** @deprecated Use useAvailableModels() - data is auto-fetched */
  fetchAvailableModels: () => Promise<void>;
  /** @deprecated Use useCreateProvider().mutateAsync instead */
  addProvider: (provider: unknown) => Promise<void>;
  /** @deprecated Use useUpdateProvider().mutateAsync instead */
  updateProvider: (id: string, provider: unknown) => Promise<void>;
  /** @deprecated Use useDeleteProvider().mutateAsync instead */
  removeProvider: (id: string) => Promise<void>;
}

export const createProviderSlice: StateCreator<
  XyzenState,
  [["zustand/immer", never]],
  [],
  ProviderSlice
> = (set, get) => ({
  // UI State
  userDefaultProviderId: null,

  // UI State Methods
  initializeProviderPreferences: () => {
    const defaultProviderId = ProviderPreferencesManager.getDefaultProviderId();
    set({ userDefaultProviderId: defaultProviderId });
  },

  setUserDefaultProvider: (providerId) => {
    ProviderPreferencesManager.setDefaultProvider(providerId);
    set({ userDefaultProviderId: providerId });
  },

  getUserDefaultProvider: (providers) => {
    const { userDefaultProviderId } = get();
    if (!userDefaultProviderId) return null;
    return providers.find((p) => p.id === userDefaultProviderId) || null;
  },

  resolveProviderForAgent: (agent, providers) => {
    return resolveProviderForAgent(agent, providers);
  },

  // ========== DEPRECATED - Backward compatibility stubs ==========

  // Empty state - components should migrate to TanStack Query
  llmProviders: [],
  llmProvidersLoading: false,
  providerTemplates: [],
  templatesLoading: false,
  availableModels: {},
  availableModelsLoading: false,

  // No-op functions - components should migrate to TanStack Query
  fetchProviderTemplates: async () => {
    console.warn(
      "[DEPRECATED] fetchProviderTemplates is deprecated. Use useProviderTemplates() hook instead.",
    );
  },

  fetchMyProviders: async () => {
    console.warn(
      "[DEPRECATED] fetchMyProviders is deprecated. Use useMyProviders() hook instead.",
    );
    // Still call initializeProviderPreferences for backward compatibility
    get().initializeProviderPreferences();
  },

  fetchAvailableModels: async () => {
    console.warn(
      "[DEPRECATED] fetchAvailableModels is deprecated. Use useAvailableModels() hook instead.",
    );
  },

  addProvider: async () => {
    console.warn(
      "[DEPRECATED] addProvider is deprecated. Use useCreateProvider().mutateAsync instead.",
    );
    throw new Error(
      "addProvider is deprecated. Use useCreateProvider().mutateAsync instead.",
    );
  },

  updateProvider: async () => {
    console.warn(
      "[DEPRECATED] updateProvider is deprecated. Use useUpdateProvider().mutateAsync instead.",
    );
    throw new Error(
      "updateProvider is deprecated. Use useUpdateProvider().mutateAsync instead.",
    );
  },

  removeProvider: async () => {
    console.warn(
      "[DEPRECATED] removeProvider is deprecated. Use useDeleteProvider().mutateAsync instead.",
    );
    throw new Error(
      "removeProvider is deprecated. Use useDeleteProvider().mutateAsync instead.",
    );
  },
});

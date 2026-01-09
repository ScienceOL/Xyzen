/**
 * TanStack Query hooks for provider data
 *
 * These hooks replace the direct store fetching pattern with proper
 * server state management including caching, background refetching,
 * and automatic error handling.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { llmProviderService } from "@/service/llmProviderService";
import type { LlmProviderCreate, LlmProviderUpdate } from "@/types/llmProvider";
import { queryKeys } from "./queryKeys";

/**
 * Fetch the current user's LLM providers
 *
 * @example
 * ```tsx
 * const { data: providers, isLoading, error } = useMyProviders();
 * ```
 */
export function useMyProviders() {
  return useQuery({
    queryKey: queryKeys.providers.my(),
    queryFn: () => llmProviderService.getMyProviders(),
    staleTime: 5 * 60 * 1000, // Consider fresh for 5 minutes
  });
}

/**
 * Fetch provider templates for creating new providers
 */
export function useProviderTemplates() {
  return useQuery({
    queryKey: queryKeys.providers.templates(),
    queryFn: () => llmProviderService.getProviderTemplates(),
    staleTime: 30 * 60 * 1000, // Templates rarely change, cache for 30 mins
  });
}

/**
 * Fetch available models for the user's providers
 */
export function useAvailableModels() {
  return useQuery({
    queryKey: queryKeys.providers.models(),
    queryFn: () => llmProviderService.getAvailableModels(),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch the default model configuration from system
 */
export function useDefaultModelConfig() {
  return useQuery({
    queryKey: queryKeys.providers.defaultConfig(),
    queryFn: () => llmProviderService.getDefaultModelConfig(),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Create a new provider
 *
 * @example
 * ```tsx
 * const createProvider = useCreateProvider();
 * await createProvider.mutateAsync({ name: 'My Provider', ... });
 * ```
 */
export function useCreateProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (provider: LlmProviderCreate) =>
      llmProviderService.createProvider(provider),
    onSuccess: () => {
      // Invalidate all provider-related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.providers.all });
    },
  });
}

/**
 * Update an existing provider
 */
export function useUpdateProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      provider,
    }: {
      id: string;
      provider: LlmProviderUpdate;
    }) => llmProviderService.updateProvider(id, provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.providers.all });
    },
  });
}

/**
 * Delete a provider
 */
export function useDeleteProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => llmProviderService.deleteProvider(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.providers.all });
    },
  });
}

/**
 * Prefetch providers on app load
 * Can be called outside of React components
 */
export function prefetchProviders(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  return queryClient.prefetchQuery({
    queryKey: queryKeys.providers.my(),
    queryFn: () => llmProviderService.getMyProviders(),
  });
}

/**
 * TanStack Query hooks for data fetching
 *
 * These hooks provide a clean API for fetching server data with proper
 * caching, background refetching, and error handling.
 */

// Query key factory
export { queryKeys } from "./queryKeys";

// Provider queries
export {
  prefetchProviders,
  useAvailableModels,
  useCreateProvider,
  useDefaultModelConfig,
  useDeleteProvider,
  useMyProviders,
  useProviderTemplates,
  useSystemProviders,
  useUpdateProvider,
} from "./useProvidersQuery";

// Session queries
export {
  prefetchSessions,
  useClearSessionTopics,
  useCreateSession,
  useSessionByAgent,
  useSessions,
  useUpdateSession,
} from "./useSessionsQuery";

// Message queries
export {
  useInvalidateTopicMessages,
  usePrefetchTopicMessages,
  useTopicMessages,
  useUpdateMessagesCache,
} from "./useMessagesQuery";

// System queries
export { useBackendVersion, useInvalidateVersion } from "./useSystemQuery";

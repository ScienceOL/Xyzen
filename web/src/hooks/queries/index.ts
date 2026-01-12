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
  useMyProviders,
  useSystemProviders,
  useProviderTemplates,
  useAvailableModels,
  useDefaultModelConfig,
  useCreateProvider,
  useUpdateProvider,
  useDeleteProvider,
  prefetchProviders,
} from "./useProvidersQuery";

// Session queries
export {
  useSessions,
  useSessionByAgent,
  useCreateSession,
  useUpdateSession,
  useClearSessionTopics,
  prefetchSessions,
} from "./useSessionsQuery";

// Message queries
export {
  useTopicMessages,
  useInvalidateTopicMessages,
  useUpdateMessagesCache,
  usePrefetchTopicMessages,
} from "./useMessagesQuery";

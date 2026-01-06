/**
 * TanStack Query hooks for session and topic data
 *
 * These hooks manage the fetching and caching of chat sessions
 * and their associated topics.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  sessionService,
  type SessionCreate,
  type SessionUpdate,
} from "@/service/sessionService";
import { queryKeys } from "./queryKeys";

/**
 * Fetch all sessions for the current user
 *
 * This replaces the chatHistory in the store.
 *
 * @example
 * ```tsx
 * const { data: sessions, isLoading } = useSessions();
 * ```
 */
export function useSessions() {
  return useQuery({
    queryKey: queryKeys.sessions.list(),
    queryFn: () => sessionService.getSessions(),
    staleTime: 2 * 60 * 1000, // Consider fresh for 2 minutes
  });
}

/**
 * Fetch a session by agent ID
 */
export function useSessionByAgent(agentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sessions.detail(agentId ?? ""),
    queryFn: () => sessionService.getSessionByAgent(agentId!),
    enabled: !!agentId,
  });
}

/**
 * Create a new session
 *
 * @example
 * ```tsx
 * const createSession = useCreateSession();
 * const session = await createSession.mutateAsync({
 *   name: 'New Chat',
 *   agent_id: agentId
 * });
 * ```
 */
export function useCreateSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionData: SessionCreate) =>
      sessionService.createSession(sessionData),
    onSuccess: () => {
      // Invalidate sessions list to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    },
  });
}

/**
 * Update a session (including provider and model settings)
 */
export function useUpdateSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sessionId,
      data,
    }: {
      sessionId: string;
      data: SessionUpdate;
    }) => sessionService.updateSession(sessionId, data),
    onSuccess: (_data, variables) => {
      // Invalidate both the specific session and the list
      queryClient.invalidateQueries({
        queryKey: queryKeys.sessions.detail(variables.sessionId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.list() });
    },
  });
}

/**
 * Clear all topics in a session
 */
export function useClearSessionTopics() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) =>
      sessionService.clearSessionTopics(sessionId),
    onSuccess: () => {
      // Invalidate sessions to refresh topic lists
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.topics.all });
    },
  });
}

/**
 * Prefetch sessions on app load
 */
export function prefetchSessions(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  return queryClient.prefetchQuery({
    queryKey: queryKeys.sessions.list(),
    queryFn: () => sessionService.getSessions(),
  });
}

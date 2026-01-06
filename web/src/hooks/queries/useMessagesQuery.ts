/**
 * TanStack Query hooks for message data
 *
 * These hooks manage fetching messages for a specific topic.
 * Note: Real-time message updates are still handled via WebSocket,
 * but initial loading and history use these queries.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authService } from "@/service/authService";
import { useXyzen } from "@/store";
import { groupToolMessagesWithAssistant } from "@/core/chat";
import type { Message } from "@/store/types";
import { queryKeys } from "./queryKeys";

/**
 * Fetch messages for a specific topic
 *
 * @example
 * ```tsx
 * const { data: messages, isLoading } = useTopicMessages(topicId);
 * ```
 */
export function useTopicMessages(topicId: string | null) {
  const { backendUrl } = useXyzen();

  return useQuery({
    queryKey: queryKeys.topics.messages(topicId ?? ""),
    queryFn: async (): Promise<Message[]> => {
      if (!topicId) return [];

      const token = authService.getToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(
        `${backendUrl}/xyzen/api/v1/topics/${topicId}/messages`,
        { headers },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch messages: ${response.status}`);
      }

      const messages = await response.json();

      // Process messages to group tool events with assistant messages
      return groupToolMessagesWithAssistant(messages);
    },
    enabled: !!topicId,
    staleTime: 0, // Always refetch on focus since messages change via WebSocket
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  });
}

/**
 * Invalidate messages cache for a topic
 * Call this after receiving WebSocket updates that should refresh the cache
 */
export function useInvalidateTopicMessages() {
  const queryClient = useQueryClient();

  return (topicId: string) => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.topics.messages(topicId),
    });
  };
}

/**
 * Update messages cache optimistically
 * Use this for adding messages received via WebSocket without refetching
 */
export function useUpdateMessagesCache() {
  const queryClient = useQueryClient();

  return (
    topicId: string,
    updater: (old: Message[] | undefined) => Message[],
  ) => {
    queryClient.setQueryData<Message[]>(
      queryKeys.topics.messages(topicId),
      updater,
    );
  };
}

/**
 * Prefetch messages for a topic
 */
export function usePrefetchTopicMessages() {
  const queryClient = useQueryClient();
  const { backendUrl } = useXyzen();

  return async (topicId: string) => {
    const token = authService.getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    await queryClient.prefetchQuery({
      queryKey: queryKeys.topics.messages(topicId),
      queryFn: async () => {
        const response = await fetch(
          `${backendUrl}/xyzen/api/v1/topics/${topicId}/messages`,
          { headers },
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch messages: ${response.status}`);
        }

        const messages = await response.json();
        return groupToolMessagesWithAssistant(messages);
      },
    });
  };
}

import { syncChannelResponding } from "@/core/chat/channelHelpers";
import { ChunkBuffer } from "@/core/chat/chunkBuffer";
import {
  handleAgentEnd,
  handleAgentError,
  handleAgentStart,
  handleError,
  handleGeneratedFiles,
  handleInsufficientBalance,
  handleMessage,
  handleMessageSaved,
  handleNodeEnd,
  handleNodeStart,
  handleParallelChatLimit,
  handleProcessingOrLoading,
  handleProgressUpdate,
  handleSearchCitations,
  handleStreamAborted,
  handleStreamingEnd,
  handleStreamingStart,
  handleSubagentEnd,
  handleSubagentStart,
  handleThinkingEnd,
  handleThinkingStart,
  handleToolCallRequest,
  handleToolCallResponse,
  handleTopicUpdated,
} from "@/core/chat/handlers";
import xyzenService from "@/service/xyzenService";
import type { MessageEventCallback } from "@/service/xyzenService";
import type { Message } from "../../types";
import { abortTimeoutIds, staleWatchdogIds } from "./helpers";
import type { ChatSlice, GetState, Helpers, SetState } from "./types";

export function createConnectionActions(
  set: SetState,
  get: GetState,
  helpers: Helpers,
) {
  const {
    reconcileChannelFromBackend,
    updateDerivedStatus,
    closeIdleNonPrimaryConnection,
  } = helpers;

  return {
    connectToChannel: (sessionId: string, topicId: string) => {
      console.debug(
        `[connectToChannel] topic=${topicId.slice(0, 8)} hasExistingWs=${xyzenService.hasConnection(topicId)} msgs=${get().channels[topicId]?.messages.length}`,
      );
      // --- 0. Build shared callbacks (defined early so they can be passed to setPrimary or connect) ---

      // Clean up stale watchdog for the *previous* primary topic (not the target)
      const prevPrimary = xyzenService.getPrimaryTopicId();
      if (prevPrimary && prevPrimary !== topicId) {
        const prevTimer = staleWatchdogIds.get(prevPrimary);
        if (prevTimer) {
          clearInterval(prevTimer);
          staleWatchdogIds.delete(prevPrimary);
        }
      }

      // --- Chunk buffering: batch streaming_chunk and thinking_chunk at rAF cadence ---
      const chunkBuffer = new ChunkBuffer((fn) => {
        set((state: ChatSlice) => {
          const channel = state.channels[topicId];
          if (channel) fn(channel);
        });
      });

      // --- Define event callback ---
      const messageEventCallback: MessageEventCallback = (event) => {
        // --- Hot-path: buffer chunk events and flush at rAF cadence ---
        if (event.type === "streaming_chunk") {
          chunkBuffer.pushStreaming(
            event.data.stream_id,
            event.data.content,
            event.data.execution_id,
          );
          return;
        }

        if (event.type === "thinking_chunk") {
          chunkBuffer.pushThinking(event.data.stream_id, event.data.content);
          return;
        }

        // --- Non-chunk events: flush any pending chunks first, then process synchronously ---
        const hadPendingChunks = chunkBuffer.hasPending;
        chunkBuffer.flushSync();

        const preEventResponding = get().channels[topicId]?.responding;

        console.groupCollapsed(
          `[ChatEvent] ${event.type} | topic=${topicId.slice(0, 8)} | responding=${preEventResponding}`,
        );

        set((state: ChatSlice) => {
          const channel = state.channels[topicId];
          if (!channel) return;

          console.debug(
            `msgs=${channel.messages.length}`,
            `| latestAssist=${(() => {
              const la = [...channel.messages]
                .reverse()
                .find((m) => m.role === "assistant");
              return la
                ? `id=${la.id.slice(0, 12)} status=${la.status} isLoading=${la.isLoading} isStreaming=${la.isStreaming} agentExec=${la.agentExecution?.status}`
                : "none";
            })()}`,
          );

          switch (event.type) {
            case "processing":
            case "loading": {
              handleProcessingOrLoading(channel, event.data.stream_id);
              break;
            }

            case "streaming_start": {
              handleStreamingStart(channel, event.data);
              break;
            }

            case "streaming_end": {
              handleStreamingEnd(channel, event.data);
              break;
            }

            case "message": {
              handleMessage(channel, event.data);
              break;
            }

            case "search_citations": {
              handleSearchCitations(channel, event.data);
              break;
            }

            case "generated_files": {
              handleGeneratedFiles(channel, event.data);
              break;
            }

            case "message_saved": {
              handleMessageSaved(channel, event.data);
              break;
            }

            case "message_ack": {
              // Reconcile optimistic user message with server-assigned ID.
              const { message_id, client_id } = event.data;
              if (client_id) {
                const optimisticIdx = channel.messages.findIndex(
                  (m) => m.clientId === client_id,
                );
                if (optimisticIdx !== -1) {
                  const msg = channel.messages[optimisticIdx];
                  msg.id = message_id;
                  if (msg.status === "sending") {
                    msg.status = "completed";
                  }
                }
              }
              break;
            }

            case "tool_call_request": {
              handleToolCallRequest(channel, event.data);
              break;
            }

            case "tool_call_response": {
              handleToolCallResponse(channel, event.data);
              break;
            }

            case "error": {
              handleError(channel, event.data);
              break;
            }

            case "insufficient_balance": {
              const notification = handleInsufficientBalance(
                channel,
                event.data,
              );
              if (notification) {
                state.notification = {
                  ...notification,
                  onAction: notification.actionUrl
                    ? () => window.open(notification.actionUrl, "_blank")
                    : undefined,
                };
              }
              break;
            }

            case "parallel_chat_limit": {
              const notification = handleParallelChatLimit(channel, event.data);
              state.notification = notification;
              break;
            }

            case "stream_aborted": {
              handleStreamAborted(channel, event.data, abortTimeoutIds);
              break;
            }

            case "thinking_start": {
              handleThinkingStart(channel, event.data);
              break;
            }

            case "thinking_end": {
              handleThinkingEnd(channel, event.data);
              break;
            }

            case "topic_updated": {
              handleTopicUpdated(channel, event.data, state.chatHistory);
              break;
            }

            // === Agent Execution Events ===

            case "agent_start": {
              handleAgentStart(channel, event.data);
              break;
            }

            case "agent_end": {
              handleAgentEnd(channel, event.data);
              break;
            }

            case "agent_error": {
              handleAgentError(channel, event.data);
              break;
            }

            case "node_start": {
              handleNodeStart(channel, event.data);
              break;
            }

            case "node_end": {
              handleNodeEnd(channel, event.data);
              break;
            }

            case "subagent_start": {
              handleSubagentStart(channel, event.data);
              break;
            }

            case "subagent_end": {
              handleSubagentEnd(channel, event.data);
              break;
            }

            case "progress_update": {
              handleProgressUpdate(channel, event.data);
              break;
            }

            case "token_usage": {
              const { total_tokens } = event.data;
              channel.tokenUsage = total_tokens;
              break;
            }
          }

          // Keep channel-level responding state consistent even with concurrent streams.
          syncChannelResponding(channel);
        });

        // Log state transition if responding changed
        const postEventResponding = get().channels[topicId]?.responding;
        if (preEventResponding !== postEventResponding) {
          console.debug(
            `responding changed: ${preEventResponding} → ${postEventResponding}`,
            `| hadPendingChunks: ${hadPendingChunks}`,
          );
        }

        console.groupEnd();

        // Chunk events return early above, so all events reaching here are state transitions
        updateDerivedStatus();
        closeIdleNonPrimaryConnection(topicId);
      };

      // --- Shared callbacks for onMessage, onStatusChange, onReconnect ---
      const onMessage = (message: Message & { client_id?: string }) => {
        set((state: ChatSlice) => {
          const channel = state.channels[topicId];
          if (!channel) return;

          // Reconcile with optimistic message if client_id matches
          if (message.client_id) {
            const optimisticIdx = channel.messages.findIndex(
              (m) => m.clientId === message.client_id,
            );
            if (optimisticIdx !== -1) {
              channel.messages[optimisticIdx] = {
                ...channel.messages[optimisticIdx],
                ...message,
                id: message.id,
                status: message.status || "completed",
                isNewMessage: false,
              };
              return;
            }
          }

          // Normal path: push if not duplicate
          if (!channel.messages.some((m) => m.id === message.id)) {
            channel.messages.push({
              ...message,
              status: message.status || "completed",
              isNewMessage: true,
            });
          }
        });
      };

      const onStatusChange = (status: {
        connected: boolean;
        error: string | null;
      }) => {
        set((state: ChatSlice) => {
          const channel = state.channels[topicId];
          if (channel) {
            channel.connected = status.connected;
            channel.error = status.error;
          }
        });
      };

      const onReconnect = () => {
        const channel = get().channels[topicId];
        if (!channel) return;

        const hasStaleState = channel.messages.some((m) =>
          Boolean(
            m.status === "pending" ||
            m.status === "streaming" ||
            m.status === "thinking" ||
            m.isLoading ||
            m.isStreaming ||
            m.isThinking ||
            m.agentExecution?.status === "running",
          ),
        );

        if (hasStaleState) {
          console.debug(
            `[onReconnect] stale state detected, reconciling topic=${topicId.slice(0, 8)} msgs=${channel.messages.length} responding=${channel.responding}`,
          );
          reconcileChannelFromBackend(topicId);
        }
      };

      // --- If the target topic already has a live WS, just promote to primary ---
      if (xyzenService.hasConnection(topicId)) {
        xyzenService.setPrimary(
          topicId,
          onMessage,
          onStatusChange,
          messageEventCallback,
          onReconnect,
        );
        // Mark channel as connected (it already is, but ensure store is consistent)
        set((state: ChatSlice) => {
          if (state.channels[topicId]) {
            state.channels[topicId].connected = true;
            state.channels[topicId].error = null;
          }
        });
        return;
      }

      // --- Close non-responding, non-primary idle connections to avoid leaking ---
      const openTopics = xyzenService.getOpenTopicIds();
      for (const openTopic of openTopics) {
        if (openTopic === topicId) continue;
        const ch = get().channels[openTopic];
        if (!ch?.responding) {
          xyzenService.closeConnection(openTopic);
          const timer = staleWatchdogIds.get(openTopic);
          if (timer) {
            clearInterval(timer);
            staleWatchdogIds.delete(openTopic);
          }
        }
      }

      // --- Mark old channels as disconnected (only those we don't have WS for) ---
      set((state: ChatSlice) => {
        Object.entries(state.channels).forEach(([chId, ch]) => {
          // Keep channels with live WS marked as connected
          if (xyzenService.hasConnection(chId)) return;
          ch.connected = false;
        });
        if (state.channels[topicId]) {
          state.channels[topicId].error = null;
        }
      });

      // --- Open new WS for this topic ---
      xyzenService.connect(
        sessionId,
        topicId,
        onMessage,
        onStatusChange,
        messageEventCallback,
        onReconnect,
      );

      // --- Stale state watchdog ---
      const STALE_STATE_TIMEOUT_MS = 60_000;
      const STALE_CHECK_INTERVAL_MS = 15_000;
      let lastActivityTimestamp = Date.now();

      // Wrap the event callback to track activity for the stale watchdog
      const originalOnMessageEvent = messageEventCallback;
      const wrappedCallback: MessageEventCallback = (event) => {
        lastActivityTimestamp = Date.now();
        originalOnMessageEvent(event);
      };
      // Update the connection's event callback to the wrapped version
      xyzenService.setPrimary(
        topicId,
        onMessage,
        onStatusChange,
        wrappedCallback,
        onReconnect,
      );

      const staleCheckIntervalId = setInterval(() => {
        const channel = get().channels[topicId];
        if (!channel?.responding) return;

        const timeSinceActivity = Date.now() - lastActivityTimestamp;
        if (timeSinceActivity > STALE_STATE_TIMEOUT_MS) {
          console.warn(
            `ChatSlice: Stale state detected for topic ${topicId}: ${timeSinceActivity}ms since last activity, reconciling...`,
          );
          reconcileChannelFromBackend(topicId);
          lastActivityTimestamp = Date.now();
        }
      }, STALE_CHECK_INTERVAL_MS);

      const prevStaleCheck = staleWatchdogIds.get(topicId);
      if (prevStaleCheck) clearInterval(prevStaleCheck);
      staleWatchdogIds.set(topicId, staleCheckIntervalId);
    },

    disconnectFromChannel: () => {
      // Clear all module-level timers before closing connections
      for (const [topicId, timer] of staleWatchdogIds) {
        clearInterval(timer);
        staleWatchdogIds.delete(topicId);
      }
      for (const [topicId, timer] of abortTimeoutIds) {
        clearTimeout(timer);
        abortTimeoutIds.delete(topicId);
      }
      xyzenService.disconnect();
    },

    abortGeneration: (channelId: string) => {
      // Send abort signal to backend via WebSocket
      xyzenService.sendAbort();

      // Clear any existing abort timeout for this channel to prevent stale timers
      const existingTimeout = abortTimeoutIds.get(channelId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        abortTimeoutIds.delete(channelId);
      }

      // Optimistically update UI state
      set((state: ChatSlice) => {
        if (state.channels[channelId]) {
          state.channels[channelId].aborting = true;
        }
      });
      updateDerivedStatus();

      // Timeout fallback: if backend doesn't respond within 10 seconds, reset state
      const timeoutId = setTimeout(() => {
        // Clean up the timeout reference
        abortTimeoutIds.delete(channelId);

        const currentState = get();
        const channel = currentState.channels[channelId];
        if (channel?.aborting) {
          console.warn(
            "Abort timeout: Backend did not respond, resetting state",
          );
          set((state: ChatSlice) => {
            if (state.channels[channelId]) {
              state.channels[channelId].aborting = false;
              state.channels[channelId].responding = false;

              // Handle loading message - convert to cancelled message instead of removing
              const loadingIndex = state.channels[channelId].messages.findIndex(
                (m) => m.isLoading,
              );
              if (loadingIndex !== -1) {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { isLoading: _, ...messageWithoutLoading } =
                  state.channels[channelId].messages[loadingIndex];
                state.channels[channelId].messages[loadingIndex] = {
                  ...messageWithoutLoading,
                  id: `aborted-${Date.now()}`,
                  agentExecution: {
                    agentId: "",
                    agentName: "",
                    agentType: "react",
                    executionId: `aborted-${Date.now()}`,
                    status: "cancelled",
                    startedAt: Date.now(),
                    endedAt: Date.now(),
                    phases: [],
                    subagents: [],
                  },
                };
              }

              // Finalize any streaming message
              const streamingIndex = state.channels[
                channelId
              ].messages.findIndex((m) => m.isStreaming);
              if (streamingIndex !== -1) {
                state.channels[channelId].messages[streamingIndex].isStreaming =
                  false;
              }

              // Mark running agent executions as cancelled
              const agentMsgIndex = state.channels[
                channelId
              ].messages.findIndex(
                (m) => m.agentExecution?.status === "running",
              );
              if (agentMsgIndex !== -1) {
                const execution =
                  state.channels[channelId].messages[agentMsgIndex]
                    .agentExecution;
                if (execution) {
                  execution.status = "cancelled";
                  execution.phases.forEach((phase) => {
                    if (phase.status === "running") {
                      phase.status = "cancelled";
                    }
                  });
                }
                state.channels[channelId].messages[agentMsgIndex].isStreaming =
                  false;
              }
            }
          });
          updateDerivedStatus();
        }
      }, 10000); // 10 second timeout

      // Track the timeout ID for cleanup
      abortTimeoutIds.set(channelId, timeoutId);
    },

    confirmToolCall: (channelId: string, toolCallId: string) => {
      // Send confirmation to backend via WebSocket
      xyzenService.sendStructuredMessage({
        type: "tool_call_confirm",
        data: { toolCallId },
      });

      // Update tool call status in messages
      set((state: ChatSlice) => {
        if (state.channels[channelId]) {
          state.channels[channelId].messages.forEach((message) => {
            if (message.toolCalls) {
              message.toolCalls.forEach((toolCall) => {
                if (
                  toolCall.id === toolCallId &&
                  toolCall.status === "waiting_confirmation"
                ) {
                  toolCall.status = "executing";
                }
              });
            }
          });
        }
      });
    },

    cancelToolCall: (channelId: string, toolCallId: string) => {
      // Send cancellation to backend via WebSocket
      xyzenService.sendStructuredMessage({
        type: "tool_call_cancel",
        data: { toolCallId },
      });

      // Update tool call status to failed in messages
      set((state: ChatSlice) => {
        if (state.channels[channelId]) {
          state.channels[channelId].messages.forEach((message) => {
            if (message.toolCalls) {
              message.toolCalls.forEach((toolCall) => {
                if (
                  toolCall.id === toolCallId &&
                  toolCall.status === "waiting_confirmation"
                ) {
                  toolCall.status = "failed";
                  toolCall.error = "用户取消执行";
                }
              });
            }
          });
        }
      });
    },
  };
}

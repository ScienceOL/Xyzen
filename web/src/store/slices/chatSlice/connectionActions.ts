import { syncChannelResponding } from "@/core/chat/channelHelpers";
import { ChunkBuffer } from "@/core/chat/chunkBuffer";
import {
  handleAgentEnd,
  handleAgentError,
  handleAgentStart,
  handleAskUserQuestion,
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
  handleContextUsage,
} from "@/core/chat/handlers";
import sseClient from "@/service/sseClient";
import { topicService } from "@/service/topicService";
import type { ChatEvent } from "@/types/chatEvents";
import { abortTimeoutIds } from "./helpers";
import type { ChatSlice, GetState, Helpers, SetState } from "./types";

// Track ChunkBuffers per topic so we can destroy() the old one before creating a new one.
const chunkBuffers = new Map<string, ChunkBuffer>();

export function createConnectionActions(
  set: SetState,
  get: GetState,
  helpers: Helpers,
) {
  const { updateDerivedStatus, closeIdleNonPrimaryConnection } = helpers;

  return {
    connectToChannel: (_sessionId: string, topicId: string) => {
      console.debug(
        `[connectToChannel] topic=${topicId.slice(0, 8)} hasExistingSSE=${sseClient.hasConnection(topicId)} msgs=${get().channels[topicId]?.messages.length}`,
      );

      // --- Chunk buffering: batch streaming_chunk and thinking_chunk at rAF cadence ---
      // Destroy previous buffer to avoid orphaned rAF callbacks mutating stale state.
      chunkBuffers.get(topicId)?.destroy();
      const chunkBuffer = new ChunkBuffer((fn) => {
        set((state: ChatSlice) => {
          const channel = state.channels[topicId];
          if (channel) fn(channel);
        });
      });
      chunkBuffers.set(topicId, chunkBuffer);

      // --- Define event callback (identical to WS version) ---
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messageEventCallback = (event: { type: string; data: any }) => {
        const typedEvent = event as ChatEvent;

        // --- Hot-path: buffer chunk events and flush at rAF cadence ---
        if (typedEvent.type === "streaming_chunk") {
          chunkBuffer.pushStreaming(
            typedEvent.data.stream_id,
            typedEvent.data.content,
            typedEvent.data.execution_id,
          );
          return;
        }

        if (typedEvent.type === "thinking_chunk") {
          chunkBuffer.pushThinking(
            typedEvent.data.stream_id,
            typedEvent.data.content,
          );
          return;
        }

        // --- Non-chunk events: flush any pending chunks first, then process synchronously ---
        const hadPendingChunks = chunkBuffer.hasPending;
        chunkBuffer.flushSync();

        const preEventResponding = get().channels[topicId]?.responding;

        console.groupCollapsed(
          `[ChatEvent] ${typedEvent.type} | topic=${topicId.slice(0, 8)} | responding=${preEventResponding}`,
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

          switch (typedEvent.type) {
            case "processing":
            case "loading": {
              handleProcessingOrLoading(channel, typedEvent.data.stream_id);
              break;
            }

            case "streaming_start": {
              handleStreamingStart(channel, typedEvent.data);
              break;
            }

            case "streaming_end": {
              handleStreamingEnd(channel, typedEvent.data);
              break;
            }

            case "message": {
              // Reconcile with optimistic message if client_id matches (user echo)
              const msgData = typedEvent.data;
              // Server sends snake_case client_id; frontend Message type uses camelCase clientId
              const serverClientId = (
                msgData as unknown as { client_id?: string }
              ).client_id;
              if (serverClientId) {
                const optimisticIdx = channel.messages.findIndex(
                  (m) => m.clientId === serverClientId,
                );
                if (optimisticIdx !== -1) {
                  const existing = channel.messages[optimisticIdx];
                  channel.messages[optimisticIdx] = {
                    ...existing,
                    ...msgData,
                    id: msgData.id,
                    status: msgData.status || "completed",
                    isNewMessage: false,
                  };
                  break;
                }
              }
              handleMessage(channel, msgData);
              break;
            }

            case "search_citations": {
              handleSearchCitations(channel, typedEvent.data);
              break;
            }

            case "generated_files": {
              handleGeneratedFiles(channel, typedEvent.data);
              break;
            }

            case "message_saved": {
              handleMessageSaved(channel, typedEvent.data);
              break;
            }

            case "message_ack": {
              // Reconcile optimistic user message with server-assigned ID.
              const { message_id, client_id } = typedEvent.data;
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
              handleToolCallRequest(channel, typedEvent.data);
              break;
            }

            case "tool_call_response": {
              handleToolCallResponse(channel, typedEvent.data);
              break;
            }

            case "error": {
              handleError(channel, typedEvent.data);
              break;
            }

            case "insufficient_balance": {
              const notification = handleInsufficientBalance(
                channel,
                typedEvent.data,
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
              const notification = handleParallelChatLimit(
                channel,
                typedEvent.data,
              );
              state.notification = notification;
              break;
            }

            case "stream_aborted": {
              handleStreamAborted(channel, typedEvent.data, abortTimeoutIds);
              break;
            }

            case "thinking_start": {
              handleThinkingStart(channel, typedEvent.data);
              break;
            }

            case "thinking_end": {
              handleThinkingEnd(channel, typedEvent.data);
              break;
            }

            case "topic_updated": {
              handleTopicUpdated(channel, typedEvent.data, state.chatHistory);
              break;
            }

            // === Agent Execution Events ===

            case "agent_start": {
              handleAgentStart(channel, typedEvent.data);
              break;
            }

            case "agent_end": {
              handleAgentEnd(channel, typedEvent.data);
              break;
            }

            case "agent_error": {
              handleAgentError(channel, typedEvent.data);
              break;
            }

            case "node_start": {
              handleNodeStart(channel, typedEvent.data);
              break;
            }

            case "node_end": {
              handleNodeEnd(channel, typedEvent.data);
              break;
            }

            case "subagent_start": {
              handleSubagentStart(channel, typedEvent.data);
              break;
            }

            case "subagent_end": {
              handleSubagentEnd(channel, typedEvent.data);
              break;
            }

            case "progress_update": {
              handleProgressUpdate(channel, typedEvent.data);
              break;
            }

            case "ask_user_question": {
              handleAskUserQuestion(channel, typedEvent.data);
              break;
            }

            case "token_usage": {
              const { total_tokens } = typedEvent.data;
              channel.tokenUsage = total_tokens;
              break;
            }

            case "context_usage": {
              handleContextUsage(channel, typedEvent.data);
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

        // Sync tab name when topic is renamed by the backend
        if (typedEvent.type === "topic_updated") {
          get().renameTab(typedEvent.data.id, typedEvent.data.name);
        }

        // Chunk events return early above, so all events reaching here are state transitions
        updateDerivedStatus();
        closeIdleNonPrimaryConnection(topicId);
      };

      // --- If the target topic already has a live SSE connection, just update callbacks ---
      if (sseClient.hasConnection(topicId)) {
        sseClient.updateCallbacks(topicId, {
          onMessageEvent: messageEventCallback,
          onStatusChange: (status) => {
            set((state: ChatSlice) => {
              const channel = state.channels[topicId];
              if (channel) {
                channel.connected = status.connected;
                channel.error = status.error ?? null;
              }
            });
          },
        });
        // Mark channel as connected
        set((state: ChatSlice) => {
          if (state.channels[topicId]) {
            state.channels[topicId].connected = true;
            state.channels[topicId].error = null;
          }
        });
        return;
      }

      // --- Close non-responding idle connections to avoid leaking ---
      const openTopics = sseClient.getOpenTopicIds();
      for (const openTopic of openTopics) {
        if (openTopic === topicId) continue;
        const ch = get().channels[openTopic];
        if (!ch?.responding) {
          sseClient.disconnect(openTopic);
        }
      }

      // --- Mark old channels as disconnected (only those without SSE) ---
      set((state: ChatSlice) => {
        Object.entries(state.channels).forEach(([chId, ch]) => {
          if (sseClient.hasConnection(chId)) return;
          ch.connected = false;
        });
        if (state.channels[topicId]) {
          state.channels[topicId].error = null;
        }
      });

      // --- Open new SSE connection for this topic ---
      sseClient.connect(topicId, {
        onMessageEvent: messageEventCallback,
        onStatusChange: (status) => {
          set((state: ChatSlice) => {
            const channel = state.channels[topicId];
            if (channel) {
              channel.connected = status.connected;
              channel.error = status.error ?? null;
            }
          });
        },
      });
    },

    disconnectFromChannel: () => {
      // Destroy all chunk buffers to cancel pending rAF callbacks
      for (const [, buffer] of chunkBuffers) {
        buffer.destroy();
      }
      chunkBuffers.clear();

      // Clear all module-level timers before closing connections
      for (const [topicId, timer] of abortTimeoutIds) {
        clearTimeout(timer);
        abortTimeoutIds.delete(topicId);
      }
      sseClient.disconnectAll();
    },

    abortGeneration: (channelId: string) => {
      // Send abort signal to backend via REST
      topicService.abort(channelId).catch((err: unknown) => {
        console.error("Failed to send abort signal:", err);
      });

      // Clear any existing abort timeout for this channel to prevent stale timers
      const existingTimeout = abortTimeoutIds.get(channelId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        abortTimeoutIds.delete(channelId);
      }

      // Optimistically update UI state — immediately finalize messages so
      // the "stopped" indicator appears without waiting for the backend
      // stream_aborted event.  All mutations here are idempotent; the
      // subsequent handleStreamAborted call will simply re-set the same values.
      set((state: ChatSlice) => {
        const channel = state.channels[channelId];
        if (!channel) return;

        channel.aborting = true;

        // Finalize streaming message
        const streamingMsg = channel.messages.find((m) => m.isStreaming);
        if (streamingMsg) {
          streamingMsg.isStreaming = false;
          streamingMsg.status = "cancelled";
        }

        // Mark running agent execution as cancelled
        const agentMsg = channel.messages.find(
          (m) => m.agentExecution?.status === "running",
        );
        if (agentMsg?.agentExecution) {
          agentMsg.agentExecution.status = "cancelled";
          agentMsg.agentExecution.endedAt = Date.now();
          for (const phase of agentMsg.agentExecution.phases) {
            if (phase.status === "running") {
              phase.status = "cancelled";
            }
          }
          agentMsg.isStreaming = false;
        }

        // Convert loading message to cancelled placeholder
        const loadingMsg = channel.messages.find((m) => m.isLoading);
        if (loadingMsg) {
          const loadingIndex = channel.messages.indexOf(loadingMsg);

          const { isLoading: _, ...rest } = channel.messages[loadingIndex];
          channel.messages[loadingIndex] = {
            ...rest,
            id: `aborted-${Date.now()}`,
            status: "cancelled",
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

    respondToQuestion: (
      channelId: string,
      questionId: string,
      response: {
        selectedOptions?: string[];
        text?: string;
        timedOut?: boolean;
      },
    ) => {
      // Send response to backend via REST
      topicService
        .answerQuestion(channelId, {
          question_id: questionId,
          selected_options: response.selectedOptions,
          text: response.text || "",
        })
        .catch((err: unknown) => {
          console.error("Failed to send question response:", err);
        });

      // Update local state
      set((state: ChatSlice) => {
        const channel = state.channels[channelId];
        if (!channel) return;

        const msg = channel.messages.find(
          (m) => m.userQuestion?.questionId === questionId,
        );
        if (msg?.userQuestion) {
          msg.userQuestion.status = "answered";
          msg.userQuestion.selectedOptions = response.selectedOptions;
          msg.userQuestion.userText = response.text;
          msg.status = "pending";
        }
      });
      updateDerivedStatus();
    },

    confirmToolCall: (channelId: string, toolCallId: string) => {
      // Tool confirmations are not yet migrated to REST — currently unused
      // (implicit execution is assumed/enforced)
      console.warn("confirmToolCall: not implemented in SSE mode");

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
      // Tool cancellations are not yet migrated to REST — currently unused
      // (implicit execution is assumed/enforced)
      console.warn("cancelToolCall: not implemented in SSE mode");

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

/**
 * MessageContent — shared content renderer for message bodies.
 *
 * Used by ChatBubble (live chat) and SharedChatPage (public share view).
 * Handles thinking bubble, agent execution timeline, tool call pills,
 * error cards, markdown content, and streaming/loading indicators.
 */

import type { AgentExecutionState } from "@/types/agentEvents";
import type { MessageError } from "@/store/types";
import Markdown from "@/lib/Markdown";
import { StopCircle } from "lucide-react";
import { motion } from "framer-motion";
import { memo, useDeferredValue, useMemo } from "react";
import { useTranslation } from "react-i18next";
import AgentExecutionTimeline from "./AgentExecutionTimeline";
import ErrorMessageCard from "./ErrorMessageCard";
import LoadingMessage from "./LoadingMessage";
import ThinkingBubble from "./ThinkingBubble";

export interface MessageContentProps {
  isUser: boolean;
  /** Resolved text content to display */
  content: string;

  // --- Rich content ---
  thinkingContent?: string;
  isThinking?: boolean;
  agentExecution?: AgentExecutionState;
  error?: MessageError;

  // --- Display state (live chat only, all default to false) ---
  isStreaming?: boolean;
  isLoading?: boolean;
  isCancelled?: boolean;
}

function MessageContent({
  isUser,
  content,
  thinkingContent,
  isThinking = false,
  agentExecution,
  error,
  isStreaming = false,
  isLoading = false,
  isCancelled = false,
}: MessageContentProps) {
  const { t } = useTranslation();

  // Defer content updates for streaming performance
  const deferredContent = useDeferredValue(content);
  const markdownContent = useMemo(
    () => <Markdown content={deferredContent} />,
    [deferredContent],
  );

  const hasTimeline =
    !!agentExecution &&
    (agentExecution.phases.length > 0 || agentExecution.status === "cancelled");

  const isExecuting = agentExecution?.status === "running";

  // Compute display mode from props (equivalent to getMessageDisplayMode)
  const showLoading = isLoading && !error;
  const showTimelineOnly = hasTimeline && isExecuting; // timeline_streaming
  const showContentBelowTimeline = hasTimeline && !isExecuting; // timeline_complete

  return (
    <div
      className={`prose prose-neutral dark:prose-invert prose-sm max-w-none min-w-0 overflow-x-auto select-text break-words ${
        isUser
          ? "text-sm text-neutral-800 dark:text-neutral-200"
          : "text-sm text-neutral-700 dark:text-neutral-300"
      }`}
    >
      {/* Thinking content — shown before main response for assistant messages */}
      {!isUser && thinkingContent && (
        <ThinkingBubble content={thinkingContent} isThinking={isThinking} />
      )}

      {/* Agent execution timeline */}
      {!isUser && hasTimeline && (
        <AgentExecutionTimeline
          execution={agentExecution}
          isExecuting={isExecuting}
        />
      )}

      {/* Error message card — rendered instead of normal content */}
      {error && <ErrorMessageCard error={error} />}

      {/* Message content based on display mode */}
      {!error &&
        (() => {
          if (showLoading) {
            return (
              <span className="inline-flex items-center gap-1">
                <LoadingMessage size="small" />
              </span>
            );
          }
          if (showTimelineOnly) {
            // Content shown in AgentExecutionTimeline phases during streaming
            return null;
          }
          if (showContentBelowTimeline) {
            return deferredContent ? (
              <div className="mt-4">
                <Markdown content={deferredContent} />
              </div>
            ) : null;
          }
          // Simple mode
          return markdownContent;
        })()}

      {/* Streaming cursor */}
      {isStreaming && !isLoading && (
        <motion.span
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1, repeat: Infinity }}
          className="ml-1 inline-block h-4 w-0.5 bg-current"
        />
      )}

      {/* Stopped indicator for simple messages without agentExecution */}
      {!isUser && isCancelled && !agentExecution && (
        <div className="mt-2 flex items-center gap-1.5 text-[13px] text-neutral-400 dark:text-neutral-500">
          <StopCircle className="h-3.5 w-3.5" />
          <span>{t("app.chat.agent.stopped")}</span>
        </div>
      )}
    </div>
  );
}

export default memo(MessageContent);

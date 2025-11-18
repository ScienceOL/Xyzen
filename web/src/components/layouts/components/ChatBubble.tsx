import ProfileIcon from "@/assets/ProfileIcon";
import { ChartRenderer } from "@/components/charts/ChartRenderer";
import JsonDisplay from "@/components/shared/JsonDisplay";
import Markdown from "@/lib/Markdown";
import { useXyzen } from "@/store";
import type { Message, ToolCall } from "@/store/types";
import { detectChart } from "@/utils/chartDetection";
import {
  parseToolMessage,
  toolEventToToolCall,
} from "@/utils/toolMessageParser";
import LoadingMessage from "./LoadingMessage";
import ToolCallCard from "./ToolCallCard";

import { motion } from "framer-motion";
import { useCallback, useMemo } from "react";

interface ChatBubbleProps {
  message: Message;
}

function ChatBubble({ message }: ChatBubbleProps) {
  const { confirmToolCall, cancelToolCall, activeChatChannel } = useXyzen();

  const { role, content, created_at, isLoading, isStreaming, toolCalls } =
    message;

  // Parse tool messages from history
  const parsedToolCall = useMemo<ToolCall | null>(() => {
    if (role === "tool") {
      const parsed = parseToolMessage(content);
      if (parsed) {
        return toolEventToToolCall(parsed);
      }
    }
    return null;
  }, [role, content]);

  // Detect if assistant message contains chart data
  const chartDetection = useMemo(() => {
    if (role === "assistant" && content && !isLoading && !isStreaming) {
      try {
        // Try to parse the entire content as JSON first
        const parsed = JSON.parse(content);
        return detectChart(parsed);
      } catch {
        // Check for JSON code blocks in markdown
        const jsonBlockRegex = /```json\s*\n([\s\S]*?)\n```/g;
        let matches = Array.from(content.matchAll(jsonBlockRegex));

        for (const match of matches) {
          try {
            const parsed = JSON.parse(match[1]);
            const detection = detectChart(parsed);
            if (detection.isChartable) {
              return detection;
            }
          } catch {
            continue;
          }
        }

        // Check for JSON objects embedded in text - more robust regex for nested objects
        const jsonObjectRegex =
          /(\{"chart":\s*\{[^}]*(?:\{[^}]*\}[^}]*)*\}[^}]*\})/g;
        matches = Array.from(content.matchAll(jsonObjectRegex));

        for (const match of matches) {
          try {
            const parsed = JSON.parse(match[1]);
            const detection = detectChart(parsed);
            if (detection.isChartable) {
              return detection;
            }
          } catch {
            continue;
          }
        }

        // More aggressive JSON detection - look for lines that might contain complete JSON
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          // Try to find lines that start with {"chart": and might be complete JSON
          if (line.startsWith('{"chart":') || line.startsWith('{ "chart":')) {
            try {
              const parsed = JSON.parse(line);
              const detection = detectChart(parsed);
              if (detection.isChartable) {
                return detection;
              }
            } catch {
              continue;
            }
          }
        }

        // Last resort: try to extract any JSON-like structure
        const jsonLikeRegex = /\{[\s\S]*?"chart"[\s\S]*?\}/g;
        matches = Array.from(content.matchAll(jsonLikeRegex));

        for (const match of matches) {
          try {
            const parsed = JSON.parse(match[0]);
            const detection = detectChart(parsed);
            if (detection.isChartable) {
              return detection;
            }
          } catch {
            continue;
          }
        }
      }
    }
    return {
      isChartable: false,
      chartType: null,
      confidence: 0,
      data: null,
      reason: "No chart detected",
    };
  }, [role, content, isLoading, isStreaming]);

  const isUserMessage = role === "user";
  const isToolMessage = role === "tool";

  // Updated time format to include seconds
  const formattedTime = new Date(created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  // Render message content based on type and chart detection
  const renderMessageContent = useCallback(() => {
    if (isLoading) {
      return <LoadingMessage />;
    } else if (isUserMessage) {
      return <p>{content}</p>;
    } else if (chartDetection.isChartable && chartDetection.data) {
      // Validate chart data before rendering
      if (!chartDetection.data || typeof chartDetection.data !== "object") {
        return (
          <div className="space-y-3">
            <div className="text-red-600 p-3 bg-red-50 dark:bg-red-900/20 rounded">
              Chart Error: Invalid data format
            </div>
          </div>
        );
      }

      // Extract text content before the JSON
      const jsonMatch = content.match(/\{"chart":/);
      const textBeforeJson = jsonMatch
        ? content.substring(0, jsonMatch.index).trim()
        : "";

      return (
        <div className="space-y-3">
          {textBeforeJson && (
            <div className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              <Markdown content={textBeforeJson} />
            </div>
          )}

          {/* Clean Chart Container */}
          <div className="w-full bg-white dark:bg-gray-800 rounded-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <ChartRenderer
              data={chartDetection.data}
              height={450}
              className="w-full"
            />
          </div>
        </div>
      );
    } else {
      return <Markdown content={content} />;
    }
  }, [isLoading, isUserMessage, chartDetection, content]);

  // Different styles for user vs AI messages
  const messageStyles = isUserMessage
    ? "rounded-sm border-blue-400 bg-blue-50/50 dark:border-blue-600 dark:bg-blue-900/20"
    : "rounded-sm border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800/50";

  // Loading state styles
  const loadingStyles = isLoading
    ? "rounded-sm border-purple-400 bg-purple-50/30 dark:border-purple-500 dark:bg-purple-900/10"
    : messageStyles;

  // Streaming animation styles
  const streamingStyles = isStreaming
    ? "rounded-sm border-green-400 bg-green-50/30 dark:border-green-500 dark:bg-green-900/10"
    : loadingStyles;

  // 渲染头像，使用初始字母作为最后的备用选项
  const renderAvatar = () => {
    if (isUserMessage) {
      return (
        <ProfileIcon className="h-6 w-6 rounded-full text-neutral-700 dark:text-neutral-300" />
      );
    }

    if (isToolMessage) {
      // Tool message icon
      return (
        <div
          className={`flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white`}
        >
          <span className="text-xs">🔧</span>
        </div>
      );
    }

    // AI助手头像显示首字母
    const initial = role?.charAt(0)?.toUpperCase() || "A";

    return (
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-full bg-purple-500 text-white`}
      >
        <span className="text-xs font-medium">{initial}</span>
      </div>
    );
  };

  // If this is a tool message from history, render as ToolCallCard
  if (isToolMessage) {
    if (parsedToolCall) {
      return (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="group relative w-full pl-8"
        >
          {/* Timestamp */}
          <div className="absolute -top-6 left-8 z-10 transform opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span className="rounded px-2 py-1 text-xs text-neutral-500 dark:text-neutral-400">
              {formattedTime}
            </span>
          </div>

          {/* Avatar */}
          <div className="absolute left-0 top-1">{renderAvatar()}</div>

          {/* Tool Card */}
          <div className="w-full">
            <ToolCallCard
              toolCall={parsedToolCall}
              // No confirm/cancel buttons for history (read-only)
              onConfirm={undefined}
              onCancel={undefined}
            />
          </div>
        </motion.div>
      );
    } else {
      // Fallback: show raw JSON if parsing fails
      return (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="group relative w-full pl-8"
        >
          {/* Timestamp */}
          <div className="absolute -top-6 left-8 z-10 transform opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span className="rounded px-2 py-1 text-xs text-neutral-500 dark:text-neutral-400">
              {formattedTime}
            </span>
          </div>

          {/* Avatar */}
          <div className="absolute left-0 top-1">{renderAvatar()}</div>

          {/* Raw JSON display */}
          <div className="w-full border-l-2 border-orange-400 bg-orange-50/50 dark:border-orange-600 dark:bg-orange-900/20 p-3 rounded-none">
            <JsonDisplay
              data={(() => {
                try {
                  return JSON.parse(content);
                } catch {
                  return content;
                }
              })()}
              compact
              variant="default"
              className="bg-transparent border-0"
            />
          </div>
        </motion.div>
      );
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="group relative w-full pl-8"
    >
      {/* Timestamp - hidden by default, shown on hover */}
      <div className="absolute -top-6 left-8 z-10 transform opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <span className="rounded px-2 py-1 text-xs text-neutral-500  dark:text-neutral-400">
          {formattedTime}
        </span>
      </div>

      {/* Avatar - positioned to the left */}
      <div className="absolute left-0 top-1">{renderAvatar()}</div>

      {/* Message content */}
      <div
        className={`w-full min-w-0 rounded-none ${streamingStyles} transition-all duration-200 hover:shadow-sm`}
      >
        <div className="px-4 py-3 min-w-0">
          <div
            className={`prose prose-neutral dark:prose-invert prose-sm max-w-none min-w-0 overflow-x-auto ${
              isUserMessage
                ? "text-sm text-neutral-800 dark:text-neutral-200"
                : "text-sm text-neutral-700 dark:text-neutral-300"
            }`}
          >
            {renderMessageContent()}
            {isStreaming && !isLoading && (
              <motion.span
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="ml-1 inline-block h-4 w-0.5 bg-current"
              />
            )}
          </div>

          {/* Tool Calls */}
          {toolCalls && toolCalls.length > 0 && (
            <div className="mt-4 space-y-3">
              {toolCalls.map((toolCall) => (
                <ToolCallCard
                  key={toolCall.id}
                  toolCall={toolCall}
                  onConfirm={(toolCallId) =>
                    activeChatChannel &&
                    confirmToolCall(activeChatChannel, toolCallId)
                  }
                  onCancel={(toolCallId) =>
                    activeChatChannel &&
                    cancelToolCall(activeChatChannel, toolCallId)
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default ChatBubble;

import ProfileIcon from "@/assets/ProfileIcon";
// import { TYPEWRITER_CONFIG } from "@/configs/typewriterConfig";
// import { useStreamingTypewriter } from "@/hooks/useTypewriterEffect";
import Markdown from "@/lib/Markdown";
import { useXyzen } from "@/store";
import type { Message } from "@/store/types";
import { CheckIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { motion } from "framer-motion";
import { useDeferredValue, useMemo, useState } from "react";
import AgentExecutionTimeline from "./AgentExecutionTimeline";
import LoadingMessage from "./LoadingMessage";
import MessageAttachments from "./MessageAttachments";
import { SearchCitations } from "./SearchCitations";
import ThinkingBubble from "./ThinkingBubble";
import ToolCallCard from "./ToolCallCard";

interface ChatBubbleProps {
  message: Message;
}

function ChatBubble({ message }: ChatBubbleProps) {
  const [isCopied, setIsCopied] = useState(false);
  const confirmToolCall = useXyzen((state) => state.confirmToolCall);
  const cancelToolCall = useXyzen((state) => state.cancelToolCall);
  const activeChatChannel = useXyzen((state) => state.activeChatChannel);

  const {
    role,
    content,
    created_at,
    isLoading,
    isStreaming,
    // isNewMessage,
    toolCalls,
    attachments,
    citations,
    isThinking,
    thinkingContent,
    agentExecution,
  } = message;

  // 流式消息打字效果
  // 记录消息是否首次是新消息，确保打字效果只在首次时启用
  // const wasNewMessageRef = useRef(isNewMessage ?? false);

  // useEffect(() => {
  //   // 一旦 isNewMessage 变成 false，就不再启用打字效果
  //   if (!isNewMessage && wasNewMessageRef.current) {
  //     wasNewMessageRef.current = false;
  //   }
  // }, [isNewMessage]);

  // 仅在消息首次是新消息且为 Assistant 消消息时才启用打字效果
  // 一旦消息完成流式传输（isNewMessage 变为 false），就禁用打字效果
  // const shouldEnableTypewriter =
  //   TYPEWRITER_CONFIG.enabled &&
  //   role === "assistant" &&
  //   wasNewMessageRef.current;

  // const { opacity } = useStreamingTypewriter(
  //   content,
  //   (isStreaming ?? false) || (isLoading ?? false),
  //   {
  //     enabled: shouldEnableTypewriter,
  //     fadeDuration: TYPEWRITER_CONFIG.fadeDuration || 300,
  //   },
  // );

  // Use deferred value and memoization to optimize rendering performance
  // 创建带有渐变效果的 Markdown 内容
  const deferredContent = useDeferredValue(content);
  const markdownContent = useMemo(
    () => <Markdown content={deferredContent} />,
    [deferredContent],
  );
  // 仅当正在接收流式数据且启用了打字效果时才显示打字状态
  // const isTyping = shouldEnableTypewriter && (isStreaming ?? false);

  const isUserMessage = role === "user";
  const isToolMessage = toolCalls && toolCalls.length > 0;

  // Updated time format to include seconds
  const formattedTime = new Date(created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

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

  const handleCopy = () => {
    if (content) {
      navigator.clipboard.writeText(content).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000); // Reset after 2 seconds
      });
    }
  };

  // If this is a tool message from history, render as ToolCallCard
  if (isToolMessage) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="group relative w-full pl-8"
      >
        {toolCalls && toolCalls.length > 0 && (
          <div className="mt-1 space-y-3">
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
      </motion.div>
    );
  } else {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="group relative w-full pl-8 my-2"
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
            {/* File Attachments - shown before text for user messages */}
            {isUserMessage && attachments && attachments.length > 0 && (
              <div className="mb-3">
                <MessageAttachments attachments={attachments} />
              </div>
            )}

            <div
              className={`prose prose-neutral dark:prose-invert prose-sm max-w-none min-w-0 overflow-x-auto select-text ${
                isUserMessage
                  ? "text-sm text-neutral-800 dark:text-neutral-200"
                  : "text-sm text-neutral-700 dark:text-neutral-300"
              }`}
            >
              {/* Agent execution timeline - only show for multi-phase agent types */}
              {/* Skip timeline for react/simple agents - they just show content directly */}
              {!isUserMessage &&
                agentExecution &&
                agentExecution.agentType !== "react" && (
                  <AgentExecutionTimeline
                    execution={agentExecution}
                    isExecuting={agentExecution.status === "running"}
                  />
                )}

              {/* Thinking content - shown before main response for assistant messages */}
              {!isUserMessage && thinkingContent && (
                <ThinkingBubble
                  content={thinkingContent}
                  isThinking={isThinking ?? false}
                />
              )}

              {(() => {
                // Explicit loading state
                if (isLoading) {
                  return <LoadingMessage size="medium" className="text-sm" />;
                }

                // No agent execution - regular chat
                if (!agentExecution) {
                  return markdownContent;
                }

                // React/simple agents - show streaming content from phase or message.content
                if (agentExecution.agentType === "react") {
                  // If we have phases with streamedContent, show that
                  if (agentExecution.phases.length > 0) {
                    const activePhase = agentExecution.phases.find(
                      (p) => p.status === "running",
                    );
                    const phaseContent =
                      activePhase?.streamedContent ||
                      agentExecution.phases[agentExecution.phases.length - 1]
                        ?.streamedContent;
                    if (phaseContent) {
                      return <Markdown content={phaseContent} />;
                    }
                  }

                  // Still waiting for content - show loading animation
                  // This handles the gap between agent_start and first streaming_chunk
                  if (
                    agentExecution.status === "running" &&
                    !content &&
                    agentExecution.phases.length === 0
                  ) {
                    return <LoadingMessage size="medium" className="text-sm" />;
                  }

                  // Fallback to message.content
                  return markdownContent;
                }

                // Multi-phase agents - content is shown in timeline, don't show here
                return null;
              })()}

              {/* For multi-phase agents, show final report below timeline when completed */}
              {!isUserMessage &&
                !isStreaming &&
                agentExecution &&
                agentExecution.agentType !== "react" &&
                agentExecution.status !== "running" &&
                agentExecution.phases.length > 0 &&
                (() => {
                  const finalPhase =
                    agentExecution.phases[agentExecution.phases.length - 1];
                  if (finalPhase?.streamedContent) {
                    return (
                      <div className="mt-4">
                        <Markdown content={finalPhase.streamedContent} />
                      </div>
                    );
                  }
                  return null;
                })()}

              {isStreaming && !isLoading && (
                <motion.span
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="ml-1 inline-block h-4 w-0.5 bg-current"
                />
              )}
            </div>

            {/* File Attachments - shown after text for assistant messages */}
            {!isUserMessage && attachments && attachments.length > 0 && (
              <div className="mt-3">
                <MessageAttachments attachments={attachments} />
              </div>
            )}

            {/* Search Citations - shown after attachments for assistant messages */}
            {!isUserMessage && citations && citations.length > 0 && (
              <div className="mt-3">
                <SearchCitations citations={citations} />
              </div>
            )}

            {/* Copy button - shown for assistant messages */}
            {!isUserMessage && !isLoading && (
              <div className="absolute bottom-2 left-0 z-10 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <button
                  onClick={handleCopy}
                  className="rounded-md p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
                >
                  {isCopied ? (
                    <CheckIcon className="h-4 w-4 text-green-500" />
                  ) : (
                    <ClipboardDocumentIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  }
}

export default ChatBubble;

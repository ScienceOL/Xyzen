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
import ToolCallPill from "./ToolCallPill";
import ToolCallDetailsModal from "./ToolCallDetailsModal";

interface ChatBubbleProps {
  message: Message;
}

function ChatBubble({ message }: ChatBubbleProps) {
  const [isCopied, setIsCopied] = useState(false);
  const [selectedToolCallId, setSelectedToolCallId] = useState<string | null>(
    null,
  );
  const confirmToolCall = useXyzen((state) => state.confirmToolCall);
  const cancelToolCall = useXyzen((state) => state.cancelToolCall);
  const activeChatChannel = useXyzen((state) => state.activeChatChannel);
  const channels = useXyzen((state) => state.channels);
  const agents = useXyzen((state) => state.agents);
  const user = useXyzen((state) => state.user);

  // Get current agent avatar from store
  const currentChannel = activeChatChannel ? channels[activeChatChannel] : null;
  const currentAgent = currentChannel?.agentId
    ? agents.find((a) => a.id === currentChannel.agentId)
    : null;

  const {
    role,
    content,
    created_at,
    isLoading,
    isStreaming,
    toolCalls,
    attachments,
    citations,
    isThinking,
    thinkingContent,
    agentExecution,
  } = message;

  // Use deferred value and memoization to optimize rendering performance
  const deferredContent = useDeferredValue(content);
  const markdownContent = useMemo(
    () => <Markdown content={deferredContent} />,
    [deferredContent],
  );

  const isUserMessage = role === "user";
  const isToolMessage = toolCalls && toolCalls.length > 0;

  const selectedToolCall = selectedToolCallId
    ? toolCalls?.find((tc) => tc.id === selectedToolCallId) || null
    : null;

  // Updated time format to include seconds
  const formattedTime = new Date(created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  // Unified neutral/transparent styling for all messages
  const messageStyles =
    "rounded-[12px] bg-neutral-50/50 dark:bg-neutral-800/30";

  // 渲染头像
  const renderAvatar = () => {
    if (isUserMessage) {
      // User avatar from store or fallback to ProfileIcon
      if (user?.avatar) {
        return (
          <img
            src={user.avatar}
            alt={user.username || "User"}
            className="h-6 w-6 rounded-full object-cover"
          />
        );
      }
      return (
        <ProfileIcon className="h-6 w-6 rounded-full text-neutral-700 dark:text-neutral-300" />
      );
    }

    if (isToolMessage) {
      // Tool message icon
      return (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white">
          <span className="text-xs">🔧</span>
        </div>
      );
    }

    // AI agent avatar from store
    if (currentAgent?.avatar) {
      return (
        <img
          src={currentAgent.avatar}
          alt={currentAgent.name}
          className="h-6 w-6 rounded-full object-cover"
        />
      );
    }

    // Fallback to DiceBear default avatar
    return (
      <img
        src="https://api.dicebear.com/7.x/avataaars/svg?seed=default"
        alt="Agent"
        className="h-6 w-6 rounded-full object-cover"
      />
    );
  };

  const handleCopy = () => {
    if (!content) return;

    // Fallback function for older browsers or restricted environments
    const fallbackCopy = () => {
      const textArea = document.createElement("textarea");
      textArea.value = content;
      textArea.style.position = "fixed"; // Prevent scrolling to bottom
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      try {
        textArea.focus();
        textArea.select();
        const successful = document.execCommand("copy");
        if (successful) {
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
        } else {
          console.error("Fallback: Copying text command was unsuccessful");
        }
      } catch (err) {
        console.error("Fallback: Oops, unable to copy", err);
      } finally {
        try {
          document.body.removeChild(textArea);
        } catch (err) {
          console.error("Fallback: Failed to remove textarea from DOM", err);
        }
      }
    };

    // Use modern Clipboard API if available and in a secure context
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(content).then(
        () => {
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000); // Reset after 2 seconds
        },
        (err) => {
          console.error("Could not copy text using navigator: ", err);
          fallbackCopy();
        },
      );
    } else {
      fallbackCopy();
    }
  };

  // Tool call messages (from history refresh) render as pills + modal
  if (isToolMessage) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="group relative w-full pl-8"
      >
        {selectedToolCall && (
          <ToolCallDetailsModal
            toolCall={selectedToolCall}
            open={Boolean(selectedToolCall)}
            onClose={() => setSelectedToolCallId(null)}
            onConfirm={(toolCallId) =>
              activeChatChannel &&
              confirmToolCall(activeChatChannel, toolCallId)
            }
            onCancel={(toolCallId) =>
              activeChatChannel && cancelToolCall(activeChatChannel, toolCallId)
            }
          />
        )}

        {toolCalls && toolCalls.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {toolCalls.map((toolCall) => (
              <ToolCallPill
                key={toolCall.id}
                toolCall={toolCall}
                onClick={() => setSelectedToolCallId(toolCall.id)}
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
          className={`relative w-full min-w-0 ${messageStyles} transition-all duration-200 hover:shadow-sm`}
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
              {/* Thinking content - shown before main response for assistant messages */}
              {!isUserMessage && thinkingContent && (
                <ThinkingBubble
                  content={thinkingContent}
                  isThinking={isThinking ?? false}
                />
              )}

              {/* Agent execution timeline - show for all agents with phases */}
              {!isUserMessage &&
                agentExecution &&
                agentExecution.phases.length > 0 && (
                  <AgentExecutionTimeline
                    execution={agentExecution}
                    isExecuting={agentExecution.status === "running"}
                  />
                )}

              {(() => {
                // Explicit loading state - show inline loading dots
                if (isLoading) {
                  return (
                    <span className="inline-flex items-center gap-1">
                      <LoadingMessage size="small" />
                    </span>
                  );
                }

                // No agent execution - regular chat
                if (!agentExecution) {
                  return markdownContent;
                }

                // Agent with phases - get content from phases
                if (agentExecution.phases.length > 0) {
                  const activePhase = agentExecution.phases.find(
                    (p) => p.status === "running",
                  );
                  const lastPhase =
                    agentExecution.phases[agentExecution.phases.length - 1];
                  const phaseContent =
                    activePhase?.streamedContent || lastPhase?.streamedContent;

                  // Show final phase content below timeline when completed
                  if (
                    !isStreaming &&
                    agentExecution.status !== "running" &&
                    lastPhase?.streamedContent
                  ) {
                    return (
                      <div className="mt-4">
                        <Markdown content={lastPhase.streamedContent} />
                      </div>
                    );
                  }

                  // Still streaming - content shown in timeline
                  if (phaseContent) {
                    return null;
                  }
                }

                // Still waiting for content - show inline loading dots
                if (
                  agentExecution.status === "running" &&
                  !content &&
                  agentExecution.phases.length === 0
                ) {
                  return (
                    <span className="inline-flex items-center gap-1">
                      <LoadingMessage size="small" />
                    </span>
                  );
                }

                // Fallback to message.content
                return markdownContent;
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
          </div>
        </div>

        {/* Copy button - shown for assistant messages */}
        {!isUserMessage && !isLoading && (
          <div className="absolute bottom-2 left-0 z-10 opacity-100 transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100">
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
      </motion.div>
    );
  }
}

export default ChatBubble;

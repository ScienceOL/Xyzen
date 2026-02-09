import ProfileIcon from "@/assets/ProfileIcon";
// import { TYPEWRITER_CONFIG } from "@/configs/typewriterConfig";
// import { useStreamingTypewriter } from "@/hooks/useTypewriterEffect";
import {
  resolveMessageContent,
  getMessageDisplayMode,
} from "@/core/chat/messageContent";
import {
  useActiveChannelAgentId,
  useActiveChannelResponding,
} from "@/hooks/useChannelSelectors";
import Markdown from "@/lib/Markdown";
import { useXyzen } from "@/store";
import type { Message } from "@/store/types";
import {
  CheckIcon,
  ClipboardDocumentIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { motion } from "framer-motion";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const { t } = useTranslation();
  const [isCopied, setIsCopied] = useState(false);
  const [selectedToolCallId, setSelectedToolCallId] = useState<string | null>(
    null,
  );
  // Mobile toolbar visibility state
  const [showMobileToolbar, setShowMobileToolbar] = useState(false);
  const mobileToolbarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  // Consolidate action refs into a single subscription (stable references, never trigger re-render)
  const {
    confirmToolCall,
    cancelToolCall,
    startEditMessage,
    cancelEditMessage,
    submitEditMessage,
    deleteMessage,
  } = useXyzen(
    useShallow((s) => ({
      confirmToolCall: s.confirmToolCall,
      cancelToolCall: s.cancelToolCall,
      startEditMessage: s.startEditMessage,
      cancelEditMessage: s.cancelEditMessage,
      submitEditMessage: s.submitEditMessage,
      deleteMessage: s.deleteMessage,
    })),
  );

  const activeChatChannel = useXyzen((s) => s.activeChatChannel);
  const agents = useXyzen((s) => s.agents);
  const user = useXyzen((s) => s.user);

  // Fine-grained channel selectors (avoid subscribing to entire channels object)
  const activeAgentId = useActiveChannelAgentId();
  const channelResponding = useActiveChannelResponding();

  // Edit state - grouped because they change together
  const editingMessageId = useXyzen((s) => s.editingMessageId);
  const editingContent = useXyzen((s) => s.editingContent);
  const editingMode = useXyzen((s) => s.editingMode);

  // Get current agent avatar from store
  const currentAgent = activeAgentId
    ? agents.find((a) => a.id === activeAgentId)
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

  // Edit state
  const isEditing = editingMessageId === message.id;
  const canEditUser =
    isUserMessage && !channelResponding && !isLoading && !isStreaming;
  const canEditAssistant =
    !isUserMessage &&
    !channelResponding &&
    !isLoading &&
    !isStreaming &&
    !isToolMessage;

  const handleEditClick = (mode: "edit_only" | "edit_and_regenerate") => {
    startEditMessage(message.id, displayedContent, mode);
  };

  const handleEditContentChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    useXyzen.setState({ editingContent: e.target.value });
    // Auto-resize textarea
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  // Ref for auto-resizing textarea
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea on mount and content change
  const resizeTextarea = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, []);

  useEffect(() => {
    if (isEditing) {
      resizeTextarea();
    }
  }, [isEditing, editingContent, resizeTextarea]);

  // Mobile toolbar: auto-hide after 5 seconds
  useEffect(() => {
    if (showMobileToolbar) {
      mobileToolbarTimer.current = setTimeout(() => {
        setShowMobileToolbar(false);
      }, 5000);
    }
    return () => {
      if (mobileToolbarTimer.current) {
        clearTimeout(mobileToolbarTimer.current);
      }
    };
  }, [showMobileToolbar]);

  // Mobile toolbar: hide when another toolbar opens or clicking outside
  useEffect(() => {
    // Listen for other toolbars opening
    const handleOtherToolbarOpen = (e: CustomEvent<string>) => {
      if (e.detail !== message.id) {
        setShowMobileToolbar(false);
      }
    };

    // Listen for global close event (clicking outside any message)
    const handleGlobalClose = () => {
      setShowMobileToolbar(false);
    };

    window.addEventListener(
      "chatbubble:toolbar:open" as keyof WindowEventMap,
      handleOtherToolbarOpen as EventListener,
    );
    window.addEventListener(
      "chatbubble:toolbar:close" as keyof WindowEventMap,
      handleGlobalClose,
    );

    return () => {
      window.removeEventListener(
        "chatbubble:toolbar:open" as keyof WindowEventMap,
        handleOtherToolbarOpen as EventListener,
      );
      window.removeEventListener(
        "chatbubble:toolbar:close" as keyof WindowEventMap,
        handleGlobalClose,
      );
    };
  }, [message.id]);

  // Close toolbar when clicking outside this bubble
  useEffect(() => {
    if (!showMobileToolbar) return;

    const handleDocumentClick = (e: MouseEvent | TouchEvent) => {
      if (bubbleRef.current && !bubbleRef.current.contains(e.target as Node)) {
        setShowMobileToolbar(false);
      }
    };

    // Use setTimeout to avoid closing immediately from the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener("click", handleDocumentClick);
      document.addEventListener("touchend", handleDocumentClick);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handleDocumentClick);
      document.removeEventListener("touchend", handleDocumentClick);
    };
  }, [showMobileToolbar]);

  // Handle bubble click for mobile toolbar
  const handleBubbleClick = useCallback(
    (e: React.MouseEvent) => {
      // Only toggle on touch devices (no hover support)
      if (window.matchMedia("(hover: none)").matches) {
        e.stopPropagation();
        if (!showMobileToolbar) {
          // Notify other toolbars to close
          window.dispatchEvent(
            new CustomEvent("chatbubble:toolbar:open", { detail: message.id }),
          );
        }
        setShowMobileToolbar((prev) => !prev);
      }
    },
    [message.id, showMobileToolbar],
  );

  // Reset timer when interacting with toolbar
  const handleToolbarInteraction = useCallback(() => {
    if (mobileToolbarTimer.current) {
      clearTimeout(mobileToolbarTimer.current);
    }
    mobileToolbarTimer.current = setTimeout(() => {
      setShowMobileToolbar(false);
    }, 5000);
  }, []);

  const handleEditSave = async () => {
    await submitEditMessage();
  };

  const handleEditCancel = () => {
    cancelEditMessage();
  };

  // Delete state - both user and assistant messages can be deleted
  const canDelete =
    !channelResponding && !isLoading && !isStreaming && !isEditing;

  const handleDeleteClick = async () => {
    await deleteMessage(message.id);
  };

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
  const messageStyles = "rounded-sm bg-neutral-50/50 dark:bg-neutral-800/30";
  // Base toolbar styles (opacity controlled separately for mobile/desktop)
  const toolbarBaseStyles =
    "absolute -bottom-6 left-12 z-10 flex items-center gap-2 py-0.5 transition-all duration-200";
  // Toolbar visibility: desktop uses group-hover, mobile uses showMobileToolbar state
  const toolbarVisibilityStyles = showMobileToolbar
    ? "opacity-100 translate-y-0"
    : "opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0";
  const toolbarStyles = `${toolbarBaseStyles} ${toolbarVisibilityStyles}`;
  const toolbarTimestampStyles =
    "text-xs text-neutral-400 dark:text-neutral-500 tabular-nums";
  const toolbarDividerStyles = "h-3 w-px bg-neutral-300 dark:bg-neutral-600";
  const toolbarButtonStyles =
    "p-0.5 text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100";
  const toolbarDeleteButtonStyles =
    "p-0.5 text-neutral-500 transition-colors hover:text-red-500 dark:text-neutral-400 dark:hover:text-red-400";

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

  // Content resolution using unified utilities
  // resolveMessageContent provides single source of truth for content display and copy/edit
  // getMessageDisplayMode determines which rendering path to use
  const resolvedContent = useMemo(
    () => resolveMessageContent(message),
    [message],
  );
  const displayedContent = resolvedContent.text;
  const displayMode = useMemo(() => getMessageDisplayMode(message), [message]);

  const handleCopy = () => {
    if (!displayedContent) return;

    // Fallback function for older browsers or restricted environments
    const fallbackCopy = () => {
      const textArea = document.createElement("textarea");
      textArea.value = displayedContent;
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
      navigator.clipboard.writeText(displayedContent).then(
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
        ref={bubbleRef}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="group relative w-full pl-8 my-6 first:mt-2"
        onClick={handleBubbleClick}
      >
        {/* Avatar - positioned to the left */}
        <div className="absolute left-0 top-1">{renderAvatar()}</div>

        {/* Edit mode for messages */}
        {isEditing ? (
          <div className={`relative w-full min-w-0 ${messageStyles}`}>
            <div className="px-4 py-3">
              <textarea
                ref={textareaRef}
                value={editingContent}
                onChange={handleEditContentChange}
                className="w-full min-h-[80px] max-h-[60vh] overflow-y-auto bg-transparent resize-none focus:outline-none text-sm text-neutral-800 dark:text-neutral-200"
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  onClick={handleEditCancel}
                  className="px-3 py-1 text-sm text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded"
                >
                  {t("app.message.editCancel")}
                </button>
                <button
                  onClick={handleEditSave}
                  className="px-3 py-1 text-sm bg-blue-500 text-white hover:bg-blue-600 rounded disabled:opacity-50"
                  disabled={!editingContent.trim()}
                >
                  {editingMode === "edit_and_regenerate"
                    ? t("app.message.editSaveRegenerate")
                    : t("app.message.editSave")}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Message content */
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

                {/* Agent execution timeline - show for all agents with phases or cancelled status */}
                {!isUserMessage &&
                  agentExecution &&
                  (agentExecution.phases.length > 0 ||
                    agentExecution.status === "cancelled") && (
                    <AgentExecutionTimeline
                      execution={agentExecution}
                      isExecuting={agentExecution.status === "running"}
                    />
                  )}

                {/* Message content based on display mode */}
                {(() => {
                  switch (displayMode) {
                    case "loading":
                    case "waiting":
                      return (
                        <span className="inline-flex items-center gap-1">
                          <LoadingMessage size="small" />
                        </span>
                      );

                    case "simple":
                      return markdownContent;

                    case "timeline_streaming":
                      // Content is shown in AgentExecutionTimeline phases during streaming
                      return null;

                    case "timeline_complete":
                      // Show final content below timeline when completed
                      // Guard against empty content to avoid rendering empty div with margin
                      return resolvedContent.text ? (
                        <div className="mt-4">
                          <Markdown content={resolvedContent.text} />
                        </div>
                      ) : null;

                    default:
                      // Fallback for any unexpected display mode
                      return markdownContent;
                  }
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
        )}

        {/* Toolbar with timestamp - shown for user messages on hover */}
        {isUserMessage && !isEditing && (
          <div
            className={toolbarStyles}
            onTouchStart={handleToolbarInteraction}
          >
            {/* Timestamp */}
            <span className={toolbarTimestampStyles}>{formattedTime}</span>

            {/* Divider */}
            <div className={toolbarDividerStyles} />

            {canEditUser && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={toolbarButtonStyles}
                    title={t("app.message.edit")}
                  >
                    <PencilIcon className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => handleEditClick("edit_only")}
                  >
                    {t("app.message.editOnly")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleEditClick("edit_and_regenerate")}
                  >
                    {t("app.message.editAndRegenerate")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <button
              onClick={handleCopy}
              className={toolbarButtonStyles}
              title={t("app.message.copy")}
            >
              {isCopied ? (
                <CheckIcon className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <ClipboardDocumentIcon className="h-3.5 w-3.5" />
              )}
            </button>
            {canDelete && (
              <button
                onClick={handleDeleteClick}
                className={toolbarDeleteButtonStyles}
                title={t("app.message.delete")}
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Toolbar with timestamp - shown for assistant messages on hover */}
        {!isUserMessage && !isLoading && !isEditing && (
          <div
            className={toolbarStyles}
            onTouchStart={handleToolbarInteraction}
          >
            {/* Timestamp */}
            <span className={toolbarTimestampStyles}>{formattedTime}</span>

            {/* Divider */}
            <div className={toolbarDividerStyles} />

            {canEditAssistant && (
              <button
                onClick={() => handleEditClick("edit_only")}
                className={toolbarButtonStyles}
                title={t("app.message.edit")}
              >
                <PencilIcon className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={handleCopy}
              className={toolbarButtonStyles}
              title={t("app.message.copy")}
            >
              {isCopied ? (
                <CheckIcon className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <ClipboardDocumentIcon className="h-3.5 w-3.5" />
              )}
            </button>
            {canDelete && (
              <button
                onClick={handleDeleteClick}
                className={toolbarDeleteButtonStyles}
                title={t("app.message.delete")}
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </motion.div>
    );
  }
}

export default memo(ChatBubble);

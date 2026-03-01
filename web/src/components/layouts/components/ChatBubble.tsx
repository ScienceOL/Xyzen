import ProfileIcon from "@/assets/ProfileIcon";
import { resolveMessageContent } from "@/core/chat/messageContent";
import { zIndexClasses } from "@/constants/zIndex";
import {
  useActiveChannelAgentId,
  useActiveChannelResponding,
} from "@/hooks/useChannelSelectors";
import { useXyzen } from "@/store";
import type { Message } from "@/store/types";
import {
  PencilIcon,
  TrashIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CopyButton } from "@/components/animate-ui/components/buttons/copy";
import MessageAttachments from "./MessageAttachments";
import MessageContent from "./MessageContent";
import { SearchCitations } from "./SearchCitations";
import ToolCallPill from "./ToolCallPill";
import UserQuestionBubble from "./UserQuestionBubble";

interface ChatBubbleProps {
  message: Message;
}

function ChatBubble({ message }: ChatBubbleProps) {
  const { t } = useTranslation();
  // Mobile toolbar visibility state
  const [showMobileToolbar, setShowMobileToolbar] = useState(false);
  const mobileToolbarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  // Notification highlight
  const msgIdForHighlight = message.dbId || message.id;
  const isHighlighted = useXyzen(
    (s) => s.highlightMessageId === msgIdForHighlight,
  );

  // Consolidate action refs into a single subscription (stable references, never trigger re-render)
  const {
    confirmToolCall,
    cancelToolCall,
    startEditMessage,
    cancelEditMessage,
    submitEditMessage,
    deleteMessage,
    retryMessage,
  } = useXyzen(
    useShallow((s) => ({
      confirmToolCall: s.confirmToolCall,
      cancelToolCall: s.cancelToolCall,
      startEditMessage: s.startEditMessage,
      cancelEditMessage: s.cancelEditMessage,
      submitEditMessage: s.submitEditMessage,
      deleteMessage: s.deleteMessage,
      retryMessage: s.retryMessage,
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
    created_at,
    isLoading,
    isStreaming,
    toolCalls,
    attachments,
    citations,
    isThinking,
    thinkingContent,
    agentExecution,
    status,
  } = message;

  // Derive active states from both status and legacy boolean flags
  const isMessageLoading = status === "pending" || isLoading;
  const isMessageStreaming = status === "streaming" || isStreaming;

  const isUserMessage = role === "user";
  const isMessageSending = status === "sending";
  const isMessageFailed =
    isUserMessage && status === "failed" && !message.error;

  const handleRetry = useCallback(() => {
    if (isMessageFailed) {
      retryMessage(message.id);
    }
  }, [isMessageFailed, retryMessage, message.id]);
  const isToolMessage = toolCalls && toolCalls.length > 0;

  // Edit state
  const isEditing = editingMessageId === message.id;
  const canEditUser =
    isUserMessage &&
    !channelResponding &&
    !isMessageLoading &&
    !isMessageStreaming;
  const canEditAssistant =
    !isUserMessage &&
    !channelResponding &&
    !isMessageLoading &&
    !isMessageStreaming &&
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
    !channelResponding &&
    !isMessageLoading &&
    !isMessageStreaming &&
    !isEditing;

  const handleDeleteClick = async () => {
    await deleteMessage(message.id);
  };

  // Show date when message is older than 1 day, otherwise just time
  const formattedTime = useMemo(() => {
    const msgDate = new Date(created_at);
    const now = new Date();
    const diffMs = now.getTime() - msgDate.getTime();
    const isOlderThanOneDay = diffMs >= 86_400_000;

    if (isOlderThanOneDay) {
      return (
        msgDate.toLocaleDateString([], {
          month: "short",
          day: "numeric",
        }) +
        " " +
        msgDate.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    }
    return msgDate.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }, [created_at]);

  // Unified neutral/transparent styling for all messages
  const messageStyles = "rounded-sm bg-neutral-50/50 dark:bg-neutral-800/30";
  // Base toolbar styles (opacity controlled separately for mobile/desktop)
  const toolbarBaseStyles = `absolute -bottom-7 left-12 ${zIndexClasses.base} flex items-center gap-2 py-0.5 transition-all duration-200`;
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
  // Resolve content for copy/edit and rendering
  const resolvedContent = useMemo(
    () => resolveMessageContent(message),
    [message],
  );
  const displayedContent = resolvedContent.text;

  // Tool call messages (from history refresh) render as pills (modal is self-contained in ToolCallPill)
  if (isToolMessage) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="group relative w-full pl-8"
      >
        {toolCalls && toolCalls.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {toolCalls.map((toolCall) => (
              <ToolCallPill
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
        ref={bubbleRef}
        data-message-id={msgIdForHighlight}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="group relative w-full pl-8 my-6 first:mt-0"
        onClick={handleBubbleClick}
      >
        {/* Notification highlight overlay */}
        <AnimatePresence>
          {isHighlighted && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="absolute -inset-x-12 -inset-y-1 bg-amber-100/50 pointer-events-none dark:bg-amber-500/[0.07]"
            />
          )}
        </AnimatePresence>

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
            className={`relative w-full min-w-0 ${messageStyles} transition-all duration-200 hover:shadow-sm${isMessageSending ? " opacity-70" : ""}`}
          >
            <div className="px-4 py-3 min-w-0">
              {/* File Attachments - shown before text for user messages */}
              {isUserMessage && attachments && attachments.length > 0 && (
                <div className="mb-3">
                  <MessageAttachments attachments={attachments} />
                </div>
              )}

              <MessageContent
                isUser={isUserMessage}
                content={displayedContent}
                thinkingContent={thinkingContent}
                isThinking={isThinking}
                agentExecution={agentExecution}
                error={message.error}
                isStreaming={isMessageStreaming}
                isLoading={isMessageLoading}
                isCancelled={status === "cancelled"}
              />

              {/* User Question Bubble - shown when agent asks a question */}
              {!isUserMessage && message.userQuestion && (
                <div className="mt-3">
                  <UserQuestionBubble
                    userQuestion={message.userQuestion}
                    messageId={message.id}
                  />
                </div>
              )}

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
        {isUserMessage &&
          !isEditing &&
          !isMessageSending &&
          !isMessageFailed && (
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
              <CopyButton
                content={displayedContent}
                variant="ghost"
                size="xs"
                className={toolbarButtonStyles}
                title={t("app.message.copy")}
              />
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

        {/* Sending / Failed status indicator for user messages */}
        {isUserMessage && isMessageSending && (
          <div className="mt-1 flex items-center justify-end gap-1 text-xs text-neutral-400 dark:text-neutral-500">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="h-3 w-3"
            >
              <ArrowPathIcon className="h-3 w-3" />
            </motion.div>
            <span>{t("app.message.sending")}</span>
          </div>
        )}
        {isUserMessage && isMessageFailed && (
          <div className="mt-1 flex items-center justify-end gap-1.5 text-xs text-red-500 dark:text-red-400">
            <ExclamationCircleIcon className="h-3.5 w-3.5" />
            <span>{t("app.message.sendFailed")}</span>
            <button
              onClick={handleRetry}
              className="ml-1 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <ArrowPathIcon className="h-3 w-3" />
              {t("app.message.retry")}
            </button>
          </div>
        )}

        {/* Toolbar with timestamp - shown for assistant messages on hover */}
        {!isUserMessage && !isMessageLoading && !isEditing && (
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
            <CopyButton
              content={displayedContent}
              variant="ghost"
              size="xs"
              className={toolbarButtonStyles}
              title={t("app.message.copy")}
            />
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

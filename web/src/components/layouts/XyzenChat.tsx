import { CHAT_THEMES } from "@/configs/chatThemes";

import EditableTitle from "@/components/base/EditableTitle";
import NotificationModal from "@/components/modals/NotificationModal";
import { ShareModal } from "@/components/modals/ShareModal";
import type { XyzenChatConfig } from "@/hooks/useXyzenChat";
import { useXyzenChat } from "@/hooks/useXyzenChat";
import type { Agent } from "@/types/agents";
import { ArrowPathIcon, ShareIcon } from "@heroicons/react/24/outline";

import { AnimatePresence } from "framer-motion";
import { useState } from "react";

import ChatBubble from "./components/ChatBubble";
import ChatInput from "./components/ChatInput";
import ChatToolbar from "./components/ChatToolbar";
import EmptyChat from "./components/EmptyChat";
import ResponseSpinner from "./components/ResponseSpinner";
import WelcomeMessage from "./components/WelcomeMessage";

interface BaseChatProps {
  config: XyzenChatConfig;
  historyEnabled?: boolean;
}

// Theme-specific styling
const getThemeStyles = () => {
  return {
    agentBorder: "border-indigo-100 dark:border-indigo-900",
    agentName: "text-indigo-600 dark:text-indigo-400",
    responseSpinner:
      "bg-indigo-50 text-indigo-600 ring-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-300 dark:ring-indigo-800/40",
    scrollButton: "bg-indigo-600 hover:bg-indigo-700",
  };
};

// Empty state component for different themes
const ThemedEmptyState: React.FC<{ config: XyzenChatConfig }> = () => {
  return <EmptyChat />;
};

// Welcome message component
const ThemedWelcomeMessage: React.FC<{
  config: XyzenChatConfig;
  currentAgent?: Agent | null;
}> = ({ currentAgent }) => {
  return (
    <WelcomeMessage
      assistant={
        currentAgent
          ? {
              id: currentAgent.id,
              title: currentAgent.name,
              description: currentAgent.description,
              iconType: "chat",
              iconColor: "indigo",
              category: "general",
            }
          : undefined
      }
    />
  );
};

function BaseChat({ config, historyEnabled = false }: BaseChatProps) {
  const {
    // State
    autoScroll,
    isRetrying,
    showHistory,
    inputHeight,
    sendBlocked,

    // Computed
    currentChannel,
    currentAgent,
    messages,
    connected,
    error,
    responding,

    // Refs
    messagesEndRef,
    messagesContainerRef,

    // Handlers
    handleSendMessage,
    handleToggleHistory,
    handleCloseHistory,
    handleSelectTopic,
    handleInputHeightChange,
    handleRetryConnection,
    handleScrollToBottom,
    handleScroll,

    // Store values
    activeChatChannel,
    notification,
    closeNotification,
    pendingInput,
    updateTopicName,
  } = useXyzenChat(config);

  // State for share modal
  const [showShareModal, setShowShareModal] = useState(false);

  // Handler for showing share modal
  const handleShowShareModal = () => {
    setShowShareModal(true);
  };

  const themeStyles = getThemeStyles();

  if (!activeChatChannel) {
    return (
      <div className="flex h-full flex-col">
        <ThemedEmptyState config={config} />

        {/* Add toolbar even in empty state for history access */}
        <div className="border-t border-neutral-200 dark:border-neutral-800" />
        <div className="flex-shrink-0">
          <ChatToolbar
            onShowHistory={handleToggleHistory}
            onHeightChange={handleInputHeightChange}
            showHistory={showHistory}
            handleCloseHistory={handleCloseHistory}
            handleSelectTopic={handleSelectTopic}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${showHistory && historyEnabled ? "flex" : "flex flex-col"} h-full`}
    >
      {/* Main Chat Content Wrapper */}
      <div
        className={`${showHistory && historyEnabled ? "flex-1 min-w-0 overflow-hidden" : ""} flex flex-col h-full`}
      >
        {/* Agent Header */}
        {currentAgent ? (
          <div className="relative flex-shrink-0 border-y border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-black">
            <div className="flex items-start gap-3">
              <div className="mt-1 h-8 w-8 flex-shrink-0 avatar-glow">
                <img
                  src={
                    currentAgent.avatar ||
                    (currentAgent.tags?.includes("default_chat")
                      ? "/defaults/agents/avatar1.png"
                      : "/defaults/agents/avatar2.png")
                  }
                  alt={currentAgent.name}
                  className={`h-8 w-8 rounded-full border-2 ${themeStyles.agentBorder} object-cover shadow-sm`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className={`text-sm font-semibold whitespace-nowrap ${themeStyles.agentName}`}
                  >
                    {currentAgent.name}
                  </span>
                  <span className="text-xs text-neutral-400 dark:text-neutral-500">
                    •
                  </span>
                  <EditableTitle
                    title={currentChannel?.title || config.defaultTitle}
                    onSave={(newTitle) => {
                      if (activeChatChannel) {
                        return updateTopicName(activeChatChannel, newTitle);
                      }
                      return Promise.resolve();
                    }}
                    className="min-w-0"
                    textClassName="text-sm text-neutral-600 dark:text-neutral-400 truncate block"
                  />
                  {responding && (
                    <ResponseSpinner
                      text={config.responseMessages.generating}
                      className="absolute bottom-0 right-0 mb-1 ml-2"
                      themeStyles={themeStyles.responseSpinner}
                    />
                  )}
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-1">
                  {currentAgent.description}
                </p>
              </div>
              <button
                onClick={handleShowShareModal}
                className="flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                title="分享对话"
              >
                <ShareIcon className="h-3.5 w-3.5" />
                <span>分享</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="relative flex-shrink-0 border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-black">
            <EditableTitle
              title={currentChannel?.title || config.defaultTitle}
              onSave={(newTitle) => {
                if (activeChatChannel) {
                  return updateTopicName(activeChatChannel, newTitle);
                }
                return Promise.resolve();
              }}
              className="mb-1"
              textClassName="text-lg font-medium text-neutral-800 dark:text-white"
            />
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {config.welcomeMessage?.description ||
                config.emptyState.description}
            </p>
            {responding && (
              <ResponseSpinner
                text={config.responseMessages.creating}
                className="absolute right-0 bottom-0 mb-1"
                themeStyles={themeStyles.responseSpinner}
              />
            )}
          </div>
        )}

        {/* Connection Status */}
        {!connected && (
          <div className="mb-1 flex flex-shrink-0 items-center justify-between rounded-sm bg-amber-50 px-3 py-1.5 dark:bg-amber-900/20">
            <span className="text-xs text-amber-700 dark:text-amber-200">
              {error || config.connectionMessages.connecting}
            </span>
            <button
              onClick={handleRetryConnection}
              disabled={isRetrying}
              className="ml-2 rounded-sm p-1 text-amber-700 hover:bg-amber-100 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:text-amber-300 dark:hover:bg-amber-800/30"
              title={config.connectionMessages.retrying}
            >
              <ArrowPathIcon
                className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        )}

        {/* Messages Area */}
        <div className="relative flex-grow overflow-y-auto min-w-0">
          <div
            ref={messagesContainerRef}
            className="h-full overflow-y-auto overflow-x-hidden rounded-sm bg-neutral-50 pt-6 dark:bg-black custom-scrollbar"
            onScroll={handleScroll}
          >
            <div className="px-3 min-w-0">
              {messages.length === 0 ? (
                <ThemedWelcomeMessage
                  config={config}
                  currentAgent={currentAgent}
                />
              ) : (
                <div className="space-y-0.5">
                  <AnimatePresence>
                    {messages.map((msg) => (
                      <ChatBubble key={msg.clientId || msg.id} message={msg} />
                    ))}
                  </AnimatePresence>
                  <div ref={messagesEndRef} className="h-4" />
                </div>
              )}
            </div>
          </div>

          {/* Scroll to Bottom Button */}
          {!autoScroll && messages.length > 0 && (
            <button
              onClick={handleScrollToBottom}
              className={`absolute bottom-4 right-4 z-20 rounded-full p-2 text-white shadow-md transition-colors ${themeStyles.scrollButton}`}
              aria-label="Scroll to bottom"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 14l-7 7m0 0l-7-7m7 7V3"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Input Area */}
        <div className="flex-shrink-0">
          <ChatToolbar
            onShowHistory={handleToggleHistory}
            onHeightChange={handleInputHeightChange}
            showHistory={showHistory}
            handleCloseHistory={handleCloseHistory}
            handleSelectTopic={handleSelectTopic}
          />
          {sendBlocked && (
            <div className="mx-4 mb-1 rounded-sm bg-amber-50 px-3 py-1.5 text-xs text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-900/20 dark:text-amber-200 dark:ring-amber-800/40">
              正在生成回复，暂时无法发送。请稍后再试。
            </div>
          )}
          <ChatInput
            onSendMessage={handleSendMessage}
            disabled={!connected}
            placeholder={
              responding
                ? config.placeholders.responding
                : config.placeholders.default
            }
            height={inputHeight}
            initialValue={pendingInput}
          />
        </div>
      </div>
      {/* End of Main Chat Content Wrapper */}

      {/* Notification Modal */}
      {notification && (
        <NotificationModal
          isOpen={notification.isOpen}
          onClose={closeNotification}
          title={notification.title}
          message={notification.message}
          type={notification.type}
          actionLabel={notification.actionLabel}
          onAction={notification.onAction}
        />
      )}

      {/* Share Modal */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        messages={messages
          .filter((msg) => msg.role !== "tool")
          .map((msg) => {
            const { role, ...rest } = msg;
            return {
              ...rest,
              role: role === "tool" ? "assistant" : role,
            } as never;
          })}
        currentAgent={
          currentAgent
            ? { ...currentAgent, avatar: currentAgent.avatar ?? undefined }
            : undefined
        }
      />
    </div>
  );
}
export default function XyzenChat() {
  return <BaseChat config={CHAT_THEMES.xyzen} historyEnabled={true} />;
}

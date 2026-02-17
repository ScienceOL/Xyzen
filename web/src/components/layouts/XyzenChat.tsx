import { getXyzenChatConfig } from "@/configs/chatThemes";

import EditableTitle from "@/components/base/EditableTitle";
import NotificationModal from "@/components/modals/NotificationModal";
import { ShareModal } from "@/components/modals/ShareModal";
import { useActiveChannelStatus } from "@/hooks/useChannelSelectors";
import type { XyzenChatConfig } from "@/hooks/useXyzenChat";
import { useXyzenChat } from "@/hooks/useXyzenChat";
import type { Agent } from "@/types/agents";
import { ArrowPathIcon, ShareIcon } from "@heroicons/react/24/outline";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import ChatBubble from "./components/ChatBubble";
import ContextUsageRing from "./components/ContextUsageRing";
import FloatingChatInput from "./components/FloatingChatInput";
import EmptyChat from "./components/EmptyChat";
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
              avatar:
                currentAgent.avatar ||
                "https://api.dicebear.com/7.x/avataaars/svg?seed=default",
            }
          : undefined
      }
    />
  );
};

function BaseChat({ config, historyEnabled = false }: BaseChatProps) {
  const { t } = useTranslation();
  const {
    // State
    autoScroll,
    isRetrying,
    showHistory,
    sendBlocked,

    // Computed
    channelTitle,
    currentAgent,
    messages,
    connected,
    error,
    responding,
    aborting,

    // Refs
    messagesEndRef,
    messagesContainerRef,

    // Handlers
    handleSendMessage,
    handleToggleHistory,
    handleCloseHistory,
    handleSelectTopic,
    handleRetryConnection,
    handleScrollToBottom,
    handleScroll,
    handleAbortGeneration,

    // Store values
    activeChatChannel,
    notification,
    closeNotification,
    pendingInput,
    updateTopicName,
  } = useXyzenChat(config);

  // Channel IDs for share modal
  const {
    sessionId: channelSessionId,
    channelId: channelTopicId,
    tokenUsage,
    model_tier: modelTier,
  } = useActiveChannelStatus();

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
        {/* Messages Area */}
        <div className="relative grow overflow-y-auto min-w-0">
          <div
            ref={messagesContainerRef}
            className="h-full overflow-y-auto overflow-x-hidden rounded-sm bg-white dark:bg-black custom-scrollbar"
            onScroll={handleScroll}
          >
            {/* Sticky Frosted Header — scroll-driven animation (CSS) */}
            {currentAgent ? (
              <div
                className="header-dock-anim sticky top-0 z-10 overflow-hidden bg-gradient-to-b from-white/90 to-white/50 backdrop-blur-xl dark:from-neutral-950/90 dark:to-neutral-950/50"
                style={{
                  animation: "header-dock linear both",
                  animationTimeline: "scroll(nearest)",
                  animationRange: "0px 48px",
                }}
              >
                <div className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="relative mt-1 h-8 w-8 shrink-0">
                      <div className="avatar-glow">
                        <img
                          src={
                            currentAgent.avatar ||
                            "https://api.dicebear.com/7.x/avataaars/svg?seed=default"
                          }
                          alt={currentAgent.name}
                          className={`h-8 w-8 rounded-full border-2 ${themeStyles.agentBorder} object-cover shadow-sm`}
                        />
                      </div>
                      {responding && (
                        <div className="typing-bubble">
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                        </div>
                      )}
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
                          title={channelTitle || config.defaultTitle}
                          onSave={(newTitle) => {
                            if (activeChatChannel) {
                              return updateTopicName(
                                activeChatChannel,
                                newTitle,
                              );
                            }
                            return Promise.resolve();
                          }}
                          className="min-w-0"
                          textClassName="text-sm text-neutral-600 dark:text-neutral-400 truncate block"
                        />
                      </div>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-1">
                        {currentAgent.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <ContextUsageRing
                        tokenUsage={tokenUsage}
                        modelTier={modelTier}
                      />
                      <button
                        onClick={handleShowShareModal}
                        className="flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-white/30 dark:text-neutral-400 dark:hover:bg-white/10"
                        title={t("app.chatHeader.shareTooltip")}
                      >
                        <ShareIcon className="h-3.5 w-3.5" />
                        <span>{t("app.chatHeader.share")}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="header-dock-anim sticky top-0 z-10 overflow-hidden bg-gradient-to-b from-white/90 to-white/50 backdrop-blur-xl dark:from-neutral-950/90 dark:to-neutral-950/50"
                style={{
                  animation: "header-dock linear both",
                  animationTimeline: "scroll(nearest)",
                  animationRange: "0px 48px",
                }}
              >
                <div className="px-4 py-3">
                  <EditableTitle
                    title={channelTitle || config.defaultTitle}
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
                </div>
              </div>
            )}

            {/* Connection Status */}
            {!connected && (
              <div className="sticky top-0 z-[9] mx-3 mt-1 flex items-center justify-between rounded-sm bg-amber-50/90 px-3 py-1.5 backdrop-blur-sm dark:bg-amber-900/30">
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

            <div className="px-3 pt-6 min-w-0">
              {messages.length === 0 ? (
                <ThemedWelcomeMessage
                  config={config}
                  currentAgent={currentAgent}
                />
              ) : (
                <div className="space-y-0.5">
                  {messages.map((msg) => (
                    <ChatBubble key={msg.clientId || msg.id} message={msg} />
                  ))}
                  <div ref={messagesEndRef} className="h-4" />
                </div>
              )}
            </div>
          </div>

          {/* Scroll to Bottom Button */}
          {!autoScroll && messages.length > 0 && (
            <button
              onClick={handleScrollToBottom}
              className="absolute bottom-4 right-4 z-20 rounded-full p-2.5 text-neutral-700 backdrop-blur-xl bg-white/70 shadow-lg shadow-black/5 active:scale-90 transition-transform duration-150 dark:bg-neutral-900/70 dark:text-neutral-200 dark:shadow-black/20"
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
        <div className="shrink-0">
          <FloatingChatInput
            onSendMessage={handleSendMessage}
            disabled={!connected}
            placeholder={
              responding
                ? config.placeholders.responding
                : config.placeholders.default
            }
            initialValue={pendingInput}
            responding={responding}
            aborting={aborting}
            onAbort={handleAbortGeneration}
            sendBlocked={sendBlocked}
            onShowHistory={handleToggleHistory}
            showHistory={showHistory}
            handleCloseHistory={handleCloseHistory}
            handleSelectTopic={handleSelectTopic}
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
        sessionId={channelSessionId}
        topicId={channelTopicId}
      />
    </div>
  );
}
export default function XyzenChat() {
  const { t } = useTranslation();
  const config = useMemo(() => getXyzenChatConfig(t), [t]);
  return <BaseChat config={config} historyEnabled={true} />;
}

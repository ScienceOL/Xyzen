"use client";
import EditableTitle from "@/components/base/EditableTitle";
import NotificationModal from "@/components/modals/NotificationModal";
import { useXyzen } from "@/store";
import type { Message } from "@/store/types";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

import ChatBubble from "./components/ChatBubble";
import ChatInput from "./components/ChatInput";
import ChatToolbar from "./components/ChatToolbar";

export default function WorkshopChat() {
  const {
    activeChatChannel,
    channels,
    agents,
    sendMessage,
    connectToChannel,
    updateTopicName,
    fetchMyProviders,
    llmProviders,
    notification,
    closeNotification,
    pendingInput,
    setPendingInput,
  } = useXyzen();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [inputHeight, setInputHeight] = useState(() => {
    const savedHeight = localStorage.getItem("workshopChatInputHeight");
    return savedHeight ? parseInt(savedHeight, 10) : 80;
  });
  const [sendBlocked, setSendBlocked] = useState(false);

  const currentChannel = activeChatChannel ? channels[activeChatChannel] : null;
  const currentAgent = currentChannel?.agentId
    ? agents.find((a) => a.id === currentChannel.agentId)
    : null;
  const messages: Message[] = currentChannel?.messages || [];
  const connected = currentChannel?.connected || false;
  const error = currentChannel?.error || null;
  const responding = currentChannel?.responding || false;

  const scrollToBottom = useCallback(
    (force = false) => {
      if (!autoScroll && !force) return;
      setTimeout(() => {
        messagesContainerRef.current?.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: force ? "auto" : "smooth",
        });
      }, 50);
    },
    [autoScroll],
  );

  const handleScroll = useCallback(() => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        messagesContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 80;
      setAutoScroll(isNearBottom);
    }
  }, []);

  const handleSendMessage = (inputMessage: string) => {
    if (!inputMessage.trim() || !activeChatChannel) return;
    if (responding) {
      setSendBlocked(true);
      // Auto-hide the hint after 2 seconds
      window.setTimeout(() => setSendBlocked(false), 2000);
      return;
    }
    sendMessage(inputMessage);
    // Clear pending input after sending
    if (pendingInput) {
      setPendingInput("");
    }
    setAutoScroll(true);
    setTimeout(() => scrollToBottom(true), 100);
  };

  const handleToggleHistory = () => {
    setShowHistory(!showHistory);
  };

  const handleInputHeightChange = (height: number) => {
    setInputHeight(height);
    localStorage.setItem("workshopChatInputHeight", height.toString());
  };

  const handleRetryConnection = () => {
    if (!currentChannel) return;
    setIsRetrying(true);
    connectToChannel(currentChannel.sessionId, currentChannel.id);
    setTimeout(() => {
      setIsRetrying(false);
    }, 2000);
  };

  useEffect(() => {
    if (autoScroll) {
      scrollToBottom();
    }
  }, [messages.length, autoScroll, scrollToBottom]);

  // Fetch providers on mount if not already loaded
  useEffect(() => {
    if (llmProviders.length === 0) {
      fetchMyProviders().catch((error) => {
        console.error("Failed to fetch providers:", error);
      });
    }
  }, [llmProviders.length, fetchMyProviders]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      setAutoScroll(true);
      // Force scroll to bottom on channel change
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop =
            messagesContainerRef.current.scrollHeight;
        }
      }, 50);

      container.addEventListener("scroll", handleScroll, { passive: true });
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, [activeChatChannel, handleScroll]);

  if (!activeChatChannel) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <div className="text-6xl mb-4">🔧</div>
          <h3 className="text-lg font-semibold text-neutral-800 dark:text-white mb-2">
            Welcome to Workshop
          </h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
            Create and design new agents with AI assistance
          </p>
          <div className="flex items-center justify-center gap-4 text-xs text-neutral-400 dark:text-neutral-500">
            <span>🤖 Agent Creation</span>
            <span>•</span>
            <span>📊 Graph Design</span>
            <span>•</span>
            <span>💬 Interactive Chat</span>
          </div>
        </div>

        {/* Add toolbar even in empty state for history access */}
        <div className="border-t border-neutral-200 dark:border-neutral-800" />
        <div className="flex-shrink-0">
          <ChatToolbar
            onShowHistory={handleToggleHistory}
            onHeightChange={handleInputHeightChange}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {currentAgent ? (
        <div className="relative flex-shrink-0 border-b border-neutral-200 bg-gradient-to-r from-white to-neutral-50 px-4 py-3 dark:border-neutral-800 dark:from-black dark:to-neutral-950">
          <div className="flex items-start gap-3">
            <img
              src={
                currentAgent.id === "default-chat"
                  ? "https://avatars.githubusercontent.com/u/176685?v=4"
                  : "https://cdn1.deepmd.net/static/img/affb038eChatGPT Image 2025年8月6日 10_33_07.png"
              }
              alt={currentAgent.name}
              className="mt-1 h-8 w-8 flex-shrink-0 rounded-full border-2 border-purple-100 object-cover shadow-sm dark:border-purple-900"
            />
            <div className="flex-1 min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                  {currentAgent.name}
                </span>
                <span className="text-xs text-neutral-400 dark:text-neutral-500">
                  •
                </span>
                <EditableTitle
                  title={currentChannel?.title || "新的工作坊会话"}
                  onSave={(newTitle) => {
                    if (activeChatChannel) {
                      return updateTopicName(activeChatChannel, newTitle);
                    }
                    return Promise.resolve();
                  }}
                  textClassName="text-sm text-neutral-600 dark:text-neutral-400"
                />
                {responding && (
                  <span className="absolute right-0 ml-2 inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-600 ring-1 ring-inset ring-purple-100 dark:bg-purple-900/20 dark:text-purple-300 dark:ring-purple-800/40">
                    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                      />
                    </svg>
                    AI 正在协助创建…
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-1">
                {currentAgent.description}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative flex-shrink-0 border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-black">
          <EditableTitle
            title={currentChannel?.title || "新的工作坊会话"}
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
            在工作坊中与AI协作创建和设计新的智能助手
          </p>
          {responding && (
            <div className="absolute right-0 mt-1 inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-600 ring-1 ring-inset ring-purple-100 dark:bg-purple-900/20 dark:text-purple-300 dark:ring-purple-800/40">
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
              AI 正在协助创建…
            </div>
          )}
        </div>
      )}

      {!connected && (
        <div className="mb-1 flex flex-shrink-0 items-center justify-between rounded-md bg-amber-50 px-3 py-1.5 dark:bg-amber-900/20">
          <span className="text-xs text-amber-700 dark:text-amber-200">
            {error || "正在连接工作坊服务..."}
          </span>
          <button
            onClick={handleRetryConnection}
            disabled={isRetrying}
            className="ml-2 rounded-md p-1 text-amber-700 hover:bg-amber-100 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:text-amber-300 dark:hover:bg-amber-800/30"
            title="重试连接"
          >
            <ArrowPathIcon
              className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      )}

      <div className="relative flex-grow overflow-y-auto">
        <div
          ref={messagesContainerRef}
          className="h-full overflow-y-auto rounded-lg bg-neutral-50 pt-6 dark:bg-black custom-scrollbar"
          onScroll={handleScroll}
        >
          <div className="px-3">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <div className="text-6xl mb-4">🔧</div>
                <h3 className="text-lg font-semibold text-neutral-800 dark:text-white mb-2">
                  开始在工作坊中创建
                </h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
                  与AI助手协作设计和创建新的智能助手
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-neutral-400 dark:text-neutral-500">
                  <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded dark:bg-purple-900/30 dark:text-purple-400">
                    描述你的想法
                  </span>
                  <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded dark:bg-purple-900/30 dark:text-purple-400">
                    定义功能需求
                  </span>
                  <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded dark:bg-purple-900/30 dark:text-purple-400">
                    设计交互流程
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <AnimatePresence>
                  {messages.map((msg) => (
                    <ChatBubble key={msg.id} message={msg} />
                  ))}
                </AnimatePresence>
                <div ref={messagesEndRef} className="h-4" />
              </div>
            )}
          </div>
        </div>

        {!autoScroll && messages.length > 0 && (
          <button
            onClick={() => {
              setAutoScroll(true);
              scrollToBottom(true);
            }}
            className="absolute bottom-4 right-4 z-20 rounded-full bg-purple-600 p-2 text-white shadow-md transition-colors hover:bg-purple-700"
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

      <div className="flex-shrink-0">
        <ChatToolbar
          onShowHistory={handleToggleHistory}
          onHeightChange={handleInputHeightChange}
        />
        {sendBlocked && (
          <div className="mx-4 mb-1 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-900/20 dark:text-amber-200 dark:ring-amber-800/40">
            正在生成回复，暂时无法发送。请稍后再试。
          </div>
        )}
        <ChatInput
          onSendMessage={handleSendMessage}
          disabled={!connected}
          placeholder={
            responding
              ? "AI 正在协助创建中，暂时无法发送…"
              : "描述你想创建的助手..."
          }
          height={inputHeight}
          initialValue={pendingInput}
        />
      </div>

      {/* 通知模态框 */}
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
    </div>
  );
}

"use client";
import EditableTitle from "@/components/base/EditableTitle";
import { useXyzen } from "@/store";
import type { Message } from "@/store/types";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

import ChatBubble from "./components/ChatBubble";
import ChatInput from "./components/ChatInput";
import ChatToolbar from "./components/ChatToolbar";
import EmptyChat from "./components/EmptyChat";
import SessionHistory from "./components/SessionHistory";
import WelcomeMessage from "./components/WelcomeMessage";

export default function XyzenChat() {
  const {
    activeChatChannel,
    channels,
    agents,
    sendMessage,
    connectToChannel,
    updateTopicName,
    fetchMyProviders,
    llmProviders,
  } = useXyzen();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [inputHeight, setInputHeight] = useState(() => {
    const savedHeight = localStorage.getItem("chatInputHeight");
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
    setAutoScroll(true);
    setTimeout(() => scrollToBottom(true), 100);
  };

  const handleToggleHistory = () => {
    setShowHistory(!showHistory);
  };

  const handleCloseHistory = () => {
    setShowHistory(false);
  };

  const handleSelectTopic = (_topicId: string) => {
    setShowHistory(false);
  };

  const handleInputHeightChange = (height: number) => {
    setInputHeight(height);
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
    return <EmptyChat />;
  }

  return (
    <div className="flex h-full flex-col">
      {!activeChatChannel ? (
        <>
          <EmptyChat />
          {/* 即使在空聊天状态，也要添加工具栏以便访问历史记录 */}
          <div className="border-t border-neutral-200 dark:border-neutral-800" />
          <div className="flex-shrink-0">
            <ChatToolbar
              onShowHistory={handleToggleHistory}
              onHeightChange={handleInputHeightChange}
            />
          </div>
        </>
      ) : (
        <>
          {currentAgent ? (
            <div className=" relative flex-shrink-0 border-b border-neutral-200 bg-gradient-to-r from-white to-neutral-50 px-4 py-3 dark:border-neutral-800 dark:from-black dark:to-neutral-950">
              <div className="flex items-start gap-3">
                <img
                  src={
                    currentAgent.id === "default-chat"
                      ? "https://avatars.githubusercontent.com/u/176685?v=4"
                      : "https://cdn1.deepmd.net/static/img/affb038eChatGPT Image 2025年8月6日 10_33_07.png"
                  }
                  alt={currentAgent.name}
                  className="mt-1 h-8 w-8 flex-shrink-0 rounded-full border-2 border-indigo-100 object-cover shadow-sm dark:border-indigo-900"
                />
                <div className="flex-1 min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                      {currentAgent.name}
                    </span>
                    <span className="text-xs text-neutral-400 dark:text-neutral-500">
                      •
                    </span>
                    <EditableTitle
                      title={currentChannel?.title || "新的聊天"}
                      onSave={(newTitle) => {
                        if (activeChatChannel) {
                          return updateTopicName(activeChatChannel, newTitle);
                        }
                        return Promise.resolve();
                      }}
                      textClassName="text-sm text-neutral-600 dark:text-neutral-400"
                    />
                    {responding && (
                      <span className=" absolute right-0 ml-2 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600 ring-1 ring-inset ring-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-300 dark:ring-indigo-800/40">
                        <svg
                          className="h-3 w-3 animate-spin"
                          viewBox="0 0 24 24"
                        >
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
                        AI 正在回复…
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
            <div className=" relative flex-shrink-0 border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-black">
              <EditableTitle
                title={currentChannel?.title || "新的聊天"}
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
                您可以在这里与AI助手自由讨论任何话题
              </p>
              {responding && (
                <div className=" absolute right-0 mt-1 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600 ring-1 ring-inset ring-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-300 dark:ring-indigo-800/40">
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
                  AI 正在回复…
                </div>
              )}
            </div>
          )}

          {!connected && (
            <div className="mb-1 flex flex-shrink-0 items-center justify-between rounded-md bg-amber-50 px-3 py-1.5 dark:bg-amber-900/20">
              <span className="text-xs text-amber-700 dark:text-amber-200">
                {error || "正在连接聊天服务..."}
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
                  <WelcomeMessage />
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
                className="absolute bottom-4 right-4 z-20 rounded-full bg-indigo-600 p-2 text-white shadow-md transition-colors hover:bg-indigo-700"
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
                responding ? "AI 正在回复中，暂时无法发送…" : "输入消息..."
              }
              height={inputHeight}
            />
          </div>
        </>
      )}

      {/* 历史记录侧边栏 */}
      <SessionHistory
        isOpen={showHistory}
        onClose={handleCloseHistory}
        onSelectTopic={handleSelectTopic}
      />
    </div>
  );
}

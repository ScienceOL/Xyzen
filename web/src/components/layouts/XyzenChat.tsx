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

  const currentChannel = activeChatChannel ? channels[activeChatChannel] : null;
  const currentAgent = currentChannel?.agentId
    ? agents.find((a) => a.id === currentChannel.agentId)
    : null;
  const messages: Message[] = currentChannel?.messages || [];
  const connected = currentChannel?.connected || false;
  const error = currentChannel?.error || null;

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
            <div className="flex-shrink-0 px-4 pb-2">
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
                {currentAgent.description}
              </p>
            </div>
          ) : (
            <div className="flex-shrink-0 px-4 pb-2">
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
              className="h-full overflow-y-auto rounded-lg bg-neutral-50 pt-6 dark:bg-black"
              style={{
                scrollbarWidth: "thin",
                scrollbarColor: "rgba(156,163,175,0.5) transparent",
              }}
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

          {/* 分割线在消息区域和工具栏之间 */}
          <div className="border-t border-neutral-200 dark:border-neutral-800" />

          <div className="flex-shrink-0">
            <ChatToolbar
              onShowHistory={handleToggleHistory}
              onHeightChange={handleInputHeightChange}
            />
            <div className="bg-neutral-50/80 dark:bg-neutral-950/80">
              <ChatInput
                onSendMessage={handleSendMessage}
                disabled={!connected}
                placeholder="输入消息..."
                height={inputHeight}
              />
            </div>
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

"use client";
import { useXyzen, type Message } from "@/store/xyzenStore";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

import ChatBubble from "./components/ChatBubble";
import ChatInput from "./components/ChatInput";
import EmptyChat from "./components/EmptyChat";
import WelcomeMessage from "./components/WelcomeMessage";

export default function XyzenChat() {
  const {
    activeChatChannel,
    channels,
    assistants,
    sendMessage,
    connectToChannel,
  } = useXyzen();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [inputHeight, setInputHeight] = useState(80);

  const messagePaddingBottom = inputHeight + 36;
  const scrollButtonBottom = inputHeight + 48;

  const currentChannel = activeChatChannel ? channels[activeChatChannel] : null;
  const currentAssistant = currentChannel?.assistantId
    ? assistants.find((a) => a.id === currentChannel.assistantId)
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

  const handleScroll = () => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        messagesContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 80;
      setAutoScroll(isNearBottom);
    }
  };

  const handleSendMessage = (inputMessage: string) => {
    if (!inputMessage.trim() || !activeChatChannel) return;
    sendMessage(inputMessage);
    setAutoScroll(true);
    setTimeout(() => scrollToBottom(true), 100);
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
      scrollToBottom(true);
      container.addEventListener("scroll", handleScroll, { passive: true });
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, [activeChatChannel, scrollToBottom]);

  const handleInputHeightChange = (newHeight: number) => {
    setInputHeight(newHeight);
    if (autoScroll) {
      setTimeout(() => scrollToBottom(true), 100);
    }
  };

  if (!activeChatChannel) {
    return <EmptyChat />;
  }

  return (
    <div className="flex h-full flex-col" style={{height: `calc(100vh - 136px)`}}>
      {currentAssistant ? (
        <div className="flex-shrink-0 px-4 pb-2">
          <h2 className="text-lg font-medium text-neutral-800 dark:text-white">
            {currentAssistant.title}
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {currentAssistant.description}
          </p>
        </div>
      ) : (
        <div className="flex-shrink-0 px-4 pb-2">
          <h2 className="text-lg font-medium text-neutral-800 dark:text-white">
            自由对话
          </h2>
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

      <div className="relative flex h-[calc(100vh-11.5rem)] flex-grow flex-col">
        <div
          ref={messagesContainerRef}
          className="absolute inset-0 overflow-y-auto rounded-lg bg-neutral-50 pt-6 dark:bg-black"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(156,163,175,0.5) transparent",
            paddingBottom: `${messagePaddingBottom}px`,
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
            className="absolute right-4 z-20 rounded-full bg-indigo-600 p-2 text-white shadow-md transition-colors hover:bg-indigo-700"
            style={{
              bottom: `${scrollButtonBottom}px`,
            }}
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

        <div className="absolute bottom-0 left-0 z-20 right-0 rounded-b-lg border-t border-neutral-200 bg-white p-2 pb-0 shadow-[0_-2px_5px_rgba(0,0,0,0.05)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_-2px_5px_rgba(0,0,0,0.2)]">
          <ChatInput
            onSendMessage={handleSendMessage}
            disabled={!connected}
            placeholder="输入消息..."
            onHeightChange={handleInputHeightChange}
          />
        </div>
      </div>
    </div>
  );
}

"use client";

import EditableTitle from "@/components/base/EditableTitle";
import { LoadingSpinner } from "@/components/base/LoadingSpinner";
import ConfirmationModal from "@/components/modals/ConfirmationModal";
import { formatTime } from "@/lib/formatDate";
import { useXyzen } from "@/store";
import type { ChatHistoryItem } from "@/store/types";

import { MapPinIcon } from "@heroicons/react/20/solid";
import {
  ArchiveBoxXMarkIcon,
  ChevronRightIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  UserIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useMemo, useState } from "react";

interface SessionHistoryProps {
  context?: "chat" | "workshop";
  isOpen: boolean;
  onClose: () => void;
  onSelectTopic?: (topicId: string) => void;
}

export default function SessionHistory({
  context = "chat",
  isOpen,
  onClose,
  onSelectTopic,
}: SessionHistoryProps) {
  const [isConfirmModalOpen, setConfirmModalOpen] = useState(false);
  const [topicToDelete, setTopicToDelete] = useState<ChatHistoryItem | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

  const {
    // Chat state
    chatHistory,
    chatHistoryLoading,
    activeChatChannel,
    channels,
    activateChannel,
    togglePinChat,
    fetchChatHistory,
    updateTopicName,
    deleteTopic,
    clearSessionTopics,
    // Workshop state
    workshopHistory,
    workshopHistoryLoading,
    activeWorkshopChannel,
    workshopChannels,
    activateWorkshopChannel,
    togglePinWorkshopChat,
    updateWorkshopTopicName,
    deleteWorkshopTopic,
    clearWorkshopSessionTopics,
    // Common
    user,
  } = useXyzen();

  // Use appropriate state based on context
  const isWorkshop = context === "workshop";
  const history = isWorkshop ? workshopHistory : chatHistory;
  const historyLoading = isWorkshop
    ? workshopHistoryLoading
    : chatHistoryLoading;
  const activeChannel = isWorkshop ? activeWorkshopChannel : activeChatChannel;
  const channelsData = isWorkshop ? workshopChannels : channels;
  const activateChannelFn = isWorkshop
    ? activateWorkshopChannel
    : activateChannel;
  const togglePinFn = isWorkshop ? togglePinWorkshopChat : togglePinChat;
  const fetchHistoryFn = fetchChatHistory; // Always use fetchChatHistory - workshop syncs from it
  const updateTopicFn = isWorkshop ? updateWorkshopTopicName : updateTopicName;
  const deleteTopicFn = isWorkshop ? deleteWorkshopTopic : deleteTopic;
  const clearSessionFn = isWorkshop
    ? clearWorkshopSessionTopics
    : clearSessionTopics;
  // 当组件打开时获取历史记录
  useEffect(() => {
    if (isOpen) {
      fetchHistoryFn();
    }
  }, [isOpen, fetchHistoryFn]);

  // 检查用户是否已登录
  const isUserLoggedIn = useMemo(() => {
    // 使用真实的认证检查而不是mock用户
    const hasUser = user && (user.id || user.username);
    return hasUser;
  }, [user]);

  // 获取当前session的topics
  const currentSessionTopics = useMemo(() => {
    if (!activeChannel || !channelsData[activeChannel]) {
      return [];
    }

    const currentSessionId = channelsData[activeChannel].sessionId;

    const topics = history.filter((chat) => {
      const channel = channelsData[chat.id];
      const belongs = channel && channel.sessionId === currentSessionId;
      return belongs;
    });

    return topics;
  }, [activeChannel, channelsData, history]);

  // 过滤搜索结果
  const filteredTopics = useMemo(() => {
    if (!searchQuery.trim()) {
      return currentSessionTopics;
    }

    const query = searchQuery.toLowerCase();
    return currentSessionTopics.filter(
      (topic) =>
        topic.title.toLowerCase().includes(query) ||
        topic.lastMessage?.toLowerCase().includes(query),
    );
  }, [currentSessionTopics, searchQuery]);

  // 根据置顶状态对聊天记录进行排序
  const sortedHistory = [...filteredTopics].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    const dateA = new Date(a.updatedAt);
    const dateB = new Date(b.updatedAt);
    return dateB.getTime() - dateA.getTime();
  });

  // 清空所有对话
  const handleClearAllTopics = () => {
    setIsClearConfirmOpen(true);
  };

  const confirmClearAll = async () => {
    if (activeChannel && channelsData[activeChannel]) {
      const sessionId = channelsData[activeChannel].sessionId;
      await clearSessionFn(sessionId);
      setIsClearConfirmOpen(false);
    }
  };

  // 选择并激活聊天频道
  const handleViewChat = async (chatId: string) => {
    // 激活选中的频道，建立WebSocket连接
    await activateChannelFn(chatId);
    onSelectTopic?.(chatId);
    // Keep history panel open for better UX - removed onClose()
  };

  // 切换置顶状态
  const handleTogglePin = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    togglePinFn(chatId);
  };

  const handleDeleteTopic = (e: React.MouseEvent, topic: ChatHistoryItem) => {
    e.stopPropagation();

    // Prevent deleting the last topic in the session
    if (sortedHistory.length <= 1) {
      console.warn("Cannot delete the last topic in a session");
      return;
    }

    setTopicToDelete(topic);
    setConfirmModalOpen(true);
  };

  // 未登录时的UI
  const renderLoginPrompt = () => (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <UserIcon className="h-16 w-16 text-neutral-300 dark:text-neutral-600" />
      <h3 className="mt-4 text-lg font-medium text-neutral-800 dark:text-white">
        请先登录
      </h3>
      <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
        登录后即可查看和管理您的会话历史记录
      </p>
      <div className="mt-6">
        <button
          onClick={onClose}
          className="rounded-sm bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          关闭
        </button>
      </div>
    </div>
  );

  // 加载中的UI
  const renderLoading = () => (
    <div className="flex h-full items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  );

  // 无历史记录时的UI
  const renderEmpty = () => (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <ClockIcon className="h-16 w-16 text-neutral-300 dark:text-neutral-600" />
      <h3 className="mt-4 text-lg font-medium text-neutral-800 dark:text-white">
        当前会话暂无历史记录
      </h3>
      <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
        开始对话即可创建历史记录
      </p>
    </div>
  );

  // 历史记录列表UI
  const renderHistoryList = () => (
    <div className="flex h-full flex-col">
      {/* Header with title and close button */}
      <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-800 dark:text-white">
            会话历史
          </h2>
          <button
            onClick={onClose}
            className="rounded-sm p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            title="关闭历史记录"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          当前会话的对话主题
        </p>
      </div>

      {/* Toolbar: Search and Clear */}
      <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          {/* Search Input */}
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="搜索对话..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-sm border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm text-neutral-800 placeholder-neutral-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:placeholder-neutral-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Clear All Button */}
          <button
            onClick={handleClearAllTopics}
            className="flex items-center gap-1.5 rounded-sm border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-red-50 hover:border-red-200 hover:text-red-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-red-950/30 dark:hover:border-red-800 dark:hover:text-red-400"
            title="清空所有对话"
          >
            <ArchiveBoxXMarkIcon className="h-4 w-4" />
            <span>清空</span>
          </button>
        </div>

        {/* Search Results Count */}
        {searchQuery && (
          <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            找到 {sortedHistory.length} 个结果
          </div>
        )}
      </div>

      {/* Topics List */}
      <div className="flex-1 overflow-y-auto p-4">
        {sortedHistory.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <MagnifyingGlassIcon className="h-12 w-12 text-neutral-300 dark:text-neutral-600" />
            <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">
              {searchQuery ? "没有找到匹配的对话" : "当前会话暂无历史记录"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedHistory.map((chat: ChatHistoryItem) => (
              <div
                key={chat.id}
                className={`group relative flex cursor-pointer items-center justify-between rounded-sm border p-3 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900 ${
                  chat.id === activeChannel
                    ? "border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950"
                    : "border-neutral-200 dark:border-neutral-800"
                }`}
              >
                <div
                  className="flex-1 overflow-hidden"
                  onClick={() => handleViewChat(chat.id)}
                >
                  <div className="flex items-center">
                    {chat.isPinned && (
                      <MapPinIcon className="mr-2 h-3.5 w-3.5 rotate-45 text-indigo-500 dark:text-indigo-400" />
                    )}
                    <div className="flex-1">
                      <EditableTitle
                        title={chat.title}
                        onSave={(newTitle) => updateTopicFn(chat.id, newTitle)}
                        className="w-full"
                        textClassName={`truncate text-sm font-medium ${
                          chat.id === activeChannel
                            ? "text-indigo-700 dark:text-indigo-300"
                            : chat.isPinned
                              ? "text-indigo-700 dark:text-indigo-400"
                              : "text-neutral-800 dark:text-white"
                        }`}
                      />
                    </div>
                  </div>
                  <div className="mt-1 flex items-center text-xs text-neutral-500 dark:text-neutral-400">
                    <span className="truncate">{chat.assistantTitle}</span>
                    <span className="mx-1.5">·</span>
                    <span className="whitespace-nowrap">
                      {formatTime(chat.updatedAt)}
                    </span>
                  </div>
                  {chat.lastMessage && (
                    <p className="mt-1 truncate text-xs text-neutral-500 dark:text-neutral-400">
                      {chat.lastMessage}
                    </p>
                  )}
                </div>
                <div className="ml-3 flex items-center gap-1">
                  <button
                    className={`invisible rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-red-700 group-hover:visible dark:hover:bg-neutral-800 dark:hover:text-red-400 ${
                      sortedHistory.length <= 1
                        ? "opacity-50 cursor-not-allowed"
                        : ""
                    }`}
                    title={
                      sortedHistory.length <= 1
                        ? "不能删除最后一个会话"
                        : "删除会话"
                    }
                    onClick={(e) => handleDeleteTopic(e, chat)}
                    disabled={sortedHistory.length <= 1}
                  >
                    <TrashIcon className={`h-3.5 w-3.5`} />
                  </button>
                  <button
                    className="invisible rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-700 group-hover:visible dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
                    title={chat.isPinned ? "取消置顶" : "置顶会话"}
                    onClick={(e) => handleTogglePin(e, chat.id)}
                  >
                    <MapPinIcon
                      className={`h-3.5 w-3.5 ${chat.isPinned ? "rotate-45" : ""}`}
                    />
                  </button>
                  <div className="rounded-full p-1 text-neutral-400 group-hover:text-neutral-500">
                    <ChevronRightIcon className="h-3.5 w-3.5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="h-full bg-white dark:bg-neutral-900">
        {/* Simple container without overlay/positioning */}
        {(() => {
          console.log("SessionHistory: Render decision", {
            isUserLoggedIn,
            chatHistoryLoading,
            activeChatChannel,
            channels,
            sortedHistoryLength: sortedHistory.length,
          });

          if (!isUserLoggedIn) {
            return renderLoginPrompt();
          }
          if (historyLoading) {
            return renderLoading();
          }
          if (sortedHistory.length === 0) {
            return renderEmpty();
          }
          return renderHistoryList();
        })()}
      </div>

      {/* Modals remain at component level */}
      {topicToDelete && (
        <ConfirmationModal
          isOpen={isConfirmModalOpen}
          onClose={() => {
            setConfirmModalOpen(false);
            setTopicToDelete(null);
          }}
          onConfirm={() => {
            if (topicToDelete) deleteTopicFn(topicToDelete.id);
            setConfirmModalOpen(false);
            setTopicToDelete(null);
          }}
          title="Delete Topic"
          message={`Are you sure you want to delete the topic "${topicToDelete?.title}"?`}
        />
      )}

      {/* Clear All Confirmation Modal */}
      <ConfirmationModal
        isOpen={isClearConfirmOpen}
        onClose={() => setIsClearConfirmOpen(false)}
        onConfirm={confirmClearAll}
        title="清空所有对话"
        message="确定要清空当前会话的所有对话记录吗？此操作不可恢复。"
      />
    </>
  );
}

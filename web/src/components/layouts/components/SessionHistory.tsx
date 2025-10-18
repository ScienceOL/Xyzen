"use client";

import EditableTitle from "@/components/base/EditableTitle";
import { LoadingSpinner } from "@/components/base/LoadingSpinner";
import ConfirmationModal from "@/components/modals/ConfirmationModal";
import { formatTime } from "@/lib/formatDate";
import { useXyzen } from "@/store";
import type { ChatHistoryItem } from "@/store/types";
import { Transition } from "@headlessui/react";
import { MapPinIcon } from "@heroicons/react/20/solid";
import {
  ChevronRightIcon,
  ClockIcon,
  TrashIcon,
  UserIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Fragment, useEffect, useMemo, useState } from "react";

interface SessionHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTopic?: (topicId: string) => void;
}

export default function SessionHistory({
  isOpen,
  onClose,
  onSelectTopic,
}: SessionHistoryProps) {
  const [isConfirmModalOpen, setConfirmModalOpen] = useState(false);
  const [topicToDelete, setTopicToDelete] = useState<ChatHistoryItem | null>(
    null,
  );
  const {
    chatHistory,
    chatHistoryLoading,
    activeChatChannel,
    channels,
    activateChannel,
    togglePinChat,
    user,
    fetchChatHistory,
    updateTopicName,
    deleteTopic,
  } = useXyzen();

  // 当组件打开时获取历史记录
  useEffect(() => {
    if (isOpen) {
      console.log("SessionHistory: Component opened, fetching history...");
      fetchChatHistory();
    }
  }, [isOpen, fetchChatHistory]);

  // 检查用户是否已登录
  const isUserLoggedIn = useMemo(() => {
    // 使用真实的认证检查而不是mock用户
    const hasUser = user && (user.id || user.username);
    console.log("SessionHistory: User login check:", { user, hasUser });
    return hasUser;
  }, [user]);

  // 获取当前session的topics
  const currentSessionTopics = useMemo(() => {
    console.log("SessionHistory: Processing topics", {
      activeChatChannel,
      channels,
      chatHistory: chatHistory.length,
    });

    if (!activeChatChannel || !channels[activeChatChannel]) {
      console.log("SessionHistory: No active channel or channel not found");
      return [];
    }

    const currentSessionId = channels[activeChatChannel].sessionId;
    console.log("SessionHistory: Current session ID:", currentSessionId);

    const topics = chatHistory.filter((chat) => {
      const channel = channels[chat.id];
      const belongs = channel && channel.sessionId === currentSessionId;
      console.log(
        `SessionHistory: Topic ${chat.id} belongs to current session:`,
        belongs,
      );
      return belongs;
    });

    console.log("SessionHistory: Current session topics:", topics.length);
    return topics;
  }, [activeChatChannel, channels, chatHistory]);

  // 根据置顶状态对聊天记录进行排序
  const sortedHistory = [...currentSessionTopics].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    const dateA = new Date(a.updatedAt);
    const dateB = new Date(b.updatedAt);
    return dateB.getTime() - dateA.getTime();
  });

  console.log("SessionHistory: Final sorted history:", sortedHistory.length);

  // 选择并激活聊天频道
  const handleViewChat = async (chatId: string) => {
    // 激活选中的频道，建立WebSocket连接
    await activateChannel(chatId);
    onSelectTopic?.(chatId);
    onClose(); // 选择topic后关闭侧边栏
  };

  // 切换置顶状态
  const handleTogglePin = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    togglePinChat(chatId);
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
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
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
    <div className="h-full overflow-y-auto">
      <div className="sticky top-0 z-10 bg-white px-4 py-3 border-b border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-800 dark:text-white">
            会话历史
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            title="关闭历史记录"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          当前会话的对话主题
        </p>
      </div>

      <div className="p-4">
        <div className="space-y-2">
          {sortedHistory.map((chat: ChatHistoryItem) => (
            <div
              key={chat.id}
              className={`group relative flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900 ${
                chat.id === activeChatChannel
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
                      onSave={(newTitle) => updateTopicName(chat.id, newTitle)}
                      className="w-full"
                      textClassName={`truncate text-sm font-medium ${
                        chat.id === activeChatChannel
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
      </div>
    </div>
  );

  return (
    <>
      {/* 背景遮罩 */}
      <Transition
        show={isOpen}
        as={Fragment}
        enter="ease-out duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="ease-in duration-200"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
          onClick={onClose}
        />
      </Transition>

      {/* 侧边栏 */}
      <Transition
        show={isOpen}
        as={Fragment}
        enter="transform transition ease-in-out duration-300"
        enterFrom="translate-x-full"
        enterTo="translate-x-0"
        leave="transform transition ease-in-out duration-300"
        leaveFrom="translate-x-0"
        leaveTo="translate-x-full"
      >
        <div className="fixed inset-y-0 right-0 z-50 w-80 bg-white shadow-2xl dark:bg-neutral-900">
          {(() => {
            console.log("SessionHistory: Render decision", {
              isUserLoggedIn,
              chatHistoryLoading,
              sortedHistoryLength: sortedHistory.length,
            });

            if (!isUserLoggedIn) {
              console.log("SessionHistory: Rendering login prompt");
              return renderLoginPrompt();
            }
            if (chatHistoryLoading) {
              console.log("SessionHistory: Rendering loading state");
              return renderLoading();
            }
            if (sortedHistory.length === 0) {
              console.log("SessionHistory: Rendering empty state");
              return renderEmpty();
            }
            console.log("SessionHistory: Rendering history list");
            return renderHistoryList();
          })()}
        </div>
      </Transition>
      {topicToDelete && (
        <ConfirmationModal
          isOpen={isConfirmModalOpen}
          onClose={() => setConfirmModalOpen(false)}
          onConfirm={() => {
            deleteTopic(topicToDelete.id);
            setConfirmModalOpen(false);
            setTopicToDelete(null);
          }}
          title="Delete Topic"
          message={`Are you sure you want to delete the topic "${topicToDelete.title}"?`}
        />
      )}
    </>
  );
}

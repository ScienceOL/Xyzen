import React from "react";

import type { Message, User } from "@/store/types";
import type { Agent } from "@/types/agents";

interface ChatPreviewProps {
  messages: Message[];
  currentAgent: Agent | undefined;
  currentUser: User | null;
}

const ChatPreview: React.FC<ChatPreviewProps> = ({
  messages,
  currentAgent,
  currentUser,
}) => {
  // 二维码 URL
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent("https://www.bohrium.com/apps/xyzen/job?type=app")}`;

  // 消息气泡组件，简化版用于预览 - 扁平化风格
  const MessageBubble = ({ message }: { message: Message }) => {
    const isUser = message.role === "user";

    // AI 机器人头像（使用 emoji 或 SVG）
    const robotAvatar = (
      <div className="w-9 h-9 bg-teal-100 dark:bg-teal-900 flex items-center justify-center text-xl flex-shrink-0">
        🤖
      </div>
    );

    // 用户默认头像
    const userAvatar = (
      <div className="w-9 h-9 bg-neutral-300 dark:bg-neutral-600 flex items-center justify-center text-xl flex-shrink-0">
        👤
      </div>
    );

    // 用户名
    const userName = currentUser?.username || "用户";

    return (
      <div
        className={`mb-3 px-4`}
        style={{
          // 确保在截图时消息气泡正确显示
          breakInside: "avoid",
        }}
      >
        <div
          className={`flex ${isUser ? "justify-end" : "justify-start"} items-start gap-2`}
        >
          {/* AI 头像（左侧，顶部对齐） */}
          {!isUser && robotAvatar}

          <div
            className={`max-w-[75%] px-4 py-3 rounded ${
              isUser
                ? "bg-teal-600 text-white"
                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-700"
            }`}
          >
            {!isUser && currentAgent && (
              <div className="text-xs font-semibold mb-1.5 text-teal-600 dark:text-teal-400">
                {currentAgent.name}
              </div>
            )}
            <div className="whitespace-pre-wrap text-[15px] leading-relaxed">
              {message.content}
            </div>
            {message.timestamp && (
              <div
                className={`text-[11px] mt-2 ${
                  isUser
                    ? "text-teal-100"
                    : "text-neutral-500 dark:text-neutral-500"
                }`}
              >
                {new Date(message.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            )}
          </div>

          {/* 用户头像和用户名（右侧） */}
          {isUser && (
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] text-neutral-600 dark:text-neutral-400 font-medium">
                {userName}
              </span>
              {userAvatar}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-neutral-900 overflow-hidden">
      {/* 聊天标题栏 - 扁平化设计 - 青绿色主题 */}
      <div className="bg-teal-600 text-white p-5 border-b-4 border-teal-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-teal-700 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold">Xyzen</h2>
              <p className="text-xs text-teal-100 mt-0.5">
                {new Date().toLocaleDateString("zh-CN", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>
          {/* 二维码移到右上角 */}
          <div className="flex flex-col items-center">
            <div className="bg-white p-1.5 border-2 border-teal-100">
              <img
                src={qrCodeUrl}
                alt="扫码体验"
                className="w-16 h-16"
                crossOrigin="anonymous"
              />
            </div>
            <p className="text-[9px] text-teal-100 mt-1 font-medium">
              扫码体验
            </p>
          </div>
        </div>
      </div>

      {/* 聊天内容 - 扁平化背景 */}
      <div className="p-5 bg-neutral-50 dark:bg-neutral-900 min-h-[200px]">
        {messages.length === 0 ? (
          <div className="text-center py-16 text-neutral-400">
            <div className="w-16 h-16 mx-auto mb-4 bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-neutral-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            暂无聊天记录
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </div>
        )}
      </div>

      {/* 底部信息 - 扁平化设计 - 青绿色主题 */}
      <div className="bg-white dark:bg-neutral-800 border-t-2 border-neutral-200 dark:border-neutral-700 p-5">
        <div className="text-center">
          <p className="text-base font-semibold text-teal-600 dark:text-teal-400 mb-2">
            一键开启AI对话
          </p>
          <div className="flex items-center justify-center gap-1 text-xs text-neutral-500 dark:text-neutral-400 mb-2">
            <span>由</span>
            <span className="font-medium text-neutral-700 dark:text-neutral-300">
              {currentUser?.username || "用户"}
            </span>
            <span>导出 · {new Date().toLocaleDateString("zh-CN")}</span>
          </div>
          <p className="text-xs text-amber-600 dark:text-amber-500 flex items-center justify-center gap-1">
            <svg
              className="w-3 h-3 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span>内容由AI生成，请注意甄别</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChatPreview;

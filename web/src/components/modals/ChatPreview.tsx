import { BubbleBackground } from "@/components/animate-ui/components/backgrounds/bubble";
import AvatarComponent from "@/components/shared/AvatarComponent";
import Markdown from "@/lib/Markdown";
import type { Message, User } from "@/store/types";
import type { Agent } from "@/types/agents";
import { User as UserIcon } from "lucide-react";
import React from "react";

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
  React.useEffect(() => {
    console.log("ChatPreview - currentAgent:", currentAgent);
    console.log("ChatPreview - avatar:", currentAgent?.avatar);
  }, [currentAgent]);

  // 使用本地预生成的静态二维码，避免 API CORS 问题
  const qrCodeUrl = "/defaults/agents/bohr_app_qrcode.png";

  // 消息气泡组件，简化版用于预览 - 扁平化风格
  const MessageBubble = ({ message }: { message: Message }) => {
    const isUser = message.role === "user";

    // 用户名
    const userName = currentUser?.username || "用户";

    return (
      <div
        className={`mb-4 px-2`}
        style={{
          // 确保在截图时消息气泡正确显示
          breakInside: "avoid",
        }}
      >
        <div
          className={`flex ${isUser ? "justify-end" : "justify-start"} items-start gap-3`}
        >
          <div
            className={`max-w-11/12 px-5 py-4 rounded-2xl shadow-md backdrop-blur-xl transition-all ${
              isUser
                ? "bg-gradient-to-br from-blue-500/60 to-indigo-600/60 text-white rounded-tr-sm border border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]"
                : "bg-white/60 dark:bg-neutral-800/60 text-neutral-900 dark:text-neutral-100 rounded-tl-sm border border-white/40 dark:border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)]"
            }`}
          >
            {/* 头部信息：头像和名字 */}
            <div
              className={`flex items-center gap-2 mb-2 ${isUser ? "flex-row-reverse justify-start" : "justify-start"}`}
            >
              {/* 头像 */}
              {isUser ? (
                <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-blue-400 to-indigo-500 flex items-center justify-center shadow-sm flex-shrink-0 border border-white/20">
                  <UserIcon className="w-3.5 h-3.5 text-white" />
                </div>
              ) : (
                <AvatarComponent
                  avatar={currentAgent?.avatar ?? undefined}
                  backgroundColor={
                    currentAgent?.avatar_background_color ?? undefined
                  }
                  fallbackEmoji={
                    currentAgent?.id === "00000000-0000-0000-0000-000000000001"
                      ? "😊"
                      : "robot"
                  }
                  fallbackImageSrc={
                    currentAgent?.agent_type === "builtin"
                      ? currentAgent?.id ===
                        "00000000-0000-0000-0000-000000000001"
                        ? "/defaults/agents/avatar1.png"
                        : "/defaults/agents/avatar4.png"
                      : "/defaults/agents/avatar2.png"
                  }
                  alt={currentAgent?.name || "AI"}
                  className="w-5 h-5 rounded-full object-cover flex-shrink-0"
                  containerClassName="w-5 h-5 rounded-full overflow-hidden flex-shrink-0"
                  disableVideo={true}
                />
              )}

              {/* 名字 */}
              <span
                className={`text-xs font-bold opacity-90 whitespace-nowrap ${
                  isUser ? "text-blue-50" : "text-blue-600 dark:text-blue-400"
                }`}
              >
                {isUser ? userName : currentAgent?.name}
              </span>
            </div>

            <div className="text-[15px] leading-relaxed">
              <Markdown content={message.content} />
            </div>
            {message.timestamp && (
              <div
                className={`text-[10px] mt-2 font-medium ${
                  isUser
                    ? "text-blue-100/80"
                    : "text-neutral-500/80 dark:text-neutral-400/80"
                }`}
              >
                {new Date(message.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative overflow-auto bg-neutral-100 dark:bg-neutral-900 h-full">
      {/* 动态气泡背景 */}
      <BubbleBackground
        className="absolute inset-0 w-full h-full opacity-40 pointer-events-none"
        colors={{
          first: "18,113,255",
          second: "221,74,255",
          third: "0,220,255",
          fourth: "200,50,50",
          fifth: "180,180,50",
          sixth: "140,100,255",
        }}
      />

      {/* 玻璃拟态容器 */}
      <div className="relative z-10 m-6 overflow-hidden rounded-3xl border border-white/40 bg-white/30 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-black/40">
        {/* 聊天标题栏 - 玻璃拟态 */}
        <div className="border-b border-white/20 bg-white/40 p-6 backdrop-blur-md dark:bg-black/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg text-white">
                <svg
                  className="w-7 h-7"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-neutral-900 dark:text-white tracking-tight whitespace-nowrap">
                  Xyzen AI
                </h2>
                <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300 mt-0.5 uppercase tracking-wider opacity-80 whitespace-nowrap">
                  {new Date().toLocaleDateString("zh-CN", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
            </div>
            {/* 二维码 */}
            <div className="flex flex-col items-center gap-1">
              <div className="rounded-xl bg-white p-2 shadow-sm">
                <img src={qrCodeUrl} alt="扫码体验" className="w-14 h-14" />
              </div>
              <span className="text-[10px] font-medium text-neutral-600 dark:text-neutral-300 opacity-80 whitespace-nowrap">
                扫码开启 AI 对话
              </span>
            </div>
          </div>
        </div>

        {/* 聊天内容 */}
        <div className="p-6 min-h-[200px]">
          {messages.length === 0 ? (
            <div className="text-center py-20 text-neutral-500 dark:text-neutral-400">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-white/50 dark:bg-white/10 flex items-center justify-center backdrop-blur-sm">
                <svg
                  className="w-10 h-10 opacity-60"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <p className="font-medium">暂无聊天记录</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </div>
          )}
        </div>

        {/* 底部信息 - 玻璃拟态 */}
        <div className="border-t border-white/20 bg-white/40 p-5 backdrop-blur-md dark:bg-black/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                AI
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-neutral-800 dark:text-white whitespace-nowrap">
                  Xyzen Assistant
                </span>
                <span className="text-[10px] text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                  Intelligent Conversation
                </span>
              </div>
            </div>

            <div className="text-right">
              <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                由{" "}
                <span className="font-bold">
                  {currentUser?.username || "用户"}
                </span>{" "}
                导出
              </p>
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5 flex items-center justify-end gap-1 whitespace-nowrap">
                <span>AI 生成内容</span>
                <span className="w-1 h-1 rounded-full bg-neutral-400"></span>
                <span>仅供参考</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPreview;

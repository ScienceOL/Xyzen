import { motion } from "framer-motion";
import React from "react";

export interface ChatData {
  id: string;
  title: string;
  assistant?: string; // 助手ID
  assistant_name?: string; // 助手名称
  messages_count: number;
  last_message?: {
    content: string;
    timestamp: string;
  };
  created_at: string;
  updated_at: string;
  is_pinned: boolean;
}

export interface Assistant {
  id: string;
  key?: string; // 助手的唯一标识符
  title: string;
  description: string;
  iconType: string;
  iconColor: string;
  category: string;
  chats?: ChatData[]; // 与该助手的历史对话列表
}

interface WelcomeMessageProps {
  assistant?: Assistant | null;
}

const WelcomeMessage: React.FC<WelcomeMessageProps> = ({ assistant }) => {
  const iconColor = assistant?.iconColor || "indigo";

  // Fix dynamic class name issue by mapping to pre-defined classes
  const iconColorMap: Record<string, string> = {
    blue: "bg-blue-50 dark:bg-blue-900/20",
    green: "bg-green-50 dark:bg-green-900/20",
    purple: "bg-purple-50 dark:bg-purple-900/20",
    amber: "bg-amber-50 dark:bg-amber-900/20",
    red: "bg-red-50 dark:bg-red-900/20",
    indigo: "bg-indigo-50 dark:bg-indigo-900/20",
  };

  const iconTextColorMap: Record<string, string> = {
    blue: "text-blue-600 dark:text-blue-400",
    green: "text-green-600 dark:text-green-400",
    purple: "text-purple-600 dark:text-purple-400",
    amber: "text-amber-600 dark:text-amber-400",
    red: "text-red-600 dark:text-red-400",
    indigo: "text-indigo-600 dark:text-indigo-400",
  };

  const bgColorClass = iconColorMap[iconColor] || iconColorMap.indigo;
  const textColorClass = iconTextColorMap[iconColor] || iconTextColorMap.indigo;

  // Determine title and message based on whether an assistant is selected
  const title = assistant ? `欢迎使用 ${assistant.title}` : "欢迎使用自由对话";
  const description =
    assistant?.description ||
    "您现在可以自由提问任何问题。无需选择特定助手，系统将根据您的问题提供合适的回复。";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="flex flex-col items-center justify-center space-y-4 p-6 text-center"
    >
      <div className={`rounded-full ${bgColorClass} opacity-60 p-5`}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-10 w-10 ${textColorClass}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
          />
        </svg>
      </div>
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <h3 className="text-lg font-medium text-neutral-900/40 dark:text-white/40 flex items-center justify-center gap-2">
          {title}
          <img
            src="https://storage.sciol.ac.cn/library/docs/1f44b.webp"
            alt="wave emoji"
            className="inline-block h-6 w-6"
            loading="lazy"
          />
        </h3>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-neutral-600/30 dark:text-neutral-300/30">
          {description}
        </p>
      </motion.div>
    </motion.div>
  );
};

export default WelcomeMessage;

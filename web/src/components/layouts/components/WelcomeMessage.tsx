import { useXyzen } from "@/store";
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
  avatar?: string; // Agent avatar URL
  chats?: ChatData[]; // 与该助手的历史对话列表
}

interface WelcomeMessageProps {
  assistant?: Assistant | null;
  onQuickAction?: (action: string) => void;
}

const WelcomeMessage: React.FC<WelcomeMessageProps> = ({
  assistant,
  onQuickAction,
}) => {
  // Get sendMessage from store for quick actions
  const sendMessage = useXyzen((state) => state.sendMessage);

  // Quick action suggestions
  const quickActions = [
    { emoji: "👋", label: "Say hello", message: "Hello! Nice to meet you." },
    {
      emoji: "💡",
      label: "Ask a question",
      message: "Can you help me with something?",
    },
    {
      emoji: "📝",
      label: "Start a task",
      message: "I'd like to start a new task.",
    },
  ];

  const handleQuickAction = (message: string) => {
    if (onQuickAction) {
      onQuickAction(message);
    } else {
      sendMessage(message);
    }
  };

  // Determine title and message based on whether an assistant is selected
  const title = assistant
    ? `Start a conversation with ${assistant.title}`
    : "欢迎使用自由对话";
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
      {/* Agent Avatar with Glow Effect */}
      {assistant?.avatar ? (
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-linear-to-br from-indigo-500/30 to-purple-500/30 blur-xl scale-150" />
          <img
            src={assistant.avatar}
            alt={assistant.title}
            className="relative h-20 w-20 rounded-full border-2 border-white/50 shadow-xl object-cover dark:border-white/20"
          />
        </div>
      ) : (
        <div className="rounded-full bg-indigo-50 opacity-60 p-5 dark:bg-indigo-900/20">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-10 w-10 text-indigo-600 dark:text-indigo-400"
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
      )}

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <h3 className="flex items-center justify-center gap-2 text-lg font-medium text-neutral-900/40 dark:text-white/40">
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

      {/* Quick Action Buttons */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="flex flex-wrap justify-center gap-2 pt-2"
      >
        {quickActions.map((action, index) => (
          <button
            key={index}
            onClick={() => handleQuickAction(action.message)}
            className="rounded-full border border-neutral-200 bg-white/80 px-4 py-2 text-sm text-neutral-600 shadow-sm transition-all duration-200 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 dark:border-neutral-700 dark:bg-neutral-800/80 dark:text-neutral-300 dark:hover:border-indigo-600 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-400"
          >
            <span className="mr-1.5">{action.emoji}</span>
            {action.label}
          </button>
        ))}
      </motion.div>
    </motion.div>
  );
};

export default WelcomeMessage;

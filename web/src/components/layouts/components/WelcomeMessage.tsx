import { useXyzen } from "@/store";
import { motion } from "framer-motion";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";

export interface ChatData {
  id: string;
  title: string;
  assistant?: string;
  assistant_name?: string;
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
  key?: string;
  title: string;
  description: string;
  iconType: string;
  iconColor: string;
  category: string;
  avatar?: string;
  chats?: ChatData[];
}

interface WelcomeMessageProps {
  assistant?: Assistant | null;
  onQuickAction?: (action: string) => void;
}

const WelcomeMessage: React.FC<WelcomeMessageProps> = ({
  assistant,
  onQuickAction,
}) => {
  const { t } = useTranslation();
  const sendMessage = useXyzen((state) => state.sendMessage);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Quick action suggestions
  const quickActions = [
    {
      emoji: "🎨",
      label: t("app.welcome.quickActions.drawImage"),
      message: t("app.welcome.quickActions.drawImageMessage"),
    },
    {
      emoji: "🧪",
      label: t("app.welcome.quickActions.launchSandbox"),
      message: t("app.welcome.quickActions.launchSandboxMessage"),
    },
    {
      emoji: "⏰",
      label: t("app.welcome.quickActions.scheduleTask"),
      message: t("app.welcome.quickActions.scheduleTaskMessage"),
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
    ? t("app.welcome.titleWithAgent", { name: assistant.title })
    : t("app.welcome.titleDefault");
  const description = assistant
    ? assistant.description || t("app.welcome.noDescription")
    : t("app.welcome.defaultDescription");

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
            alt="👋"
            className="inline-block h-6 w-6"
            loading="lazy"
          />
        </h3>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-neutral-600/30 dark:text-neutral-300/30">
          {description}
        </p>
      </motion.div>

      {/* Quick Action List */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="flex w-full max-w-xs flex-col items-center pt-2"
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {quickActions.map((action, index) => (
          <button
            key={index}
            onClick={() => handleQuickAction(action.message)}
            onMouseMove={() => setHoveredIndex(index)}
            className="relative flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] text-neutral-400 transition-[color] duration-150 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200"
          >
            {/* Sliding highlight */}
            {hoveredIndex === index && (
              <motion.span
                layoutId="quickActionHighlight"
                className="pointer-events-none absolute inset-0 rounded-lg bg-indigo-500/[0.06] dark:bg-indigo-400/[0.08]"
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              >
                <span className="absolute inset-x-4 top-0 h-px bg-[linear-gradient(to_right,transparent,rgba(99,102,241,0.25)_30%,rgba(99,102,241,0.25)_70%,transparent)]" />
                <span className="absolute inset-x-4 bottom-0 h-px bg-[linear-gradient(to_right,transparent,rgba(99,102,241,0.25)_30%,rgba(99,102,241,0.25)_70%,transparent)]" />
              </motion.span>
            )}
            {/* Base borders */}
            <span className="pointer-events-none absolute inset-x-4 top-0 h-px bg-[linear-gradient(to_right,transparent,rgba(163,163,163,0.1)_30%,rgba(163,163,163,0.1)_70%,transparent)] dark:bg-[linear-gradient(to_right,transparent,rgba(163,163,163,0.08)_30%,rgba(163,163,163,0.08)_70%,transparent)]" />
            <span className="pointer-events-none absolute inset-x-4 bottom-0 h-px bg-[linear-gradient(to_right,transparent,rgba(163,163,163,0.1)_30%,rgba(163,163,163,0.1)_70%,transparent)] dark:bg-[linear-gradient(to_right,transparent,rgba(163,163,163,0.08)_30%,rgba(163,163,163,0.08)_70%,transparent)]" />
            <span className="relative text-sm">{action.emoji}</span>
            <span className="relative">{action.label}</span>
          </button>
        ))}
      </motion.div>
    </motion.div>
  );
};

export default WelcomeMessage;

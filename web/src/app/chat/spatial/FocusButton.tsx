/**
 * FocusButton - Button to manually focus on the default assistant
 */
import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import { motion } from "framer-motion";

interface FocusButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export function FocusButton({ onClick, disabled }: FocusButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
        text-sm font-medium
        backdrop-blur-sm border shadow-sm
        transition-all duration-200
        ${
          disabled
            ? "text-neutral-400 dark:text-neutral-600 bg-neutral-100/40 dark:bg-neutral-900/40 border-neutral-200/40 dark:border-neutral-800/40 cursor-not-allowed"
            : `text-neutral-600 dark:text-neutral-400
               bg-white/60 dark:bg-neutral-800/60
               border-neutral-200/60 dark:border-neutral-700/60
               hover:bg-white/80 dark:hover:bg-neutral-800/80
               hover:text-neutral-800 dark:hover:text-neutral-200
               hover:border-neutral-300 dark:hover:border-neutral-600
               hover:shadow`
        }`}
      title="开始聊天"
    >
      <ChatBubbleLeftRightIcon className="w-4 h-4" strokeWidth={2} />
      <span>开始聊天</span>
    </motion.button>
  );
}

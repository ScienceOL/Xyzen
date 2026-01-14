/**
 * AddAgentButton - Small text button to add new agents
 */
import { PlusIcon } from "@heroicons/react/24/outline";
import { motion } from "framer-motion";

interface AddAgentButtonProps {
  onClick: () => void;
}

export function AddAgentButton({ onClick }: AddAgentButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
        text-sm font-medium text-neutral-600 dark:text-neutral-400
        bg-white/60 dark:bg-neutral-800/60 backdrop-blur-sm
        border border-neutral-200/60 dark:border-neutral-700/60
        hover:bg-white/80 dark:hover:bg-neutral-800/80
        hover:text-neutral-800 dark:hover:text-neutral-200
        hover:border-neutral-300 dark:hover:border-neutral-600
        shadow-sm hover:shadow
        transition-all duration-200"
      title="添加助手"
    >
      <PlusIcon className="w-4 h-4" strokeWidth={2} />
      <span>添加助手</span>
    </motion.button>
  );
}

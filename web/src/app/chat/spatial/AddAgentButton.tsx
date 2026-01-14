/**
 * AddAgentButton - Floating action button to add new agents
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
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full
        bg-gradient-to-br from-indigo-500 to-purple-600
        hover:from-indigo-600 hover:to-purple-700
        shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40
        flex items-center justify-center
        transition-shadow duration-200"
      title="Add new agent"
    >
      <PlusIcon className="w-6 h-6 text-white" strokeWidth={2.5} />

      {/* Ripple effect on hover */}
      <motion.div
        className="absolute inset-0 rounded-full bg-white/20"
        initial={{ scale: 0, opacity: 0 }}
        whileHover={{ scale: 1.2, opacity: 0 }}
        transition={{ duration: 0.4 }}
      />
    </motion.button>
  );
}

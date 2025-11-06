import {
  ChatBubbleLeftRightIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { motion } from "framer-motion";
import { BlocksIcon } from "lucide-react";
export type ActivityPanel = "chat" | "explorer" | "workshop";

interface ActivityBarProps {
  activePanel: ActivityPanel;
  onPanelChange: (panel: ActivityPanel) => void;
  className?: string;
}

interface ActivityButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  panel: ActivityPanel;
  isActive: boolean;
  isDisabled?: boolean;
  onClick: () => void;
}

const ActivityButton: React.FC<ActivityButtonProps> = ({
  icon: Icon,
  label,
  isActive,
  isDisabled = false,
  onClick,
}) => {
  return (
    <motion.button
      whileHover={!isDisabled ? { scale: 1.05 } : {}}
      whileTap={!isDisabled ? { scale: 0.95 } : {}}
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      className={`relative flex h-12 w-12 items-center justify-center rounded-sm transition-all duration-200 ${
        isActive
          ? "bg-indigo-100 text-indigo-600 shadow-sm dark:bg-indigo-900/30 dark:text-indigo-400"
          : isDisabled
            ? "text-neutral-300 cursor-not-allowed dark:text-neutral-600"
            : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800/50 dark:hover:text-neutral-300"
      }`}
      title={isDisabled ? `${label} (Coming Soon)` : label}
    >
      <Icon className="h-6 w-6" />

      {/* Active indicator - vertical bar on the right */}
      {isActive && (
        <motion.div
          layoutId="activeIndicator"
          className="absolute -right-1 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-indigo-600 dark:bg-indigo-400"
          initial={false}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      )}

      {/* Disabled overlay */}
      {isDisabled && (
        <div className="absolute inset-0 rounded-sm bg-neutral-100/50 dark:bg-neutral-800/50" />
      )}
    </motion.button>
  );
};

export const ActivityBar: React.FC<ActivityBarProps> = ({
  activePanel,
  onPanelChange,
  className = "",
}) => {
  const activities = [
    {
      panel: "chat" as ActivityPanel,
      icon: ChatBubbleLeftRightIcon,
      label: "Chat",
      disabled: false,
    },
    {
      panel: "explorer" as ActivityPanel,
      icon: BlocksIcon,
      label: "Explorer",
      disabled: false,
    },
    {
      panel: "workshop" as ActivityPanel,
      icon: WrenchScrewdriverIcon,
      label: "Workshop",
      disabled: false,
    },
  ];

  // Check if horizontal layout is requested
  const isHorizontal = className.includes("flex-row");

  return (
    <div
      className={`flex py-4 ${
        isHorizontal
          ? "flex-row items-center space-x-2"
          : "flex-col items-center space-y-2"
      }`}
    >
      {activities.map((activity) => (
        <ActivityButton
          key={activity.panel}
          icon={activity.icon}
          label={activity.label}
          panel={activity.panel}
          isActive={activePanel === activity.panel}
          isDisabled={activity.disabled}
          onClick={() => onPanelChange(activity.panel)}
        />
      ))}
    </div>
  );
};

export default ActivityBar;

import {
  ChatBubbleLeftRightIcon,
  FolderIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { motion } from "framer-motion";

export type ActivityPanel = "chat" | "knowledge" | "marketplace";

interface ActivityBarProps {
  activePanel: ActivityPanel;
  onPanelChange: (panel: ActivityPanel) => void;
  className?: string;
  isMobile?: boolean;
}

interface ActivityButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  panel: ActivityPanel;
  isActive: boolean;
  isDisabled?: boolean;
  onClick: () => void;
  isMobile?: boolean;
}

const ActivityButton: React.FC<ActivityButtonProps> = ({
  icon: Icon,
  label,
  isActive,
  isDisabled = false,
  onClick,
  isMobile = false,
}) => {
  const isHorizontal = isMobile;

  return (
    <motion.button
      whileHover={!isDisabled ? { scale: 1.05 } : {}}
      whileTap={!isDisabled ? { scale: 0.95 } : {}}
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      className={`relative flex items-center justify-center rounded-sm transition-all duration-200
        ${isHorizontal ? "h-full flex-1 flex-col gap-1 py-1" : "h-12 w-12"}
        ${
          isActive
            ? "bg-indigo-100 text-indigo-600 shadow-sm dark:bg-indigo-900/30 dark:text-indigo-400"
            : isDisabled
              ? "text-neutral-300 cursor-not-allowed dark:text-neutral-600"
              : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800/50 dark:hover:text-neutral-300"
        }`}
      title={isDisabled ? `${label} (Coming Soon)` : label}
    >
      <Icon className={isHorizontal ? "h-5 w-5" : "h-6 w-6"} />

      {isHorizontal && (
        <span className="text-[10px] font-medium leading-none">{label}</span>
      )}

      {/* Active indicator - vertical bar on the right (Desktop) */}
      {!isHorizontal && isActive && (
        <motion.div
          layoutId="activeIndicatorDesktop"
          className="absolute -right-1 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-indigo-600 dark:bg-indigo-400"
          initial={false}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      )}

      {/* Active indicator - horizontal bar on the top (Mobile) */}
      {isHorizontal && isActive && (
        <motion.div
          layoutId="activeIndicatorMobile"
          className="absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 rounded-full bg-indigo-600 dark:bg-indigo-400"
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
  isMobile = false,
}) => {
  const activities = [
    {
      panel: "chat" as ActivityPanel,
      icon: ChatBubbleLeftRightIcon,
      label: "Chat",
      disabled: false,
    },
    {
      panel: "knowledge" as ActivityPanel,
      icon: FolderIcon, // Using FolderIcon for Knowledge Base
      label: "Knowledge",
      disabled: false,
    },
    {
      panel: "marketplace" as ActivityPanel,
      icon: SparklesIcon,
      label: "Community",
      disabled: false,
    },
  ];

  return (
    <div
      className={`flex bg-white dark:bg-black border-neutral-200 dark:border-neutral-800
        ${
          isMobile
            ? "w-full h-14 flex-row items-center justify-around border-t px-2"
            : "w-16 flex-col items-center space-y-2 border-r py-4"
        }
        ${className}`}
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
          isMobile={isMobile}
        />
      ))}
    </div>
  );
};

export default ActivityBar;

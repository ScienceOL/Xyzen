import {
  ChatBubbleLeftRightIcon,
  EllipsisHorizontalIcon,
  FolderIcon,
  LightBulbIcon,
  SparklesIcon,
  UserCircleIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/animate-ui/components/radix/dropdown-menu";

export type ActivityPanel =
  | "chat"
  | "knowledge"
  | "skills"
  | "marketplace"
  | "memory"
  | "account";

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
  const { t } = useTranslation();

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
      title={
        isDisabled ? `${label} (${t("app.activityBar.comingSoon")})` : label
      }
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

// ── Mobile "More" menu items ────────────────────────────────────────
const MOBILE_MORE: ActivityPanel[] = ["skills", "memory"];

interface MobileMoreButtonProps {
  activePanel: ActivityPanel;
  activities: {
    panel: ActivityPanel;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
  }[];
  onPanelChange: (panel: ActivityPanel) => void;
}

const MobileMoreButton: React.FC<MobileMoreButtonProps> = ({
  activePanel,
  activities,
  onPanelChange,
}) => {
  const { t } = useTranslation();
  const isMoreActive = MOBILE_MORE.includes(activePanel);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <motion.button
          whileTap={{ scale: 0.95 }}
          className={`relative flex h-12 flex-1 flex-col items-center justify-center gap-1 rounded-sm py-1 transition-all duration-200
            ${
              isMoreActive
                ? "text-indigo-600 dark:text-indigo-400"
                : "text-neutral-500 dark:text-neutral-400"
            }`}
        >
          <EllipsisHorizontalIcon className="h-5 w-5" />
          <span className="text-[10px] font-medium leading-none">
            {t("app.activityBar.more")}
          </span>
          {isMoreActive && (
            <motion.div
              layoutId="activeIndicatorMobile"
              className="absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 rounded-full bg-indigo-600 dark:bg-indigo-400"
              initial={false}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          )}
        </motion.button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" side="top" sideOffset={8}>
        {activities.map(({ panel, icon: Icon, label }) => (
          <DropdownMenuItem
            key={panel}
            onClick={() => onPanelChange(panel)}
            className={
              activePanel === panel
                ? "text-indigo-600 dark:text-indigo-400"
                : ""
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const ActivityBar: React.FC<ActivityBarProps> = ({
  activePanel,
  onPanelChange,
  className = "",
  isMobile = false,
}) => {
  const { t } = useTranslation();

  const activities = [
    {
      panel: "chat" as ActivityPanel,
      icon: ChatBubbleLeftRightIcon,
      label: t("app.activityBar.chat"),
      disabled: false,
    },
    {
      panel: "knowledge" as ActivityPanel,
      icon: FolderIcon,
      label: t("app.activityBar.knowledge"),
      disabled: false,
    },
    {
      panel: "skills" as ActivityPanel,
      icon: WrenchScrewdriverIcon,
      label: t("app.activityBar.skills", "Skills"),
      disabled: false,
    },
    {
      panel: "memory" as ActivityPanel,
      icon: LightBulbIcon,
      label: t("app.activityBar.memory"),
      disabled: false,
    },
    {
      panel: "marketplace" as ActivityPanel,
      icon: SparklesIcon,
      label: t("app.activityBar.community"),
      disabled: false,
    },
  ];

  // Desktop: render all buttons
  if (!isMobile) {
    return (
      <div
        className={`flex w-16 flex-col items-center space-y-2 border-r bg-white py-4 dark:bg-black border-neutral-200 dark:border-neutral-800 ${className}`}
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
  }

  // Mobile: Chat | Knowledge | More(↑) | Community | Account
  const moreActivities = activities.filter((a) =>
    MOBILE_MORE.includes(a.panel),
  );

  const mobileTabOrder: {
    panel: ActivityPanel;
    icon: React.ComponentType<{ className?: string }>;
    labelKey: string;
  }[] = [
    {
      panel: "chat",
      icon: ChatBubbleLeftRightIcon,
      labelKey: "app.activityBar.chat",
    },
    {
      panel: "knowledge",
      icon: FolderIcon,
      labelKey: "app.activityBar.knowledge",
    },
  ];

  const mobileTabOrderRight: typeof mobileTabOrder = [
    {
      panel: "marketplace",
      icon: SparklesIcon,
      labelKey: "app.activityBar.community",
    },
    {
      panel: "account",
      icon: UserCircleIcon,
      labelKey: "app.activityBar.account",
    },
  ];

  return (
    <div
      className={`flex w-full h-14 flex-row items-center justify-around border-t px-2 bg-white dark:bg-black border-neutral-200 dark:border-neutral-800 ${className}`}
    >
      {mobileTabOrder.map(({ panel, icon: Icon, labelKey }) => {
        const isActive = activePanel === panel;
        return (
          <motion.button
            key={panel}
            whileTap={{ scale: 0.95 }}
            onClick={() => onPanelChange(panel)}
            className={`relative flex h-12 flex-1 flex-col items-center justify-center gap-1 rounded-sm py-1 transition-all duration-200
              ${isActive ? "text-indigo-600 dark:text-indigo-400" : "text-neutral-500 dark:text-neutral-400"}`}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium leading-none">
              {t(labelKey)}
            </span>
            {isActive && (
              <motion.div
                layoutId="activeIndicatorMobile"
                className="absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 rounded-full bg-indigo-600 dark:bg-indigo-400"
                initial={false}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
          </motion.button>
        );
      })}

      {/* More (dropdown) */}
      <MobileMoreButton
        activePanel={activePanel}
        activities={moreActivities}
        onPanelChange={onPanelChange}
      />

      {mobileTabOrderRight.map(({ panel, icon: Icon, labelKey }) => {
        const isActive = activePanel === panel;
        return (
          <motion.button
            key={panel}
            whileTap={{ scale: 0.95 }}
            onClick={() => onPanelChange(panel)}
            className={`relative flex h-12 flex-1 flex-col items-center justify-center gap-1 rounded-sm py-1 transition-all duration-200
              ${isActive ? "text-indigo-600 dark:text-indigo-400" : "text-neutral-500 dark:text-neutral-400"}`}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium leading-none">
              {t(labelKey)}
            </span>
            {isActive && (
              <motion.div
                layoutId="activeIndicatorMobile"
                className="absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 rounded-full bg-indigo-600 dark:bg-indigo-400"
                initial={false}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
};

export default ActivityBar;

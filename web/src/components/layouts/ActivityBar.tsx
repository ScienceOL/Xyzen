import {
  ChatBubbleLeftRightIcon,
  FolderIcon,
  LightBulbIcon,
  SparklesIcon,
  Squares2X2Icon,
  UserCircleIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

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

// ── Mobile "More" popover items ──────────────────────────────────────
const MOBILE_MORE: ActivityPanel[] = ["skills", "memory"];

interface MobileMorePanelProps {
  isOpen: boolean;
  onClose: () => void;
  activePanel: ActivityPanel;
  activities: {
    panel: ActivityPanel;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
  }[];
  onPanelChange: (panel: ActivityPanel) => void;
}

/**
 * Slide-up grid panel clipped above the activity bar.
 *
 * A permanent `overflow-hidden` clip region sits above the bar. The panel
 * slides from `y: "100%"` (fully below the clip edge = invisible) to `y: 0`
 * (visible). It never travels behind the bar, so no bleed-through artifacts.
 */
const MobileMorePanel: React.FC<MobileMorePanelProps> = ({
  isOpen,
  onClose,
  activePanel,
  activities,
  onPanelChange,
}) => {
  const handleItemClick = useCallback(
    (panel: ActivityPanel) => {
      onPanelChange(panel);
      onClose();
    },
    [onPanelChange, onClose],
  );

  return (
    <>
      {/* Click-catcher — closes panel on outside tap; below bar z-10 */}
      {isOpen && <div className="fixed inset-0" onClick={onClose} />}

      {/* Clip region above the bar */}
      <div className="absolute bottom-full left-0 right-0 overflow-hidden pointer-events-none">
        <AnimatePresence>
          {isOpen && (
            <motion.div
              key="more-panel"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 300 }}
              className="pointer-events-auto bg-white/70 dark:bg-neutral-900/60 backdrop-blur-2xl border-t border-white/40 dark:border-neutral-700/40"
            >
              <div className="grid grid-cols-4 gap-1 px-4 py-3">
                {activities.map(({ panel, icon: Icon, label }) => {
                  const isActive = activePanel === panel;
                  return (
                    <button
                      key={panel}
                      onClick={() => handleItemClick(panel)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl px-2 py-2.5 transition-colors
                        ${
                          isActive
                            ? "bg-indigo-50/80 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
                            : "text-neutral-600 active:bg-white/50 dark:text-neutral-300 dark:active:bg-neutral-700/50"
                        }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-[11px] font-medium">{label}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};

export const ActivityBar: React.FC<ActivityBarProps> = ({
  activePanel,
  onPanelChange,
  className = "",
  isMobile = false,
}) => {
  const { t } = useTranslation();
  const [morePanelOpen, setMorePanelOpen] = useState(false);

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

  // Mobile: Chat | Knowledge | Community | Account | More
  const moreActivities = activities.filter((a) =>
    MOBILE_MORE.includes(a.panel),
  );

  const mobileTabs: {
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

  const isMoreActive = MOBILE_MORE.includes(activePanel);

  return (
    <div
      className="relative bg-white/50 dark:bg-black/40 backdrop-blur-2xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <MobileMorePanel
        isOpen={morePanelOpen}
        onClose={() => setMorePanelOpen(false)}
        activePanel={activePanel}
        activities={moreActivities}
        onPanelChange={onPanelChange}
      />

      {/* Tab bar */}
      <div
        className={`relative z-10 flex w-full h-14 flex-row items-center justify-around px-2 ${className}`}
      >
        {mobileTabs.map(({ panel, icon: Icon, labelKey }) => {
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

        {/* More button (rightmost) */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setMorePanelOpen((prev) => !prev)}
          className={`relative flex h-12 flex-1 flex-col items-center justify-center gap-1 rounded-sm py-1 transition-all duration-200
            ${
              isMoreActive || morePanelOpen
                ? "text-indigo-600 dark:text-indigo-400"
                : "text-neutral-500 dark:text-neutral-400"
            }`}
        >
          <Squares2X2Icon className="h-5 w-5" />
          <span className="text-[10px] font-medium leading-none">
            {t("app.activityBar.more")}
          </span>
          {isMoreActive && !morePanelOpen && (
            <motion.div
              layoutId="activeIndicatorMobile"
              className="absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 rounded-full bg-indigo-600 dark:bg-indigo-400"
              initial={false}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          )}
        </motion.button>
      </div>
    </div>
  );
};

export default ActivityBar;

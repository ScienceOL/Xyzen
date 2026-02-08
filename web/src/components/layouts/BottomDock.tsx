"use client";

import { useAuth } from "@/hooks/useAuth";
import { useVersion } from "@/hooks/useVersion";
import { cn } from "@/lib/utils";
import { useXyzen } from "@/store";
import {
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  FolderIcon,
  SparklesIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { Github, Globe } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/animate-ui/components/radix/dropdown-menu";
import { PointsInfoModal } from "@/components/features/PointsInfoModal";
import { TokenInputModal } from "@/components/features/TokenInputModal";
import { CheckInModal } from "@/components/modals/CheckInModal";
import { logout } from "@/core/auth";
import { useUserWallet } from "@/hooks/useUserWallet";
import {
  ArrowRightOnRectangleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { GradientButton } from "@/components/ui/gradient-button";

// Dock height constant - use this for bottom margin calculations in other components
export const DOCK_HEIGHT = 64;
export const DOCK_SAFE_AREA = 80;
// Horizontal margin for dock and other full-width elements
export const DOCK_HORIZONTAL_MARGIN = 8;

export type ActivityPanel = "chat" | "knowledge" | "marketplace";

interface BottomDockProps {
  activePanel: ActivityPanel;
  onPanelChange: (panel: ActivityPanel) => void;
  className?: string;
}

// Dock item configuration
interface DockItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  panel?: ActivityPanel;
  onClick?: () => void;
}

// Individual dock icon with magnification effect
function DockIcon({
  mouseX,
  item,
  isActive,
  onClick,
}: {
  mouseX: MotionValue<number>;
  item: DockItem;
  isActive?: boolean;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);

  const distance = useTransform(mouseX, (val) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  // Magnification transforms
  const sizeTransform = useTransform(distance, [-100, 0, 100], [44, 56, 44]);
  const iconSizeTransform = useTransform(
    distance,
    [-100, 0, 100],
    [20, 26, 20],
  );
  const yTransform = useTransform(distance, [-100, 0, 100], [0, -6, 0]);

  const size = useSpring(sizeTransform, {
    mass: 0.1,
    stiffness: 200,
    damping: 15,
  });
  const iconSize = useSpring(iconSizeTransform, {
    mass: 0.1,
    stiffness: 200,
    damping: 15,
  });
  const y = useSpring(yTransform, {
    mass: 0.1,
    stiffness: 200,
    damping: 15,
  });

  const Icon = item.icon;

  return (
    <motion.button
      ref={ref}
      style={{ width: size, height: size, y }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "relative flex flex-col items-center justify-center gap-0.5 rounded-sm transition-colors duration-200",
        "bg-white/60 dark:bg-neutral-800/60",
        "hover:bg-white/90 dark:hover:bg-neutral-700/80",
        "border border-white/20 dark:border-neutral-700/30",
        isActive && "bg-white/90 dark:bg-neutral-700/80 shadow-md",
      )}
    >
      {/* Tooltip */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900"
          >
            {item.label}
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900 dark:border-t-neutral-100" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Icon */}
      <motion.div
        style={{ width: iconSize, height: iconSize }}
        className="flex items-center justify-center"
      >
        <Icon
          className={cn(
            "w-full h-full transition-colors duration-200",
            isActive
              ? "text-indigo-600 dark:text-indigo-400"
              : "text-neutral-600 dark:text-neutral-400",
          )}
        />
      </motion.div>

      {/* Active indicator dot - inside button, below icon */}
      {isActive && (
        <motion.div
          layoutId="dock-active-indicator"
          className="h-1 w-1 rounded-full bg-indigo-500"
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      )}
    </motion.button>
  );
}

// User avatar component with dropdown
function UserAvatar({ compact = false }: { compact?: boolean }) {
  const auth = useAuth();
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [showPointsInfo, setShowPointsInfo] = useState(false);
  const { openSettingsModal } = useXyzen();

  const isAuthedForUi = auth.isAuthenticated || !!auth.token;
  const walletQuery = useUserWallet(auth.token, isAuthedForUi);

  const avatarSize = compact ? "h-10 w-10" : "h-11 w-11";

  if (auth.isLoading) {
    return (
      <div
        className={cn(
          avatarSize,
          "flex items-center justify-center rounded-full bg-white/60 dark:bg-neutral-800/60",
        )}
      >
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-indigo-600 dark:border-neutral-700 dark:border-t-indigo-500" />
      </div>
    );
  }

  if (isAuthedForUi) {
    return (
      <>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={cn(
                avatarSize,
                "relative flex items-center justify-center rounded-full overflow-hidden transition-shadow hover:shadow-lg",
                "ring-2 ring-white/50 dark:ring-neutral-700/50",
              )}
            >
              {auth.user?.avatar ? (
                <img
                  src={auth.user.avatar}
                  alt={auth.user?.username ?? "User"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600">
                  <UserIcon className="h-5 w-5 text-white" />
                </div>
              )}
            </motion.button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="start"
            side="top"
            sideOffset={12}
            className="w-72 mb-2"
          >
            <DropdownMenuLabel className="flex items-center gap-3 p-3">
              {auth.user?.avatar ? (
                <img
                  src={auth.user.avatar}
                  alt={auth.user?.username ?? "User"}
                  className="h-10 w-10 rounded-full"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600">
                  <UserIcon className="h-5 w-5 text-white" />
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {auth.user?.username ?? t("app.authStatus.loggedIn")}
                </span>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            {/* Points Display */}
            <div className="px-3 py-2">
              <div className="flex items-center justify-between rounded-lg bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 px-3 py-2">
                <div className="flex items-center gap-2">
                  <SparklesIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  <div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">
                      {t("app.authStatus.pointsBalance")}
                    </div>
                    <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                      {walletQuery.isLoading
                        ? "..."
                        : (walletQuery.data?.virtual_balance ?? "--")}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setShowPointsInfo(true);
                  }}
                  className="rounded-full p-1.5 text-neutral-400 hover:bg-white/50 hover:text-indigo-600 dark:hover:bg-neutral-800 dark:hover:text-indigo-400 transition-colors"
                >
                  <InformationCircleIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onSelect={() => {
                setMenuOpen(false);
                openSettingsModal();
              }}
              className="flex items-center gap-2 px-3 py-2 cursor-pointer"
            >
              <Cog6ToothIcon className="h-4 w-4" />
              {t("app.authStatus.settings")}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onSelect={() => {
                setMenuOpen(false);
                logout();
              }}
              className="flex items-center gap-2 px-3 py-2 cursor-pointer text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20"
            >
              <ArrowRightOnRectangleIcon className="h-4 w-4" />
              {t("app.authStatus.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <PointsInfoModal
          isOpen={showPointsInfo}
          onClose={() => setShowPointsInfo(false)}
        />
      </>
    );
  }

  // Not authenticated
  return (
    <>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setShowTokenModal(true)}
        className={cn(
          avatarSize,
          "flex items-center justify-center rounded-full bg-white/60 dark:bg-neutral-800/60 border border-amber-200/50 dark:border-amber-700/50 transition-shadow hover:shadow-lg",
        )}
        title={t("app.authStatus.unauthorized")}
      >
        <ExclamationTriangleIcon className="h-5 w-5 text-amber-500" />
      </motion.button>

      <TokenInputModal
        isOpen={showTokenModal}
        onClose={() => setShowTokenModal(false)}
        onSubmit={async (token) => {
          await auth.login(token);
        }}
      />
    </>
  );
}

// Version info component (GitHub + Version + Region)
const GITHUB_REPO = "https://github.com/ScienceOL/Xyzen";
const BETA_SURVEY_URL =
  "https://sii-czxy.feishu.cn/share/base/form/shrcnYu8Y3GNgI7M14En1xJ7rMb";

function VersionInfo() {
  const { backend } = useVersion();
  const [hovered, setHovered] = useState(false);

  // Current region - hardcoded as international for now
  const isInternational = true;

  return (
    <div className="relative flex items-center gap-1.5">
      {/* Beta Survey Button */}
      <GradientButton href={BETA_SURVEY_URL}>加入内测</GradientButton>

      {/* GitHub Link */}
      <a
        href={GITHUB_REPO}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center h-7 w-7 rounded-md transition-colors hover:bg-white/50 dark:hover:bg-neutral-700/50"
      >
        <Github className="h-4 w-4 text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors" />
      </a>

      {/* Version + Region */}
      <div
        className="relative flex items-center gap-1 cursor-default"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Version Number */}
        <span className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500 tabular-nums">
          {backend.version || "..."}
        </span>

        {/* Region Indicator - subtle globe icon */}
        <div
          className="flex items-center justify-center h-4 w-4 rounded-sm"
          title={isInternational ? "International" : "China Mainland"}
        >
          <Globe
            className={cn(
              "h-3 w-3 transition-colors",
              isInternational
                ? "text-indigo-400/60 dark:text-indigo-500/60"
                : "text-emerald-400/60 dark:text-emerald-500/60",
            )}
          />
        </div>

        {/* Tooltip on hover */}
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-neutral-900 px-3 py-1.5 text-xs text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {isInternational ? "International" : "China"}
                </span>
                <span className="text-neutral-400 dark:text-neutral-500">
                  •
                </span>
                <span className="text-neutral-300 dark:text-neutral-600">
                  {backend.versionName || backend.version}
                </span>
              </div>
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900 dark:border-t-neutral-100" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Status bar item (right side)
function StatusBarItem({
  icon: Icon,
  label,
  onClick,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  className?: string;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div className="relative">
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors",
          "bg-white/40 dark:bg-neutral-800/40",
          "hover:bg-white/70 dark:hover:bg-neutral-700/60",
          "border border-white/20 dark:border-neutral-700/30",
          "text-sm font-medium",
          className,
        )}
      >
        <Icon className="h-4 w-4" />
        <span className="hidden sm:inline">{label}</span>
      </motion.button>

      {/* Tooltip for mobile */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900 sm:hidden"
          >
            {label}
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900 dark:border-t-neutral-100" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Main Dock container
export function BottomDock({
  activePanel,
  onPanelChange,
  className,
}: BottomDockProps) {
  const { t } = useTranslation();
  const { openSettingsModal } = useXyzen();
  const auth = useAuth();
  const mouseX = useMotionValue(Infinity);
  const [showCheckInModal, setShowCheckInModal] = useState(false);

  const isAuthedForUi = auth.isAuthenticated || !!auth.token;

  const dockItems: DockItem[] = [
    {
      id: "chat",
      icon: ChatBubbleLeftRightIcon,
      label: t("app.activityBar.chat"),
      panel: "chat",
    },
    {
      id: "knowledge",
      icon: FolderIcon,
      label: t("app.activityBar.knowledge"),
      panel: "knowledge",
    },
    {
      id: "marketplace",
      icon: SparklesIcon,
      label: t("app.activityBar.community"),
      panel: "marketplace",
    },
  ];

  const handleItemClick = useCallback(
    (item: DockItem) => {
      if (item.panel) {
        onPanelChange(item.panel);
      }
      item.onClick?.();
    },
    [onPanelChange],
  );

  return (
    <>
      <div
        className={cn("fixed bottom-0 left-0 right-0 z-50 pb-2", className)}
        style={{
          paddingLeft: DOCK_HORIZONTAL_MARGIN,
          paddingRight: DOCK_HORIZONTAL_MARGIN,
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className={cn(
            "w-full",
            "bg-white/60 dark:bg-neutral-900/60",
            "backdrop-blur-2xl",
            "border border-white/30 dark:border-neutral-700/50",
            "rounded-2xl",
          )}
          style={{
            boxShadow:
              "0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
          }}
        >
          <div className="flex items-center justify-between h-14 px-4">
            {/* Left Section: Avatar + Navigation */}
            <div className="flex items-center gap-3">
              {/* User Avatar */}
              <UserAvatar compact />

              {/* Divider */}
              <div className="h-8 w-px bg-neutral-300/50 dark:bg-neutral-600/30" />

              {/* Navigation Tabs */}
              <div
                className="flex items-end gap-1.5"
                onMouseMove={(e) => mouseX.set(e.pageX)}
                onMouseLeave={() => mouseX.set(Infinity)}
              >
                {dockItems.map((item) => (
                  <DockIcon
                    key={item.id}
                    mouseX={mouseX}
                    item={item}
                    isActive={item.panel === activePanel}
                    onClick={() => handleItemClick(item)}
                  />
                ))}
              </div>
            </div>

            {/* Right Section: Status Bar */}
            <div className="flex items-center gap-2">
              {/* Version Info - GitHub + Version + Region */}
              <VersionInfo />

              {/* Divider */}
              <div className="h-6 w-px bg-neutral-300/50 dark:bg-neutral-600/30" />

              {/* Check-in Button (only for authenticated users) */}
              {isAuthedForUi && (
                <StatusBarItem
                  icon={CalendarDaysIcon}
                  label="签到"
                  onClick={() => setShowCheckInModal(true)}
                  className="text-amber-700 dark:text-amber-400"
                />
              )}

              {/* Divider */}
              <div className="h-6 w-px bg-neutral-300/50 dark:bg-neutral-600/30" />

              {/* Settings */}
              <motion.button
                whileHover={{ scale: 1.05, rotate: 30 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => openSettingsModal()}
                className={cn(
                  "flex items-center justify-center h-9 w-9 rounded-lg transition-colors",
                  "bg-white/40 dark:bg-neutral-800/40",
                  "hover:bg-white/70 dark:hover:bg-neutral-700/60",
                  "border border-white/20 dark:border-neutral-700/30",
                )}
              >
                <Cog6ToothIcon className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Check-in Modal */}
      <CheckInModal
        isOpen={showCheckInModal}
        onClose={() => setShowCheckInModal(false)}
      />
    </>
  );
}

export default BottomDock;

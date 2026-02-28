"use client";

import { useAuth } from "@/hooks/useAuth";
import { useBilling, useCheckIn, useSubscriptionInfo } from "@/hooks/ee";
import { useVersion } from "@/hooks/useVersion";
import { cn } from "@/lib/utils";
import { useXyzen } from "@/store";
import {
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  ComputerDesktopIcon,
  FolderIcon,
  LightBulbIcon,
  SparklesIcon,
  UserIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { Crown, Gem, Github, Globe, Shield, User } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/animate-ui/components/radix/dropdown-menu";
import { CreatorModal } from "@/components/features/CreatorTab";
import { PointsInfoModal } from "@/components/features/PointsInfoModal";
import { TokenInputModal } from "@/components/features/TokenInputModal";
import { CheckInModal } from "@/components/modals/CheckInModal";
import { logout } from "@/core/auth";
import {
  ArrowRightOnRectangleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { GradientButton } from "@/components/ui/gradient-button";
import { NotificationCenter } from "@/components/features/NotificationCenter";

// Dock height constant - use this for bottom margin calculations in other components
export const DOCK_HEIGHT = 64;
export const DOCK_SAFE_AREA = 80;
// Horizontal margin for dock and other full-width elements
export const DOCK_HORIZONTAL_MARGIN = 8;

export type ActivityPanel =
  | "chat"
  | "knowledge"
  | "skills"
  | "marketplace"
  | "memory"
  | "sandbox"
  | "runner"
  | "tasks"
  | "account";

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
  const [showCreator, setShowCreator] = useState(false);
  const openSettingsModal = useXyzen((s) => s.openSettingsModal);

  const billing = useBilling();
  const isAuthedForUi = auth.isAuthenticated || !!auth.token;

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
            {billing && (
              <div className="px-3 py-2">
                <div className="flex items-center justify-between rounded-lg bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <SparklesIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    <div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        {t("app.authStatus.pointsBalance")}
                      </div>
                      <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                        {billing.isLoading ? "..." : (billing.points ?? "--")}
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
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onSelect={() => {
                setMenuOpen(false);
                setShowCreator(true);
              }}
              className="flex items-center gap-2 px-3 py-2 cursor-pointer"
            >
              <UserGroupIcon className="h-4 w-4" />
              {t("subscription.creator")}
            </DropdownMenuItem>

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

        {billing && (
          <PointsInfoModal
            isOpen={showPointsInfo}
            onClose={() => setShowPointsInfo(false)}
          />
        )}
        <CreatorModal
          isOpen={showCreator}
          onClose={() => setShowCreator(false)}
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

// Subscription tier badge styles
const TIER_STYLES: Record<
  string,
  {
    bg: string;
    text: string;
    border: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  }
> = {
  free: {
    bg: "bg-neutral-100/80 dark:bg-neutral-800/80",
    text: "text-neutral-600 dark:text-neutral-400",
    border: "border-neutral-200/50 dark:border-neutral-700/50",
    icon: User,
  },
  standard: {
    bg: "bg-blue-50/80 dark:bg-blue-950/40",
    text: "text-blue-600 dark:text-blue-400",
    border: "border-blue-200/50 dark:border-blue-800/50",
    icon: Shield,
  },
  professional: {
    bg: "bg-purple-50/80 dark:bg-purple-950/40",
    text: "text-purple-600 dark:text-purple-400",
    border: "border-purple-200/50 dark:border-purple-800/50",
    icon: Gem,
  },
  ultra: {
    bg: "bg-amber-50/80 dark:bg-amber-950/40",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-200/50 dark:border-amber-800/50",
    icon: Crown,
  },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

import { type UsageResponse } from "@/service/subscriptionService";

// Subscription tooltip — rendered via portal to escape dock's backdrop-filter
function SubscriptionTooltip({
  visible,
  anchorRef,
  usage,
  daysLeft,
  roleName,
  isExpired,
  isUrgent,
  isWarning,
  respondingCount,
  chatLimit,
  hasOverQuota,
}: {
  visible: boolean;
  anchorRef: React.RefObject<HTMLDivElement | null>;
  usage: UsageResponse | null;
  daysLeft: number | null;
  roleName: string;
  isExpired: boolean;
  isUrgent: boolean;
  isWarning: boolean;
  respondingCount: number;
  chatLimit: number;
  hasOverQuota: boolean;
}) {
  const rect = anchorRef.current?.getBoundingClientRect();
  const show = visible && usage && rect;

  return createPortal(
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.95 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          style={{
            position: "fixed",
            bottom: window.innerHeight - rect.top + 8,
            right: window.innerWidth - rect.right,
          }}
          className="z-[60]"
        >
          <div
            className={cn(
              "relative flex flex-col gap-1.5 min-w-[180px] rounded-2xl px-4 py-3 text-xs shadow-2xl",
              "bg-white/60 text-neutral-900 backdrop-blur-lg",
              "border border-white/30",
              "dark:bg-white/5 dark:text-white",
              "dark:border-white/[0.08]",
            )}
          >
            <div className="flex flex-col gap-1.5">
              {/* Expiry row with progress bar (paid plans only) */}
              {daysLeft !== null && roleName !== "free" && (
                <div className="flex flex-col gap-1 pb-1.5 mb-0.5 border-b border-neutral-200/40 dark:border-neutral-700/40">
                  <div className="flex justify-between gap-4">
                    <span className="text-neutral-500 dark:text-neutral-400">
                      Expires
                    </span>
                    <span
                      className={cn(
                        isExpired && "text-red-500 dark:text-red-400",
                        isUrgent && "text-red-500 dark:text-red-400",
                        isWarning && "text-amber-500 dark:text-amber-400",
                      )}
                    >
                      {isExpired
                        ? "Expired"
                        : daysLeft === 0
                          ? "Today"
                          : `${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
                    </span>
                  </div>
                  {!isExpired && (
                    <div className="h-1 rounded-full bg-neutral-200 dark:bg-neutral-700/50 overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          isUrgent && "bg-red-500",
                          isWarning && "bg-amber-500",
                          !isUrgent && !isWarning && "bg-emerald-500",
                        )}
                        style={{
                          width: `${Math.min(100, Math.max(2, (daysLeft / 30) * 100))}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Storage */}
              <div className="flex justify-between gap-4">
                <span className="text-neutral-500 dark:text-neutral-400">
                  Storage
                </span>
                <span className="font-medium">
                  {formatBytes(usage.storage.used_bytes)} /{" "}
                  {formatBytes(usage.storage.limit_bytes)}
                </span>
              </div>

              {/* Active chats (only when responding) */}
              {respondingCount > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-500 dark:text-neutral-400">
                    Chats
                  </span>
                  <span className="font-medium">
                    {respondingCount} / {chatLimit || "\u221E"}
                  </span>
                </div>
              )}

              {/* Sandboxes (only when limit > 0) */}
              {usage.sandboxes.limit > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-500 dark:text-neutral-400">
                    Sandboxes
                  </span>
                  <span className="font-medium">
                    {usage.sandboxes.used} / {usage.sandboxes.limit}
                  </span>
                </div>
              )}

              {/* Scheduled Tasks (only when limit > 0) */}
              {usage.scheduled_tasks?.limit > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-500 dark:text-neutral-400">
                    Tasks
                  </span>
                  <span className="font-medium">
                    {usage.scheduled_tasks.used} / {usage.scheduled_tasks.limit}
                  </span>
                </div>
              )}

              {/* Files */}
              <div className="flex justify-between gap-4">
                <span className="text-neutral-500 dark:text-neutral-400">
                  Files
                </span>
                <span className="font-medium">
                  {usage.files.used} / {usage.files.limit}
                </span>
              </div>

              {hasOverQuota && (
                <div className="text-red-500 dark:text-red-400 text-[10px] mt-0.5 font-semibold">
                  Quota exceeded
                </div>
              )}
            </div>
          </div>
          {/* Arrow indicator */}
          <div className="absolute -bottom-[5px] right-4 h-2.5 w-2.5 rotate-45 bg-white/60 dark:bg-white/5 backdrop-blur-lg border-b border-r border-white/30 dark:border-white/[0.06]" />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function SubscriptionBadge() {
  const { t } = useTranslation();
  const subInfo = useSubscriptionInfo();
  const billing = useBilling();
  const respondingCount = useXyzen((s) => s.respondingChannelIds.size);
  const [showPointsInfo, setShowPointsInfo] = useState(false);
  const [hovered, setHovered] = useState(false);
  const badgeRef = useRef<HTMLDivElement>(null);

  if (!subInfo || subInfo.subQuery.isLoading) {
    return null;
  }

  const { subQuery, usageQuery, roleName } = subInfo;
  const displayName = t(`subscription.plan.${roleName}`);
  const expiresAt = subQuery.data?.subscription?.expires_at;
  const canClaimCredits = subQuery.data?.can_claim_credits ?? false;
  const style = TIER_STYLES[roleName] ?? TIER_STYLES.free;

  const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false;
  const daysLeft = expiresAt
    ? Math.max(
        0,
        Math.ceil(
          (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        ),
      )
    : null;

  // Expiry urgency tiers
  const isUrgent = daysLeft !== null && daysLeft <= 3 && !isExpired;
  const isWarning =
    daysLeft !== null && daysLeft <= 7 && !isUrgent && !isExpired;

  const usage = usageQuery.data;
  const chatLimit = usage?.chats.limit ?? 0;
  const hasOverQuota =
    usage &&
    ((chatLimit > 0 && respondingCount > chatLimit) ||
      usage.storage.usage_percentage > 100);

  const TierIcon = style.icon;

  return (
    <>
      <div className="relative" ref={badgeRef}>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowPointsInfo(true)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors border text-xs font-medium",
            style.bg,
            style.text,
            style.border,
            isExpired && "opacity-60",
            hasOverQuota && "ring-1 ring-red-400/50",
          )}
        >
          <TierIcon className="size-3.5" />
          <span>{displayName}</span>
          {isExpired && (
            <span className="text-[10px] text-red-500 dark:text-red-400 font-semibold">
              expired
            </span>
          )}
          {/* Red dot for claimable credits */}
          {canClaimCredits && !isExpired && (
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
          )}
        </motion.button>
      </div>

      {/* Tooltip via portal — escapes dock's backdrop-filter context */}
      <SubscriptionTooltip
        visible={hovered && !!usage}
        anchorRef={badgeRef}
        usage={usage ?? null}
        daysLeft={daysLeft}
        roleName={roleName}
        isExpired={isExpired}
        isUrgent={isUrgent}
        isWarning={isWarning}
        respondingCount={respondingCount}
        chatLimit={chatLimit}
        hasOverQuota={!!hasOverQuota}
      />

      {billing && (
        <PointsInfoModal
          isOpen={showPointsInfo}
          onClose={() => setShowPointsInfo(false)}
        />
      )}
    </>
  );
}

// Main Dock container
export function BottomDock({
  activePanel,
  onPanelChange,
  className,
}: BottomDockProps) {
  const { t } = useTranslation();
  const auth = useAuth();
  const mouseX = useMotionValue(Infinity);
  const checkIn = useCheckIn();
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
      id: "skills",
      icon: WrenchScrewdriverIcon,
      label: t("app.activityBar.skills", "Skills"),
      panel: "skills",
    },
    {
      id: "memory",
      icon: LightBulbIcon,
      label: t("app.activityBar.memory"),
      panel: "memory",
    },
    {
      id: "sandbox",
      icon: CommandLineIcon,
      label: t("app.activityBar.sandbox", "Sandbox"),
      panel: "sandbox",
    },
    {
      id: "runner",
      icon: ComputerDesktopIcon,
      label: t("app.activityBar.runner"),
      panel: "runner",
    },
    {
      id: "tasks",
      icon: ClockIcon,
      label: t("app.activityBar.tasks", "Tasks"),
      panel: "tasks",
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

              {/* Check-in Button (only for authenticated users with checkIn feature) */}
              {checkIn && isAuthedForUi && (
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowCheckInModal(true)}
                  className="relative flex items-center justify-center h-8 w-8 rounded-lg text-amber-600 transition-colors hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
                  title={t("app.toolbar.checkIn")}
                >
                  {checkIn.showDot && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                    </span>
                  )}
                  <CalendarDaysIcon className="h-5 w-5" />
                </motion.button>
              )}

              {/* Divider */}
              <div className="h-6 w-px bg-neutral-300/50 dark:bg-neutral-600/30" />

              {/* Subscription Badge */}
              <SubscriptionBadge />

              {/* Notification Center (rightmost) */}
              <NotificationCenter />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Check-in Modal */}
      {checkIn && (
        <CheckInModal
          isOpen={showCheckInModal}
          onClose={() => setShowCheckInModal(false)}
        />
      )}
    </>
  );
}

export default BottomDock;

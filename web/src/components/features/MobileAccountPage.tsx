import {
  ArrowRightOnRectangleIcon,
  CalendarDaysIcon,
  ChevronRightIcon,
  Cog6ToothIcon,
  GiftIcon,
  GlobeAltIcon,
  InformationCircleIcon,
  SparklesIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { CreatorModal } from "@/components/features/CreatorTab";
import { NotificationCenter } from "@/components/features/NotificationCenter";
import { PointsInfoModal } from "@/components/features/PointsInfoModal";
import { CheckInModal } from "@/components/modals/CheckInModal";
import { useAuth } from "@/hooks/useAuth";
import { useBilling, useCheckIn, useSubscriptionInfo } from "@/hooks/ee";
import { checkInService } from "@/service/checkinService";
import { useXyzen } from "@/store";
import { useVersion } from "@/hooks/useVersion";

export default function MobileAccountPage() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const openSettingsModal = useXyzen((s) => s.openSettingsModal);
  const { frontend, backend } = useVersion();

  const subInfo = useSubscriptionInfo();
  const subscription = subInfo?.subQuery.data;
  const usage = subInfo?.usageQuery.data;
  const billing = useBilling();
  const checkIn = useCheckIn();
  const checkInStatus = checkIn?.query.data;

  const queryClient = useQueryClient();

  const [checkingIn, setCheckingIn] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showPointsInfo, setShowPointsInfo] = useState(false);
  const [showCreator, setShowCreator] = useState(false);

  const handleCheckIn = async () => {
    if (checkingIn || checkInStatus?.checked_in_today) return;
    setCheckingIn(true);
    try {
      await checkInService.checkIn();
      await queryClient.invalidateQueries({ queryKey: ["check-in"] });
      await queryClient.invalidateQueries({ queryKey: ["userWallet"] });
    } finally {
      setCheckingIn(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-neutral-100 dark:bg-neutral-950">
      <div className="mx-auto max-w-lg px-4 py-6 space-y-6">
        {/* ── Profile Header ── */}
        <div className="flex items-center gap-4 rounded-xl bg-white p-4 dark:bg-neutral-900">
          <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={user.username}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-neutral-400 dark:text-neutral-500">
                {user?.username?.charAt(0)?.toUpperCase() ?? "?"}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {user?.username ?? "—"}
            </h2>
            {subscription?.role && (
              <span className="mt-0.5 inline-block rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                {subscription.role.display_name}
              </span>
            )}
          </div>
          <NotificationCenter />
        </div>

        {/* ── Check-in & Credits group ── */}
        <div className="overflow-hidden rounded-xl bg-white dark:bg-neutral-900">
          {/* Check-in row */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setShowCheckInModal(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setShowCheckInModal(true);
            }}
            className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-neutral-50 dark:active:bg-neutral-800 cursor-pointer"
          >
            <CalendarDaysIcon className="h-5 w-5 flex-shrink-0 text-orange-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-neutral-900 dark:text-neutral-100">
                {t("app.account.checkIn")}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {checkInStatus
                  ? t("app.account.streak", {
                      days: checkInStatus.consecutive_days,
                    })
                  : "—"}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCheckIn();
              }}
              disabled={checkingIn || checkInStatus?.checked_in_today}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                checkInStatus?.checked_in_today
                  ? "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500"
                  : "bg-orange-500 text-white active:bg-orange-600"
              }`}
            >
              {checkingIn
                ? "..."
                : checkInStatus?.checked_in_today
                  ? t("app.account.checkedIn")
                  : t("app.account.checkInAction")}
            </button>
          </div>

          <div className="ml-12 border-t border-neutral-100 dark:border-neutral-800" />

          {/* Credits row */}
          <button
            onClick={() => setShowPointsInfo(true)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-neutral-50 dark:active:bg-neutral-800"
          >
            <SparklesIcon className="h-5 w-5 flex-shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-neutral-900 dark:text-neutral-100">
                {t("app.account.credits")}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {billing
                  ? t("app.account.balance", {
                      amount: (billing.points ?? 0).toLocaleString(),
                    })
                  : "—"}
              </p>
            </div>
            <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-neutral-400 dark:text-neutral-500" />
          </button>

          <div className="ml-12 border-t border-neutral-100 dark:border-neutral-800" />

          {/* Creator row */}
          <button
            onClick={() => setShowCreator(true)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-neutral-50 dark:active:bg-neutral-800"
          >
            <UserGroupIcon className="h-5 w-5 flex-shrink-0 text-purple-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-neutral-900 dark:text-neutral-100">
                {t("subscription.creator")}
              </p>
            </div>
            <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-neutral-400 dark:text-neutral-500" />
          </button>
        </div>

        {/* ── Usage group ── */}
        {usage && (
          <div className="overflow-hidden rounded-xl bg-white p-4 dark:bg-neutral-900 space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              {t("app.account.usage")}
            </h3>
            <UsageBar
              label={t("app.account.storage")}
              used={formatBytes(usage.storage.used_bytes)}
              limit={formatBytes(usage.storage.limit_bytes)}
              percent={usage.storage.usage_percentage}
            />
            <UsageBar
              label={t("app.account.files")}
              used={String(usage.files.used)}
              limit={String(usage.files.limit)}
              percent={
                usage.files.limit > 0
                  ? (usage.files.used / usage.files.limit) * 100
                  : 0
              }
            />
            <UsageBar
              label={t("app.account.parallelChats")}
              used={String(usage.chats.used)}
              limit={String(usage.chats.limit)}
              percent={
                usage.chats.limit > 0
                  ? (usage.chats.used / usage.chats.limit) * 100
                  : 0
              }
            />
            {usage.sandboxes.limit > 0 && (
              <UsageBar
                label={t("subscription.sub.sandboxes")}
                used={String(usage.sandboxes.used)}
                limit={String(usage.sandboxes.limit)}
                percent={
                  usage.sandboxes.limit > 0
                    ? (usage.sandboxes.used / usage.sandboxes.limit) * 100
                    : 0
                }
              />
            )}
          </div>
        )}

        {/* ── Settings group (iOS-style vertical list) ── */}
        <div className="overflow-hidden rounded-xl bg-white dark:bg-neutral-900">
          <SettingsRow
            icon={Cog6ToothIcon}
            label={t("app.account.settings")}
            onClick={() => openSettingsModal()}
          />
          <SettingsRow
            icon={GiftIcon}
            label={t("app.account.redeem")}
            onClick={() => openSettingsModal("redemption")}
          />
          <SettingsRow
            icon={GlobeAltIcon}
            label={t("app.account.region")}
            onClick={() => openSettingsModal("region")}
          />
          <SettingsRow
            icon={InformationCircleIcon}
            label={t("app.account.about")}
            onClick={() => openSettingsModal("about")}
            isLast
          />
        </div>

        {/* ── Logout ── */}
        <div className="overflow-hidden rounded-xl bg-white dark:bg-neutral-900">
          <button
            onClick={logout}
            className="flex w-full items-center justify-center py-3 text-sm font-medium text-red-600 active:bg-neutral-50 dark:text-red-400 dark:active:bg-neutral-800"
          >
            <ArrowRightOnRectangleIcon className="mr-2 h-5 w-5" />
            {t("app.authStatus.logout")}
          </button>
        </div>

        {/* ── Version ── */}
        <p className="pb-2 text-center text-xs text-neutral-400 dark:text-neutral-600">
          {backend.isLoaded ? backend.versionName : "Xyzen"} v{frontend.version}
        </p>
      </div>

      {/* Modals */}
      <CheckInModal
        isOpen={showCheckInModal}
        onClose={() => setShowCheckInModal(false)}
      />
      <PointsInfoModal
        isOpen={showPointsInfo}
        onClose={() => setShowPointsInfo(false)}
      />
      <CreatorModal
        isOpen={showCreator}
        onClose={() => setShowCreator(false)}
      />
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function SettingsRow({
  icon: Icon,
  label,
  onClick,
  isLast = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  isLast?: boolean;
}) {
  return (
    <>
      <button
        onClick={onClick}
        className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-neutral-50 dark:active:bg-neutral-800"
      >
        <Icon className="h-5 w-5 flex-shrink-0 text-neutral-500 dark:text-neutral-400" />
        <span className="flex-1 text-sm text-neutral-900 dark:text-neutral-100">
          {label}
        </span>
        <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-neutral-400 dark:text-neutral-500" />
      </button>
      {!isLast && (
        <div className="ml-12 border-t border-neutral-100 dark:border-neutral-800" />
      )}
    </>
  );
}

function UsageBar({
  label,
  used,
  limit,
  percent,
}: {
  label: string;
  used: string;
  limit: string;
  percent: number;
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400">
        <span>{label}</span>
        <span>
          {used} / {limit}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
        <div
          className={`h-full rounded-full transition-all ${
            clamped > 90
              ? "bg-red-500"
              : clamped > 70
                ? "bg-amber-500"
                : "bg-indigo-500"
          }`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

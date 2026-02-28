import {
  useDeveloperWallet,
  useDeveloperEarningsSummary,
  useRewardRates,
  useWithdrawEarnings,
} from "@/hooks/useDeveloper";
import { useMyMarketplaceListings } from "@/hooks/useMarketplace";
import { SheetModal } from "@/components/animate-ui/components/animate/sheet-modal";
import { cn } from "@/lib/utils";
import {
  ArrowPathIcon,
  BanknotesIcon,
  EyeIcon,
  HeartIcon,
  LockClosedIcon,
  LockOpenIcon,
  RocketLaunchIcon,
  SparklesIcon,
  StarIcon,
  TrophyIcon,
} from "@heroicons/react/24/outline";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

// ---------- Achievement definitions ----------

interface AchievementDef {
  id: string;
  nameKey: string;
  descKey: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  color: string;
  bgColor: string;
  check: (ctx: AchievementCtx) => boolean;
  progress?: (ctx: AchievementCtx) => { current: number; target: number };
}

interface AchievementCtx {
  listingsCount: number;
  totalEarned: number;
  totalLikes: number;
  totalForks: number;
  totalViews: number;
}

const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first_publish",
    nameKey: "subscription.creatorTab.achievements.firstPublish",
    descKey: "subscription.creatorTab.achievements.firstPublishDesc",
    icon: RocketLaunchIcon,
    color: "text-indigo-500",
    bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
    check: (ctx) => ctx.listingsCount >= 1,
    progress: (ctx) => ({ current: Math.min(ctx.listingsCount, 1), target: 1 }),
  },
  {
    id: "five_agents",
    nameKey: "subscription.creatorTab.achievements.fiveAgents",
    descKey: "subscription.creatorTab.achievements.fiveAgentsDesc",
    icon: SparklesIcon,
    color: "text-purple-500",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
    check: (ctx) => ctx.listingsCount >= 5,
    progress: (ctx) => ({ current: Math.min(ctx.listingsCount, 5), target: 5 }),
  },
  {
    id: "first_earning",
    nameKey: "subscription.creatorTab.achievements.firstEarning",
    descKey: "subscription.creatorTab.achievements.firstEarningDesc",
    icon: BanknotesIcon,
    color: "text-emerald-500",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    check: (ctx) => ctx.totalEarned > 0,
  },
  {
    id: "earning_100",
    nameKey: "subscription.creatorTab.achievements.earning100",
    descKey: "subscription.creatorTab.achievements.earning100Desc",
    icon: StarIcon,
    color: "text-amber-500",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    check: (ctx) => ctx.totalEarned >= 100,
    progress: (ctx) => ({
      current: Math.min(ctx.totalEarned, 100),
      target: 100,
    }),
  },
  {
    id: "earning_1000",
    nameKey: "subscription.creatorTab.achievements.earning1000",
    descKey: "subscription.creatorTab.achievements.earning1000Desc",
    icon: TrophyIcon,
    color: "text-orange-500",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
    check: (ctx) => ctx.totalEarned >= 1000,
    progress: (ctx) => ({
      current: Math.min(ctx.totalEarned, 1000),
      target: 1000,
    }),
  },
  {
    id: "likes_10",
    nameKey: "subscription.creatorTab.achievements.likes10",
    descKey: "subscription.creatorTab.achievements.likes10Desc",
    icon: HeartIcon,
    color: "text-rose-500",
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    check: (ctx) => ctx.totalLikes >= 10,
    progress: (ctx) => ({ current: Math.min(ctx.totalLikes, 10), target: 10 }),
  },
  {
    id: "forks_10",
    nameKey: "subscription.creatorTab.achievements.forks10",
    descKey: "subscription.creatorTab.achievements.forks10Desc",
    icon: ArrowPathIcon,
    color: "text-cyan-500",
    bgColor: "bg-cyan-100 dark:bg-cyan-900/30",
    check: (ctx) => ctx.totalForks >= 10,
    progress: (ctx) => ({ current: Math.min(ctx.totalForks, 10), target: 10 }),
  },
  {
    id: "views_100",
    nameKey: "subscription.creatorTab.achievements.views100",
    descKey: "subscription.creatorTab.achievements.views100Desc",
    icon: EyeIcon,
    color: "text-blue-500",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    check: (ctx) => ctx.totalViews >= 100,
    progress: (ctx) => ({
      current: Math.min(ctx.totalViews, 100),
      target: 100,
    }),
  },
];

// ---------- CreatorTab ----------

export function CreatorTab() {
  const { t } = useTranslation();
  const walletQuery = useDeveloperWallet();
  const summaryQuery = useDeveloperEarningsSummary();
  const ratesQuery = useRewardRates();
  const listingsQuery = useMyMarketplaceListings();
  const withdrawMutation = useWithdrawEarnings();
  const [withdrawResult, setWithdrawResult] = useState<number | null>(null);

  const wallet = walletQuery.data;
  const summary = summaryQuery.data?.items ?? [];
  const rates = ratesQuery.data;
  const listingsData = listingsQuery.data;

  // Compute achievement context
  const achievementCtx = useMemo<AchievementCtx>(() => {
    const items = listingsData ?? [];
    const totalLikes = items.reduce((s, l) => s + (l.likes_count ?? 0), 0);
    const totalForks = items.reduce((s, l) => s + (l.forks_count ?? 0), 0);
    const totalViews = items.reduce((s, l) => s + (l.views_count ?? 0), 0);
    return {
      listingsCount: items.length,
      totalEarned: wallet?.total_earned ?? 0,
      totalLikes,
      totalForks,
      totalViews,
    };
  }, [listingsData, wallet?.total_earned]);

  const handleWithdraw = async () => {
    if (!wallet || wallet.available_balance <= 0) return;
    try {
      const result = await withdrawMutation.mutateAsync(
        wallet.available_balance,
      );
      setWithdrawResult(result.withdrawn);
    } catch {
      // mutation error handled by react-query
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="mt-4 space-y-5"
    >
      {/* Wallet summary */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="overflow-hidden rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700/60 dark:bg-neutral-800/50"
      >
        <h3 className="mb-3 text-[13px] font-semibold text-neutral-900 dark:text-white">
          {t("subscription.creatorTab.walletTitle")}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {/* Pending */}
          <div className="rounded-lg bg-emerald-50/80 p-3 dark:bg-emerald-950/30">
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {t("subscription.creatorTab.pending")}
            </div>
            <div className="mt-1 text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {wallet?.available_balance?.toLocaleString() ?? "—"}
            </div>
            {wallet && wallet.available_balance > 0 && !withdrawResult && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleWithdraw}
                disabled={withdrawMutation.isPending}
                className={cn(
                  "mt-2 flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold text-white transition-all",
                  "bg-gradient-to-r from-indigo-500 to-purple-500 shadow-sm shadow-indigo-500/25",
                  withdrawMutation.isPending && "opacity-60",
                )}
              >
                <BanknotesIcon className="h-3 w-3" />
                {withdrawMutation.isPending
                  ? t("subscription.creatorTab.confirming")
                  : t("subscription.creatorTab.confirm")}
              </motion.button>
            )}
            {withdrawResult && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 flex items-center justify-center gap-1 rounded-md bg-emerald-100 px-2 py-1.5 text-[11px] font-medium text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
              >
                {t("subscription.creatorTab.withdrawSuccess", {
                  amount: withdrawResult.toLocaleString(),
                })}
              </motion.div>
            )}
          </div>
          {/* Confirmed (Total Earned) */}
          <div className="rounded-lg bg-indigo-50/80 p-3 dark:bg-indigo-950/30">
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {t("subscription.creatorTab.totalEarned")}
            </div>
            <div className="mt-1 text-xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
              {wallet?.total_withdrawn?.toLocaleString() ?? "—"}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Reward rates */}
      {rates && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-lg bg-neutral-100/60 px-4 py-3 dark:bg-white/[0.04]"
        >
          <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            {t("subscription.creatorTab.rewardRates")}
          </div>
          <div className="mt-1.5 flex gap-4">
            <span className="text-xs text-neutral-600 dark:text-neutral-300">
              {t("subscription.creatorTab.editableRate", {
                rate: (rates.editable * 100).toFixed(0),
              })}
            </span>
            <span className="text-xs text-neutral-600 dark:text-neutral-300">
              {t("subscription.creatorTab.lockedRate", {
                rate: (rates.locked * 100).toFixed(0),
              })}
            </span>
          </div>
        </motion.div>
      )}

      {/* Per-agent earnings table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700/60 dark:bg-neutral-800/50"
      >
        <h3 className="mb-3 text-[13px] font-semibold text-neutral-900 dark:text-white">
          {t("subscription.creatorTab.earningsTitle")}
        </h3>

        {summary.length === 0 ? (
          <div className="py-6 text-center">
            <div className="text-sm text-neutral-400 dark:text-neutral-500">
              {t("subscription.creatorTab.noEarnings")}
            </div>
            <div className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
              {t("subscription.creatorTab.noEarningsHint")}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {summary.map((item, idx) => (
              <motion.div
                key={`${item.marketplace_id}-${item.fork_mode}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + idx * 0.05 }}
                className="flex items-center gap-3 rounded-lg bg-neutral-100/60 p-3 dark:bg-white/[0.04]"
              >
                {/* Avatar */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-indigo-400 to-purple-500">
                  {item.agent_avatar ? (
                    <img
                      src={item.agent_avatar}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <SparklesIcon className="h-4 w-4 text-white" />
                  )}
                </div>

                {/* Name + fork mode */}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-neutral-900 dark:text-white">
                    {item.agent_name ?? item.marketplace_id.slice(0, 8)}
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-neutral-400 dark:text-neutral-500">
                    {item.fork_mode === "locked" ? (
                      <LockClosedIcon className="h-3 w-3" />
                    ) : (
                      <LockOpenIcon className="h-3 w-3" />
                    )}
                    {item.fork_mode}
                  </div>
                </div>

                {/* Stats */}
                <div className="shrink-0 text-right">
                  <div className="text-[13px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    +{item.total_earned.toLocaleString()}
                  </div>
                  <div className="text-[11px] tabular-nums text-neutral-400 dark:text-neutral-500">
                    {item.earning_count} {t("subscription.creatorTab.uses")}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Achievements */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700/60 dark:bg-neutral-800/50"
      >
        <h3 className="mb-3 text-[13px] font-semibold text-neutral-900 dark:text-white">
          {t("subscription.creatorTab.achievementsTitle")}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {ACHIEVEMENTS.map((ach, idx) => {
            const unlocked = ach.check(achievementCtx);
            const progress = ach.progress?.(achievementCtx);
            const Icon = ach.icon;
            return (
              <motion.div
                key={ach.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + idx * 0.04 }}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg p-3 transition-all",
                  unlocked
                    ? "bg-neutral-100/60 dark:bg-white/[0.04]"
                    : "bg-neutral-50/40 opacity-50 dark:bg-white/[0.02]",
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    unlocked
                      ? ach.bgColor
                      : "bg-neutral-200 dark:bg-neutral-700",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4",
                      unlocked
                        ? ach.color
                        : "text-neutral-400 dark:text-neutral-500",
                    )}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "truncate text-xs font-medium",
                      unlocked
                        ? "text-neutral-900 dark:text-white"
                        : "text-neutral-400 dark:text-neutral-500",
                    )}
                  >
                    {t(ach.nameKey)}
                  </div>
                  <div className="truncate text-[11px] text-neutral-400 dark:text-neutral-500">
                    {unlocked
                      ? t(ach.descKey)
                      : progress
                        ? `${progress.current}/${progress.target}`
                        : t("subscription.creatorTab.achievementLocked")}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------- CreatorModal ----------

interface CreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreatorModal({ isOpen, onClose }: CreatorModalProps) {
  const { t } = useTranslation();
  return (
    <SheetModal isOpen={isOpen} onClose={onClose}>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="shrink-0 px-5 pb-1 pt-6 md:px-6 md:pt-4">
          <h2 className="text-xl font-bold text-neutral-900 dark:text-white md:text-lg">
            {t("subscription.creator")}
          </h2>
        </div>
        <div className="custom-scrollbar relative flex-1 overflow-y-auto px-4 py-2 sm:px-6">
          <CreatorTab />
        </div>
        <div className="flex shrink-0 justify-end border-t border-neutral-100 px-4 pb-3 pt-3 sm:px-6 dark:border-neutral-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 focus:outline-none dark:bg-indigo-600 dark:hover:bg-indigo-500"
          >
            {t("subscription.gotIt")}
          </button>
        </div>
      </div>
    </SheetModal>
  );
}

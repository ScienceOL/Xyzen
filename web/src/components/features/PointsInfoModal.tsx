import { Modal } from "@/components/animate-ui/components/animate/modal";
import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsList,
  TabsTrigger,
} from "@/components/animate-ui/components/animate/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription, useSubscriptionUsage } from "@/hooks/useSubscription";
import { useUserWallet } from "@/hooks/useUserWallet";
import { cn } from "@/lib/utils";
import { subscriptionService } from "@/service/subscriptionService";
import {
  ChatBubbleLeftRightIcon,
  CheckIcon,
  ClockIcon,
  CommandLineIcon,
  DocumentTextIcon,
  FolderIcon,
  GlobeAltIcon,
  LockClosedIcon,
  PlusIcon,
  SparklesIcon,
  TicketIcon,
} from "@heroicons/react/24/outline";
import { motion } from "framer-motion";
import { Crown, Gem, Gift, Shield } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface PointsInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PlanFeature {
  text: string;
  included: boolean;
}

interface SubscriptionPlan {
  name: string;
  price: string;
  originalPrice?: string;
  period: string;
  credits: string;
  creditsNote?: string;
  storage: string;
  parallelChats: string;
  sandboxes?: string;
  highlight?: boolean;
  badge?: string;
  isFree?: boolean;
  isLocked?: boolean;
  lockedReason?: string;
  features: PlanFeature[];
}

const internationalPlans: SubscriptionPlan[] = [
  {
    name: "Free",
    price: "$0",
    period: "",
    credits: "Daily check-in",
    creditsNote: "Resets monthly",
    storage: "100 MB",
    parallelChats: "1 parallel",
    isFree: true,
    features: [
      { text: "Lite models", included: true },
      { text: "Basic features", included: true },
      { text: "Standard models", included: false },
      { text: "Pro & Ultra models", included: false },
    ],
  },
  {
    name: "Standard",
    price: "$9.9",
    period: "/mo",
    credits: "5,000",
    storage: "1 GB",
    parallelChats: "3 parallel",
    sandboxes: "1 sandbox",
    features: [
      { text: "Lite & Standard models", included: true },
      { text: "More storage & chats", included: true },
      { text: "Sandbox access", included: true },
      { text: "Pro & Ultra models", included: false },
    ],
  },
  {
    name: "Professional",
    price: "$36.9",
    period: "/mo",
    credits: "22,000",
    storage: "10 GB",
    parallelChats: "5 parallel",
    sandboxes: "2 sandbox",
    features: [
      { text: "All Standard features", included: true },
      { text: "Pro models", included: true },
      { text: "Priority support", included: true },
      { text: "Ultra models", included: false },
    ],
  },
  {
    name: "Ultra",
    price: "$99.9",
    period: "/mo",
    credits: "60,000",
    storage: "100 GB",
    parallelChats: "10 parallel",
    sandboxes: "3 sandbox",
    features: [
      { text: "All Pro features", included: true },
      { text: "Ultra models", included: true },
      { text: "Max performance", included: true },
      { text: "Dedicated support", included: true },
    ],
  },
];

const chinaPlans: SubscriptionPlan[] = [
  {
    name: "免费版",
    price: "¥0",
    period: "",
    credits: "签到获取",
    creditsNote: "次月清空",
    storage: "100 MB",
    parallelChats: "1 并行会话",
    isFree: true,
    features: [
      { text: "Lite 模型", included: true },
      { text: "基础功能", included: true },
      { text: "沙盒与并行会话", included: false },
      { text: "高级推理模型", included: false },
    ],
  },
  {
    name: "标准版",
    price: "¥25.9",
    originalPrice: "首月 ¥19.9",
    period: "/月",
    credits: "3,000",
    storage: "1 GB",
    parallelChats: "3 并行会话",
    sandboxes: "1 沙盒",
    features: [
      { text: "Lite 和 Standard 模型", included: true },
      { text: "更多存储和会话", included: true },
      { text: "沙盒环境", included: true },
      { text: "Pro 和 Ultra 模型", included: false },
    ],
  },
  {
    name: "专业版",
    price: "¥89.9",
    originalPrice: "首月 ¥79.9",
    period: "/月",
    credits: "10,000",
    storage: "10 GB",
    parallelChats: "5 并行会话",
    sandboxes: "2 沙盒",
    features: [
      { text: "全部标准功能", included: true },
      { text: "Pro 模型", included: true },
      { text: "优先技术支持", included: true },
      { text: "Ultra 模型", included: false },
    ],
  },
  {
    name: "深度版",
    price: "¥268.0",
    period: "/月",
    credits: "60,000",
    storage: "100 GB",
    parallelChats: "10 并行会话",
    sandboxes: "3 沙盒",
    features: [
      { text: "全部专业功能", included: true },
      { text: "Ultra 模型", included: true },
      { text: "极致性能", included: true },
      { text: "专属支持", included: true },
    ],
  },
];

// ---------- Tier visual config for MySubscription tab ----------

const TIER_CONFIG: Record<
  string,
  {
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    gradient: string;
    glow: string;
    accent: string;
    accentBorder: string;
    barColor: string;
  }
> = {
  standard: {
    icon: Shield,
    gradient:
      "from-blue-600 via-cyan-500 to-blue-400 dark:from-blue-500 dark:via-cyan-400 dark:to-blue-300",
    glow: "shadow-blue-500/25 dark:shadow-blue-400/20",
    accent: "text-blue-600 dark:text-blue-400",
    accentBorder: "border-blue-200 dark:border-blue-800",
    barColor: "bg-blue-500",
  },
  professional: {
    icon: Gem,
    gradient:
      "from-purple-600 via-fuchsia-500 to-purple-400 dark:from-purple-500 dark:via-fuchsia-400 dark:to-purple-300",
    glow: "shadow-purple-500/25 dark:shadow-purple-400/20",
    accent: "text-purple-600 dark:text-purple-400",
    accentBorder: "border-purple-200 dark:border-purple-800",
    barColor: "bg-purple-500",
  },
  ultra: {
    icon: Crown,
    gradient:
      "from-amber-500 via-orange-500 to-rose-500 dark:from-amber-400 dark:via-orange-400 dark:to-rose-400",
    glow: "shadow-amber-500/25 dark:shadow-amber-400/20",
    accent: "text-amber-600 dark:text-amber-400",
    accentBorder: "border-amber-200 dark:border-amber-800",
    barColor: "bg-amber-500",
  },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// ---------- Animated usage bar ----------

function UsageBar({
  value,
  max,
  color,
  delay = 0,
}: {
  value: number;
  max: number;
  color: string;
  delay?: number;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200/60 dark:bg-neutral-700/40">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(pct, 1)}%` }}
        transition={{ duration: 0.8, delay, ease: "easeOut" }}
        className={cn("h-full rounded-full", color)}
      />
    </div>
  );
}

// ---------- My Subscription Tab ----------

function MySubscriptionTab() {
  const auth = useAuth();
  const isAuthed = auth.isAuthenticated || !!auth.token;
  const subQuery = useSubscription(auth.token, isAuthed);
  const usageQuery = useSubscriptionUsage(auth.token, isAuthed);
  const walletQuery = useUserWallet(auth.token, isAuthed);
  const queryClient = useQueryClient();
  const [claiming, setClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState<{
    amount: number;
  } | null>(null);

  const role = subQuery.data?.role;
  const sub = subQuery.data?.subscription;
  const canClaim = subQuery.data?.can_claim_credits ?? false;
  const usage = usageQuery.data;
  const wallet = walletQuery.data;

  if (!role || !sub) return null;

  const tier = TIER_CONFIG[role.name] ?? TIER_CONFIG.standard;
  const TierIcon = tier.icon;

  const expiresAt = sub.expires_at ? new Date(sub.expires_at) : null;
  const isExpired = expiresAt ? expiresAt < new Date() : false;
  const daysLeft = expiresAt
    ? Math.max(
        0,
        Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      )
    : null;
  const expiryPct =
    daysLeft !== null ? Math.min(100, Math.max(2, (daysLeft / 30) * 100)) : 100;

  const handleClaim = async () => {
    if (claiming) return;
    setClaiming(true);
    try {
      const result = await subscriptionService.claimCredits();
      setClaimResult({ amount: result.amount_credited });
      // Invalidate queries to refresh data
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["subscription"] }),
        queryClient.invalidateQueries({ queryKey: ["userWallet"] }),
      ]);
    } catch {
      // Error is silently handled; button stays enabled for retry
    } finally {
      setClaiming(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="mt-4 space-y-5"
    >
      {/* Hero card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={cn(
          "relative overflow-hidden rounded-2xl p-[1px]",
          `bg-gradient-to-br ${tier.gradient}`,
        )}
      >
        {/* Inner card */}
        <div className="relative rounded-[15px] bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl">
          {/* Gradient mesh background */}
          <div
            className={cn(
              "pointer-events-none absolute inset-0 opacity-[0.07] dark:opacity-[0.12]",
              `bg-gradient-to-br ${tier.gradient}`,
            )}
          />

          {/* Floating particles */}
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              className={cn(
                "pointer-events-none absolute rounded-full opacity-20 blur-sm",
                `bg-gradient-to-br ${tier.gradient}`,
              )}
              style={{
                width: 6 + i * 4,
                height: 6 + i * 4,
                top: `${15 + i * 16}%`,
                right: `${5 + i * 8}%`,
              }}
              animate={{
                y: [0, -10, 0],
                opacity: [0.15, 0.3, 0.15],
              }}
              transition={{
                duration: 3 + i * 0.5,
                repeat: Infinity,
                delay: i * 0.4,
              }}
            />
          ))}

          <div className="relative flex flex-col items-center px-6 pt-8 pb-6 sm:px-8">
            {/* Icon */}
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 14,
                delay: 0.15,
              }}
              className={cn(
                "mb-4 flex h-16 w-16 items-center justify-center rounded-2xl shadow-lg",
                `bg-gradient-to-br ${tier.gradient} ${tier.glow}`,
              )}
            >
              <TierIcon className="h-8 w-8 text-white" />
            </motion.div>

            {/* Title */}
            <motion.h2
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className={cn(
                "bg-clip-text text-2xl font-extrabold tracking-tight text-transparent sm:text-3xl",
                `bg-gradient-to-r ${tier.gradient}`,
              )}
            >
              {role.display_name}
            </motion.h2>

            {/* Expiry badge */}
            {daysLeft !== null && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.28 }}
                className={cn(
                  "mt-2 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                  isExpired
                    ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                    : daysLeft <= 3
                      ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400"
                      : daysLeft <= 7
                        ? "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"
                        : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
                )}
              >
                <ClockIcon className="h-3.5 w-3.5" />
                {isExpired
                  ? "已过期"
                  : daysLeft === 0
                    ? "今日到期"
                    : `${daysLeft} 天后到期`}
              </motion.div>
            )}

            {/* Expiry progress bar */}
            {daysLeft !== null && !isExpired && (
              <motion.div
                initial={{ opacity: 0, scaleX: 0 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ delay: 0.35, duration: 0.5 }}
                className="mt-3 w-full max-w-xs"
                style={{ transformOrigin: "left" }}
              >
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200/60 dark:bg-neutral-700/40">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${expiryPct}%` }}
                    transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
                    className={cn(
                      "h-full rounded-full",
                      daysLeft <= 3
                        ? "bg-red-500"
                        : daysLeft <= 7
                          ? "bg-amber-500"
                          : tier.barColor,
                    )}
                  />
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Credits + Claim */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700/60 dark:bg-neutral-800/50"
        >
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <SparklesIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              积分余额
            </span>
          </div>
          <div className="text-xl font-bold tabular-nums text-neutral-900 dark:text-white">
            {wallet?.virtual_balance?.toLocaleString() ?? "—"}
          </div>
          {/* Claim button */}
          {canClaim && !claimResult && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleClaim}
              disabled={claiming}
              className={cn(
                "mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-all",
                `bg-gradient-to-r ${tier.gradient} ${tier.glow}`,
                claiming && "opacity-60",
              )}
            >
              <Gift className="h-3.5 w-3.5" />
              {claiming
                ? "领取中..."
                : `领取 ${role.monthly_credits.toLocaleString()} 积分`}
            </motion.button>
          )}
          {/* Claim success */}
          {claimResult && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
            >
              <CheckIcon className="h-3.5 w-3.5" />
              已领取 {claimResult.amount.toLocaleString()} 积分
            </motion.div>
          )}
        </motion.div>

        {/* Storage */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700/60 dark:bg-neutral-800/50"
        >
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <FolderIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              存储
            </span>
          </div>
          {usage ? (
            <>
              <div className="mb-1.5 text-sm font-semibold text-neutral-900 dark:text-white">
                {formatBytes(usage.storage.used_bytes)} /{" "}
                {formatBytes(usage.storage.limit_bytes)}
              </div>
              <UsageBar
                value={usage.storage.used_bytes}
                max={usage.storage.limit_bytes}
                color="bg-blue-500"
                delay={0.4}
              />
            </>
          ) : (
            <div className="text-sm text-neutral-400">—</div>
          )}
        </motion.div>

        {/* Chats */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700/60 dark:bg-neutral-800/50"
        >
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
              <ChatBubbleLeftRightIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              并行会话
            </span>
          </div>
          <div className="text-xl font-bold tabular-nums text-neutral-900 dark:text-white">
            {role.max_parallel_chats}
          </div>
        </motion.div>

        {/* Sandboxes */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700/60 dark:bg-neutral-800/50"
        >
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <CommandLineIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              沙盒
            </span>
          </div>
          <div className="text-xl font-bold tabular-nums text-neutral-900 dark:text-white">
            {role.max_sandboxes}
          </div>
        </motion.div>
      </div>

      {/* Redeem prompt */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className={cn(
          "flex items-center gap-4 rounded-xl border p-4",
          tier.accentBorder,
          "bg-gradient-to-r from-white to-neutral-50 dark:from-neutral-800/80 dark:to-neutral-900/80",
        )}
      >
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            `bg-gradient-to-br ${tier.gradient} ${tier.glow}`,
          )}
        >
          <TicketIcon className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-neutral-900 dark:text-white">
            兑换积分
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            在设置 &gt; 兑换码中输入兑换码即可领取积分或升级订阅
          </div>
        </div>
      </motion.div>

      {/* Files usage bar */}
      {usage && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700/60 dark:bg-neutral-800/50"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              文件用量
            </span>
            <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
              {usage.files.used} / {usage.files.limit}
            </span>
          </div>
          <UsageBar
            value={usage.files.used}
            max={usage.files.limit}
            color={tier.barColor}
            delay={0.6}
          />
        </motion.div>
      )}
    </motion.div>
  );
}

// ---------- Plan Card ----------

function PlanCard({ plan, index }: { plan: SubscriptionPlan; index: number }) {
  const isLocked = plan.isLocked;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.35 }}
      className={`relative flex flex-col rounded-xl border-2 p-3 transition-all sm:p-4 ${
        isLocked
          ? "border-neutral-200 bg-neutral-100/50 opacity-60 dark:border-neutral-700 dark:bg-neutral-800/20"
          : plan.highlight
            ? "border-indigo-400 bg-gradient-to-b from-indigo-50/80 to-white shadow-md shadow-indigo-100/40 dark:border-indigo-500 dark:from-indigo-500/15 dark:to-neutral-900 dark:shadow-indigo-500/10"
            : plan.isFree
              ? "border-neutral-200 bg-neutral-50/50 dark:border-neutral-700 dark:bg-neutral-800/30"
              : "border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800/50"
      }`}
    >
      {plan.badge && !isLocked && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-0.5 text-[11px] font-semibold text-white shadow-sm">
          {plan.badge}
        </div>
      )}

      {isLocked && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-neutral-400 px-3 py-0.5 text-[11px] font-medium text-white dark:bg-neutral-600">
          <LockClosedIcon className="h-3 w-3" />
          {plan.lockedReason}
        </div>
      )}

      <div className="mb-3">
        <h3
          className={`text-base font-bold ${isLocked ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-900 dark:text-neutral-50"}`}
        >
          {plan.name}
        </h3>
      </div>

      <div className="mb-3">
        <div className="flex items-baseline gap-0.5">
          <span
            className={`text-xl font-bold tracking-tight sm:text-2xl ${isLocked ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-900 dark:text-neutral-50"}`}
          >
            {plan.price}
          </span>
          {plan.period && (
            <span className="text-sm text-neutral-400 dark:text-neutral-500">
              {plan.period}
            </span>
          )}
        </div>
        {plan.originalPrice && !isLocked && (
          <div className="mt-0.5 text-xs font-medium text-indigo-600 dark:text-indigo-400">
            {plan.originalPrice}
          </div>
        )}
      </div>

      <div
        className={`mb-3 grid grid-cols-2 gap-1.5 rounded-lg px-2 py-2 sm:px-3 ${isLocked ? "bg-neutral-200/50 dark:bg-neutral-700/20" : "bg-neutral-100/80 dark:bg-neutral-700/30"}`}
      >
        <div className="flex items-center gap-1.5">
          <SparklesIcon
            className={`h-3.5 w-3.5 ${isLocked ? "text-neutral-400" : "text-amber-500"}`}
          />
          <span
            className={`text-[11px] font-medium ${isLocked ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-700 dark:text-neutral-300"}`}
          >
            {plan.credits}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg
            className={`h-3.5 w-3.5 ${isLocked ? "text-neutral-400" : "text-blue-500"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
            />
          </svg>
          <span
            className={`text-[11px] font-medium ${isLocked ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-700 dark:text-neutral-300"}`}
          >
            {plan.storage}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <ChatBubbleLeftRightIcon
            className={`h-3.5 w-3.5 ${isLocked ? "text-neutral-400" : "text-indigo-500"}`}
          />
          <span
            className={`text-[11px] font-medium ${isLocked ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-700 dark:text-neutral-300"}`}
          >
            {plan.parallelChats}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <CommandLineIcon
            className={`h-3.5 w-3.5 ${isLocked ? "text-neutral-400" : "text-emerald-500"}`}
          />
          <span
            className={`text-[11px] font-medium ${isLocked ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-700 dark:text-neutral-300"}`}
          >
            {plan.sandboxes ?? "—"}
          </span>
        </div>
      </div>

      <div className="mb-3 flex-1 space-y-1.5">
        {plan.features.map((feature, i) => (
          <div key={i} className="flex items-center gap-2">
            {feature.included ? (
              <CheckIcon
                className={`h-3.5 w-3.5 ${isLocked ? "text-neutral-400" : "text-green-500"}`}
              />
            ) : (
              <div className="h-3.5 w-3.5 rounded-full border border-neutral-300 dark:border-neutral-600" />
            )}
            <span
              className={`text-xs ${
                isLocked
                  ? "text-neutral-400 dark:text-neutral-500"
                  : feature.included
                    ? "text-neutral-600 dark:text-neutral-400"
                    : "text-neutral-400 dark:text-neutral-500"
              }`}
            >
              {feature.text}
            </span>
          </div>
        ))}
      </div>

      <button
        disabled
        className={`w-full cursor-not-allowed rounded-lg py-2 text-xs font-semibold ${
          isLocked
            ? "bg-neutral-200 text-neutral-400 dark:bg-neutral-700 dark:text-neutral-500"
            : "bg-neutral-200 text-neutral-400 dark:bg-neutral-700 dark:text-neutral-500"
        }`}
      >
        即将上线
      </button>
    </motion.div>
  );
}

function TopUpCard({
  region,
  delay,
}: {
  region: "international" | "china";
  delay: number;
}) {
  const isChina = region === "china";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      className="flex flex-col gap-3 rounded-lg border border-dashed border-neutral-300 bg-neutral-50/50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 dark:border-neutral-600 dark:bg-neutral-800/30"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm">
          <PlusIcon className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            {isChina ? "积分加量包" : "Credit Top-up"}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {isChina ? "随时补充，按需购买" : "Pay as you go"}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-bold text-neutral-800 dark:text-neutral-200">
          {isChina ? "100 积分 = ¥1" : "500 credits = $1"}
        </div>
        <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
          {isChina ? "支付宝 / 微信" : "PayPal / Credit Cards"}
        </div>
      </div>
    </motion.div>
  );
}

function SandboxPackCard({
  region,
  delay,
}: {
  region: "international" | "china";
  delay: number;
}) {
  const isChina = region === "china";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      className="flex flex-col gap-3 rounded-lg border border-dashed border-neutral-300 bg-neutral-50/50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 dark:border-neutral-600 dark:bg-neutral-800/30"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 shadow-sm">
          <CommandLineIcon className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            {isChina ? "沙盒扩容包" : "Sandbox Add-on"}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {isChina ? "额外沙盒实例，独立计费" : "Extra sandbox instances"}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-bold text-neutral-800 dark:text-neutral-200">
          {isChina ? "+1 沙盒 / 月" : "+1 sandbox / mo"}
        </div>
        <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
          {isChina ? "需标准版及以上" : "Standard plan or above"}
        </div>
      </div>
    </motion.div>
  );
}

// ---------- Modal ----------

export function PointsInfoModal({ isOpen, onClose }: PointsInfoModalProps) {
  const auth = useAuth();
  const isAuthed = auth.isAuthenticated || !!auth.token;
  const subQuery = useSubscription(auth.token, isAuthed);

  const roleName = subQuery.data?.role?.name;
  const hasPaidSub = !!roleName && roleName !== "free";

  const defaultTab = hasPaidSub ? "subscription" : "international";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="选择订阅方案"
      maxWidth="max-w-5xl"
    >
      <div className="flex flex-col">
        {/* Scrollable content */}
        <div className="relative max-h-[65vh] overflow-y-auto custom-scrollbar px-4 py-2 sm:px-6">
          <div className="space-y-4">
            <Tabs defaultValue={defaultTab} key={defaultTab}>
              <TabsList className="mx-auto w-fit">
                {hasPaidSub && (
                  <TabsTrigger
                    value="subscription"
                    className="gap-1.5 px-3 text-xs sm:gap-2 sm:px-5 sm:text-sm"
                  >
                    <SparklesIcon className="h-4 w-4" />
                    我的订阅
                  </TabsTrigger>
                )}
                <TabsTrigger
                  value="international"
                  className="gap-1.5 px-3 text-xs sm:gap-2 sm:px-5 sm:text-sm"
                >
                  <GlobeAltIcon className="h-4 w-4" />
                  International
                </TabsTrigger>
                <TabsTrigger
                  value="china"
                  className="gap-1.5 px-3 text-xs sm:gap-2 sm:px-5 sm:text-sm"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                  </svg>
                  中国大陆
                </TabsTrigger>
              </TabsList>

              <TabsContents>
                {hasPaidSub && (
                  <TabsContent value="subscription">
                    <MySubscriptionTab />
                  </TabsContent>
                )}

                <TabsContent value="international">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.25 }}
                    className="mt-4 space-y-4"
                  >
                    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
                      {internationalPlans.map((plan, index) => (
                        <PlanCard key={plan.name} plan={plan} index={index} />
                      ))}
                    </div>
                    <TopUpCard region="international" delay={0.3} />
                    <SandboxPackCard region="international" delay={0.35} />
                  </motion.div>
                </TabsContent>

                <TabsContent value="china">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.25 }}
                    className="mt-4 space-y-4"
                  >
                    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
                      {chinaPlans.map((plan, index) => (
                        <PlanCard key={plan.name} plan={plan} index={index} />
                      ))}
                    </div>
                    <TopUpCard region="china" delay={0.3} />
                    <SandboxPackCard region="china" delay={0.35} />
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.35 }}
                      className="text-center text-xs text-neutral-500 dark:text-neutral-400"
                    >
                      订阅服务不与国际版互通
                    </motion.p>
                  </motion.div>
                </TabsContent>
              </TabsContents>
            </Tabs>

            {/* Beta notice */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="rounded-lg border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 dark:border-amber-500/30 dark:from-amber-500/10 dark:to-orange-500/10"
            >
              <p className="text-center text-xs text-amber-700 dark:text-amber-300">
                内测期间暂不支持外部充值，欢迎加入内测群了解最新动态
              </p>
            </motion.div>

            {/* Survey link */}
            <motion.a
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.45 }}
              whileHover={{ scale: 1.005 }}
              whileTap={{ scale: 0.995 }}
              href="https://sii-czxy.feishu.cn/share/base/form/shrcnYu8Y3GNgI7M14En1xJ7rMb"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2 rounded-lg border border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50 px-3 py-2.5 transition-all hover:border-indigo-300 hover:shadow-sm sm:gap-3 sm:px-4 sm:py-3 dark:border-indigo-500/30 dark:from-indigo-500/10 dark:to-purple-500/10 dark:hover:border-indigo-400/50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-sm">
                <DocumentTextIcon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">
                  填写内测问卷
                </div>
                <div className="text-xs text-indigo-600/70 dark:text-indigo-300/70">
                  参与内测获取更多额度
                </div>
              </div>
              <svg
                className="h-4 w-4 text-indigo-400 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </motion.a>
          </div>
        </div>

        {/* Fixed footer */}
        <div className="flex justify-end border-t border-neutral-100 px-4 pt-3 pb-1 sm:px-6 dark:border-neutral-800">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={onClose}
            className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 focus:outline-none dark:bg-indigo-600 dark:hover:bg-indigo-500"
          >
            知道了
          </motion.button>
        </div>
      </div>
    </Modal>
  );
}

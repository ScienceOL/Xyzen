import { SheetModal } from "@/components/animate-ui/components/animate/sheet-modal";
import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsList,
  TabsTrigger,
} from "@/components/animate-ui/components/animate/tabs";
import { StepperInput } from "@/components/base/StepperInput";
import { PaymentQRModal } from "@/components/features/PaymentQRModal";
import type { CheckoutResponse } from "@/service/paymentService";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/animate-ui/components/radix/dropdown-menu";
import { usePlanCatalog } from "@/hooks/usePlanCatalog";
import { useCelebration } from "@/hooks/useCelebration";
import { useSubscriptionInfo, useBilling } from "@/hooks/ee";
import { cn } from "@/lib/utils";
import { paymentService } from "@/service/paymentService";
import type {
  PaymentMethodInfo,
  PlanResponse,
} from "@/service/subscriptionService";
import {
  BoltIcon,
  ChatBubbleLeftRightIcon,
  CheckIcon,
  ClockIcon,
  CalendarDaysIcon,
  CommandLineIcon,
  DocumentTextIcon,
  FolderIcon,
  GlobeAltIcon,
  LockClosedIcon,
  PlusIcon,
  SparklesIcon,
  TicketIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import { motion } from "framer-motion";
import { Crown, Gem, Shield } from "lucide-react";
import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { type TFunction } from "i18next";

function ButtonSpinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ---------- Payment brand icons ----------

function AlipayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path
        d="M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10z"
        fill="#1677FF"
      />
      <path
        d="M17.2 14.8c-1.6-.7-3-.9-3-.9s.7-1.8.9-3h-3.4V9.6h4.2v-.5h-4.2V7.3h-1.1v1.8h-3.7v.5h3.3v1.3H7.1v.5h5.9c-.3.8-.7 1.7-1.1 2.5-1.5-.5-3.3-.6-4.2.1-.7.6-.8 1.6-.2 2.3.6.7 1.7.8 2.8.2.7-.4 1.4-1.2 2-2.1 1 .4 2.9 1.3 3.9 1.8.15.08.28-.07.2-.2-.06-.1-.15-.16-.4-.3zM8.3 15.7c-.8.3-1.6 0-1.8-.4-.2-.4 0-1.1.8-1.4.8-.3 1.9-.1 2.8.4-.6.9-1.2 1.2-1.8 1.4z"
        fill="white"
      />
    </svg>
  );
}

function WeChatPayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path
        d="M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10z"
        fill="#07C160"
      />
      <path
        d="M9.5 6.5c-2.8 0-5 1.8-5 4.1 0 1.3.7 2.4 1.8 3.2l-.5 1.4 1.6-.8c.6.2 1.3.3 2 .3.1 0 .3 0 .4-.01a3.8 3.8 0 01-.1-.9c0-2.3 2.1-4.2 4.7-4.2h.4C14.3 7.8 12.1 6.5 9.5 6.5zm-1.8 2.3a.7.7 0 110 1.4.7.7 0 010-1.4zm3.5 0a.7.7 0 110 1.4.7.7 0 010-1.4zm3.2 2.4c-2.3 0-4.1 1.6-4.1 3.5 0 1.9 1.8 3.5 4.1 3.5.5 0 .9-.1 1.3-.2l1.2.6-.3-.9c1-.7 1.6-1.7 1.6-2.8 0-2.1-1.8-3.7-4.1-3.7h.3zm-1.3 2a.55.55 0 110 1.1.55.55 0 010-1.1zm2.6 0a.55.55 0 110 1.1.55.55 0 010-1.1z"
        fill="white"
      />
    </svg>
  );
}

function PayPalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path
        d="M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10z"
        fill="#003087"
      />
      <path
        d="M15.4 7.3c-.5-.6-1.5-.8-2.8-.8H9.4c-.3 0-.5.2-.5.4L7.5 16c0 .2.1.3.3.3h2.2l.5-3.4v.1c0-.3.3-.5.6-.5h1.2c2.3 0 4.1-1 4.7-3.7v-.2c-.1-.8-.1-.8-1.6-1.3z"
        fill="white"
      />
      <path
        d="M16 8.6c-.5 2.5-2.2 3.4-4.4 3.4H10.5l-.7 4.2h-1c-.2 0-.3-.1-.3-.3l.1-.3.6-3.6v.1c0-.3.3-.5.6-.5h1.2c2.3 0 4.1-1 4.7-3.7.1-.3.1-.6.1-.8-.2.1-.2.1.2.5z"
        fill="#E0E0E0"
        opacity=".5"
      />
    </svg>
  );
}

const PAYMENT_ICON_MAP: Record<
  string,
  { Icon: React.FC<{ className?: string }>; color: string }
> = {
  alipaycn: { Icon: AlipayIcon, color: "text-[#1677FF]" },
  wechatpay: { Icon: WeChatPayIcon, color: "text-[#07C160]" },
  paypal: { Icon: PayPalIcon, color: "text-[#003087]" },
};

function DisabledPaymentButton({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <button
      disabled
      className={cn(
        "flex cursor-not-allowed items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold text-white bg-neutral-300 dark:bg-neutral-600",
        className,
      )}
    >
      {label}
    </button>
  );
}

function PaymentMethodDropdown({
  label,
  paymentMethods,
  loadingMethodKey,
  disabled,
  paymentEnabled = true,
  onSelect,
  className,
}: {
  label: string;
  paymentMethods: PaymentMethodInfo[];
  loadingMethodKey?: string | null;
  disabled?: boolean;
  paymentEnabled?: boolean;
  onSelect: (methodKey: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();

  if (!paymentEnabled) {
    return <DisabledPaymentButton label={label} className={className} />;
  }

  const busy = !!loadingMethodKey;
  const isLoading = paymentMethods.some((m) => m.key === loadingMethodKey);

  if (paymentMethods.length === 0) return null;

  // Single method: direct button with brand icon
  if (paymentMethods.length === 1) {
    const method = paymentMethods[0];
    const iconInfo = PAYMENT_ICON_MAP[method.key];
    const isThis = loadingMethodKey === method.key;
    return (
      <button
        disabled={busy || disabled}
        onClick={() => onSelect(method.key)}
        className={cn(
          "flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold text-white",
          busy
            ? "cursor-not-allowed bg-indigo-400 dark:bg-indigo-500/70"
            : "bg-indigo-500 hover:bg-indigo-600 dark:hover:bg-indigo-400",
          className,
        )}
      >
        {isThis ? (
          <ButtonSpinner />
        ) : (
          iconInfo && <iconInfo.Icon className="h-4 w-4" />
        )}
        {label}
      </button>
    );
  }

  // Multiple methods: single button + dropdown listing ALL methods
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          disabled={busy || disabled}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold text-white transition-colors",
            isLoading
              ? "cursor-not-allowed bg-indigo-400 dark:bg-indigo-500/70"
              : busy || disabled
                ? "cursor-not-allowed bg-indigo-500 opacity-50"
                : "bg-indigo-500 hover:bg-indigo-600 dark:hover:bg-indigo-400",
            className,
          )}
        >
          {isLoading && <ButtonSpinner />}
          {label}
          {!isLoading && <ChevronDownIcon className="h-3 w-3" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        sideOffset={6}
        className="min-w-[180px] rounded-lg border-neutral-200/40 bg-white/95 p-1.5 shadow-xl shadow-black/10 backdrop-blur-xl dark:border-neutral-700/40 dark:bg-neutral-800/95 dark:shadow-black/30"
      >
        {paymentMethods.map((method) => {
          const iconInfo = PAYMENT_ICON_MAP[method.key];
          return (
            <DropdownMenuItem
              key={method.key}
              onSelect={() => onSelect(method.key)}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2.5 transition-colors hover:bg-neutral-100 focus:bg-neutral-100 dark:hover:bg-neutral-700/60 dark:focus:bg-neutral-700/60"
            >
              {iconInfo && <iconInfo.Icon className="h-5 w-5 shrink-0" />}
              <span className="text-[13px] font-medium text-neutral-700 dark:text-neutral-200">
                {t(method.display_name_key)}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
  planKey: string;
  price: string;
  originalPrice?: string;
  period: string;
  credits: string;
  creditsNote?: string;
  storage: string;
  parallelChats: string;
  sandboxes?: string;
  scheduledTasks?: string;
  terminals?: string;
  highlight?: boolean;
  badge?: string;
  isFree?: boolean;
  isLocked?: boolean;
  lockedReason?: string;
  features: PlanFeature[];
}

function toPlanCardData(plan: PlanResponse, t: TFunction): SubscriptionPlan {
  const pricing = plan.pricing[0];
  const limits = plan.limits;
  return {
    name: t(plan.display_name_key),
    planKey: plan.plan_key,
    price: pricing?.display_price ?? "$0",
    originalPrice: pricing?.first_month_display
      ? t("subscription.plan.firstMonth", {
          price: pricing.first_month_display,
        })
      : undefined,
    period: plan.is_free ? "" : t("subscription.plan.perMonth"),
    credits: plan.is_free
      ? t("subscription.plan.dailyCheckIn")
      : (limits?.monthly_credits.toLocaleString() ??
        pricing?.credits.toLocaleString() ??
        "0"),
    creditsNote: plan.is_free
      ? t("subscription.plan.resetsMonthly")
      : undefined,
    storage: limits?.storage ?? "—",
    parallelChats: t("subscription.plan.parallel", {
      count: limits?.max_parallel_chats ?? 1,
    }),
    sandboxes: limits?.max_sandboxes
      ? t("subscription.plan.sandbox", { count: limits.max_sandboxes })
      : undefined,
    scheduledTasks: limits?.max_scheduled_tasks
      ? t("subscription.plan.scheduledTask", {
          count: limits.max_scheduled_tasks,
        })
      : undefined,
    terminals: limits?.max_terminals
      ? t("subscription.plan.terminal", { count: limits.max_terminals })
      : undefined,
    highlight: plan.highlight,
    badge: plan.badge_key ? t(plan.badge_key) : undefined,
    isFree: plan.is_free,
    features: plan.features.map((f) => ({
      text: t(`subscription.feature.${f.key}`, f.params),
      included: f.included,
    })),
  };
}

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
  const { t } = useTranslation();
  const subInfo = useSubscriptionInfo();
  const billing = useBilling();
  const subQuery = subInfo?.subQuery;
  const usageQuery = subInfo?.usageQuery;

  const role = subQuery?.data?.role;
  const sub = subQuery?.data?.subscription;
  const usage = usageQuery?.data;
  const walletBalance = billing?.balance;

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
                  ? t("subscription.sub.expired")
                  : daysLeft === 0
                    ? t("subscription.sub.expiresToday")
                    : t("subscription.sub.expiresIn", { days: daysLeft })}
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[2fr_2fr_1fr_1fr_1fr_1fr]">
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
              {t("subscription.sub.creditsBalance")}
            </span>
          </div>
          <div className="text-xl font-bold tabular-nums text-neutral-900 dark:text-white">
            {walletBalance?.total?.toLocaleString() ?? "—"}
          </div>
          {/* Category breakdown */}
          {walletBalance && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
              <span className="text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400">
                {t("app:wallet.freeBalance", { defaultValue: "Free" })}:{" "}
                {walletBalance.free.toLocaleString()}
              </span>
              <span className="text-[11px] tabular-nums text-indigo-600 dark:text-indigo-400">
                {t("app:wallet.paidBalance", { defaultValue: "Paid" })}:{" "}
                {walletBalance.paid.toLocaleString()}
              </span>
              {walletBalance.earned > 0 && (
                <span className="text-[11px] tabular-nums text-amber-600 dark:text-amber-400">
                  {t("app:wallet.earnedBalance", { defaultValue: "Earned" })}:{" "}
                  {walletBalance.earned.toLocaleString()}
                </span>
              )}
            </div>
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
              {t("subscription.sub.storage")}
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
              {t("subscription.sub.parallelChats")}
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
              {t("subscription.sub.sandboxes")}
            </span>
          </div>
          <div className="text-xl font-bold tabular-nums text-neutral-900 dark:text-white">
            {usage?.sandboxes.limit ?? role.max_sandboxes}
          </div>
        </motion.div>

        {/* Scheduled Tasks */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700/60 dark:bg-neutral-800/50"
        >
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <CalendarDaysIcon className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {t("subscription.sub.scheduledTasks")}
            </span>
          </div>
          <div className="text-xl font-bold tabular-nums text-neutral-900 dark:text-white">
            {role.max_scheduled_tasks}
          </div>
        </motion.div>

        {/* Terminals */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700/60 dark:bg-neutral-800/50"
        >
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
              <GlobeAltIcon className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
            </div>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {t("subscription.sub.terminals")}
            </span>
          </div>
          <div className="text-xl font-bold tabular-nums text-neutral-900 dark:text-white">
            {role.max_terminals ?? "—"}
          </div>
        </motion.div>
      </div>

      {/* Redeem prompt */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
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
            {t("subscription.sub.redeemTitle")}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {t("subscription.sub.redeemHint")}
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
              {t("subscription.sub.filesUsage")}
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

      {/* Scheduled tasks usage bar */}
      {usage?.scheduled_tasks && usage.scheduled_tasks.limit > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700/60 dark:bg-neutral-800/50"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {t("subscription.sub.scheduledTasks")}
            </span>
            <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
              {usage.scheduled_tasks.used} / {usage.scheduled_tasks.limit}
            </span>
          </div>
          <UsageBar
            value={usage.scheduled_tasks.used}
            max={usage.scheduled_tasks.limit}
            color="bg-orange-500"
            delay={0.65}
          />
        </motion.div>
      )}
    </motion.div>
  );
}

// ---------- Plan Card ----------

function PlanCard({
  plan,
  index,
  paymentMethods,
  loadingMethodKey,
  paymentEnabled,
  onSubscribeQR,
}: {
  plan: SubscriptionPlan;
  index: number;
  paymentMethods: PaymentMethodInfo[];
  loadingMethodKey?: string | null;
  paymentEnabled?: boolean;
  onSubscribeQR?: (planKey: string, methodKey: string) => void;
}) {
  const { t } = useTranslation();
  const isLocked = plan.isLocked;
  const isFree = plan.isFree;

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
        className={`mb-3 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg px-2 py-2 sm:px-3 ${isLocked ? "bg-neutral-200/50 dark:bg-neutral-700/20" : "bg-neutral-100/80 dark:bg-neutral-700/30"}`}
      >
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <SparklesIcon
            className={`h-3.5 w-3.5 shrink-0 ${isLocked ? "text-neutral-400" : "text-amber-500"}`}
          />
          <span
            className={`text-[11px] font-medium ${isLocked ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-700 dark:text-neutral-300"}`}
          >
            {plan.credits}
          </span>
        </div>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <svg
            className={`h-3.5 w-3.5 shrink-0 ${isLocked ? "text-neutral-400" : "text-blue-500"}`}
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
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <ChatBubbleLeftRightIcon
            className={`h-3.5 w-3.5 shrink-0 ${isLocked ? "text-neutral-400" : "text-indigo-500"}`}
          />
          <span
            className={`text-[11px] font-medium ${isLocked ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-700 dark:text-neutral-300"}`}
          >
            {plan.parallelChats}
          </span>
        </div>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <CommandLineIcon
            className={`h-3.5 w-3.5 shrink-0 ${isLocked ? "text-neutral-400" : "text-emerald-500"}`}
          />
          <span
            className={`text-[11px] font-medium ${isLocked ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-700 dark:text-neutral-300"}`}
          >
            {plan.sandboxes ?? "—"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <CalendarDaysIcon
            className={`h-3.5 w-3.5 shrink-0 ${isLocked ? "text-neutral-400" : "text-orange-500"}`}
          />
          <span
            className={`text-[11px] font-medium ${isLocked ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-700 dark:text-neutral-300"}`}
          >
            {plan.scheduledTasks ?? t("subscription.plan.scheduledTaskNone")}
          </span>
        </div>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <GlobeAltIcon
            className={`h-3.5 w-3.5 shrink-0 ${isLocked ? "text-neutral-400" : "text-cyan-500"}`}
          />
          <span
            className={`text-[11px] font-medium ${isLocked ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-700 dark:text-neutral-300"}`}
          >
            {plan.terminals ?? "—"}
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

      {/* Subscribe action */}
      {isFree || isLocked ? (
        <button
          disabled
          className="w-full rounded-lg py-2 text-xs font-semibold cursor-not-allowed bg-neutral-200 text-neutral-400 dark:bg-neutral-700 dark:text-neutral-500"
        >
          {isFree ? t("subscription.plan.free") : t("subscription.comingSoon")}
        </button>
      ) : (
        <div className="mt-auto">
          <PaymentMethodDropdown
            label={t("subscription.subscribe")}
            paymentMethods={paymentMethods}
            loadingMethodKey={loadingMethodKey}
            paymentEnabled={paymentEnabled}
            onSelect={(methodKey) => onSubscribeQR?.(plan.planKey, methodKey)}
            className="w-full"
          />
        </div>
      )}
    </motion.div>
  );
}

function TopUpCard({
  displayRate,
  paymentMethods,
  loadingMethodKey,
  delay,
  creditsPerUnit,
  unitAmount,
  currency,
  paymentEnabled,
  onQRCheckout,
}: {
  displayRate: string;
  paymentMethods: PaymentMethodInfo[];
  loadingMethodKey?: string | null;
  delay: number;
  creditsPerUnit: number;
  unitAmount: number;
  currency: string;
  paymentEnabled?: boolean;
  onQRCheckout?: (credits: number, methodKey: string) => void;
}) {
  const { t } = useTranslation();
  const [credits, setCredits] = useState(0);

  const priceMinor = credits > 0 ? (credits / creditsPerUnit) * unitAmount : 0;
  const priceDisplay =
    currency === "CNY"
      ? `¥${(priceMinor / 100).toFixed(2)}`
      : `$${(priceMinor / 100).toFixed(2)}`;

  const canBuy = credits > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50/50 px-3 py-3 sm:px-4 dark:border-neutral-600 dark:bg-neutral-800/30"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm">
            <PlusIcon className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              {t("subscription.topUp.title")}
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {t("subscription.topUp.subtitle")}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold text-neutral-800 dark:text-neutral-200">
            {t(displayRate)}
          </div>
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {paymentMethods.map((m) => t(m.display_name_key)).join(" / ") ||
              t("subscription.topUp.methodsIntl")}
          </div>
        </div>
      </div>

      {/* Credit amount NumberField + price + buy */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <StepperInput
          value={credits}
          onChange={setCredits}
          minValue={0}
          step={500}
          className="w-36 shrink-0"
        />
        {canBuy && (
          <span className="shrink-0 text-xs font-medium tabular-nums text-neutral-500 dark:text-neutral-400">
            {priceDisplay}
          </span>
        )}
        {canBuy && (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <PaymentMethodDropdown
              label={t("subscription.topUp.buy")}
              paymentMethods={paymentMethods}
              loadingMethodKey={loadingMethodKey}
              paymentEnabled={paymentEnabled}
              onSelect={(methodKey) => onQRCheckout?.(credits, methodKey)}
              className="px-4"
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}

function SandboxPackCard({
  displayRate,
  paymentMethods,
  loadingMethodKey,
  delay,
  minPlan,
  userPlan,
  paymentEnabled,
  onQRCheckout,
}: {
  displayRate: string;
  paymentMethods: PaymentMethodInfo[];
  loadingMethodKey?: string | null;
  delay: number;
  minPlan: string;
  userPlan: string;
  paymentEnabled?: boolean;
  onQRCheckout?: (quantity: number, methodKey: string) => void;
}) {
  const { t } = useTranslation();
  const [quantity, setQuantity] = useState(1);

  const planPriority: Record<string, number> = {
    free: 0,
    standard: 1,
    professional: 2,
    ultra: 3,
  };
  const meetsMinPlan =
    (planPriority[userPlan] ?? 0) >= (planPriority[minPlan] ?? 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50/50 px-3 py-3 sm:px-4 dark:border-neutral-600 dark:bg-neutral-800/30"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 shadow-sm">
            <CommandLineIcon className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              {t("subscription.sandboxAddon.title")}
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {t("subscription.sandboxAddon.subtitle")}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold text-neutral-800 dark:text-neutral-200">
            {t(displayRate)}
          </div>
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {t("subscription.sandboxAddon.requirement")}
          </div>
        </div>
      </div>

      {/* Quantity selector + buy */}
      {meetsMinPlan ? (
        <div className="mt-3 flex items-center gap-3">
          <StepperInput
            value={quantity}
            onChange={setQuantity}
            minValue={1}
            maxValue={5}
            step={1}
            className="w-36 shrink-0"
          />

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <PaymentMethodDropdown
              label={t("subscription.sandboxAddon.buy")}
              paymentMethods={paymentMethods}
              loadingMethodKey={loadingMethodKey}
              paymentEnabled={paymentEnabled}
              onSelect={(methodKey) => onQRCheckout?.(quantity, methodKey)}
              className="px-4"
            />
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <div className="rounded-lg bg-neutral-100/60 px-3 py-2 text-center text-xs text-neutral-500 dark:bg-white/[0.04] dark:text-neutral-400">
            {t("subscription.sandboxAddon.requiresPlan")}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function FullAccessCard({
  displayPrice,
  paymentMethods,
  loadingMethodKey,
  delay,
  expiresAt,
  paymentEnabled,
  onQRCheckout,
}: {
  displayPrice: string;
  paymentMethods: PaymentMethodInfo[];
  loadingMethodKey?: string | null;
  delay: number;
  expiresAt?: string | null;
  paymentEnabled?: boolean;
  onQRCheckout?: (methodKey: string) => void;
}) {
  const { t } = useTranslation();

  const daysRemaining = useMemo(() => {
    if (!expiresAt) return null;
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return null;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }, [expiresAt]);

  const isActive = daysRemaining !== null && daysRemaining > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      className={cn(
        "rounded-lg border border-dashed px-3 py-3 sm:px-4",
        isActive
          ? "border-green-300 bg-green-50/40 dark:border-green-500/30 dark:bg-green-950/20"
          : "border-indigo-300 bg-indigo-50/40 dark:border-indigo-500/30 dark:bg-indigo-950/20",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg shadow-sm",
              isActive
                ? "bg-gradient-to-br from-green-500 to-emerald-500"
                : "bg-gradient-to-br from-indigo-500 to-violet-500",
            )}
          >
            <BoltIcon className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              {t("subscription.fullAccess.title")}
              {isActive && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400">
                  {t("subscription.fullAccess.active")}
                </span>
              )}
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {isActive
                ? t("subscription.fullAccess.remaining", {
                    days: daysRemaining,
                  })
                : t("subscription.fullAccess.subtitle")}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isActive && (
            <div className="text-right">
              <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                {displayPrice}
              </div>
              <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                {t("subscription.fullAccess.duration")}
              </div>
            </div>
          )}
          <div className="flex shrink-0 items-center gap-2">
            <PaymentMethodDropdown
              label={
                isActive
                  ? t("subscription.fullAccess.renew")
                  : t("subscription.fullAccess.buy")
              }
              paymentMethods={paymentMethods}
              loadingMethodKey={loadingMethodKey}
              paymentEnabled={paymentEnabled}
              onSelect={(methodKey) => onQRCheckout?.(methodKey)}
              className="px-4"
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ---------- PayPal provider wrapper ----------

// ---------- Modal ----------

export function PointsInfoModal({ isOpen, onClose }: PointsInfoModalProps) {
  const { t } = useTranslation();
  const subInfo = useSubscriptionInfo();
  const queryClient = useQueryClient();
  const celebrate = useCelebration();
  const { data: catalog, isLoading: catalogLoading } = usePlanCatalog();

  const roleName = subInfo?.roleName;
  const hasPaidSub = !!roleName && roleName !== "free";

  const methods = catalog?.payment_methods ?? [];
  const paymentEnabled = catalog?.payment_enabled ?? true;
  const isChina = catalog?.region === "zh-cn";
  const regionTab = isChina ? "china" : "international";

  const regionPlans = useMemo(() => {
    if (!catalog) return [];
    return catalog.plans.map((p) => toPlanCardData(p, t));
  }, [catalog, t]);

  const defaultTab = hasPaidSub ? "subscription" : regionTab;
  const showTabsList = hasPaidSub;

  // Payment QR modal state
  const [qrModal, setQrModal] = useState<{
    open: boolean;
    orderId: string;
    qrCodeUrl: string;
    amount: number;
    currency: string;
    planName: string;
  }>({
    open: false,
    orderId: "",
    qrCodeUrl: "",
    amount: 0,
    currency: "",
    planName: "",
  });

  // Compound key: "card:methodKey" — scopes loading to specific card
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const cardLoading = (prefix: string) =>
    loadingKey?.startsWith(`${prefix}:`)
      ? loadingKey.slice(prefix.length + 1)
      : null;

  const openCheckoutResult = useCallback(
    (result: CheckoutResponse, planName: string) => {
      if (result.flow_type === "paypal_sdk" && result.approval_url) {
        // PayPal: redirect to approval page, no polling modal needed.
        // Payment completion is handled by the PayPal webhook on the backend.
        window.open(result.approval_url, "_blank", "noopener,noreferrer");
        return;
      }
      setQrModal({
        open: true,
        orderId: result.order_id,
        qrCodeUrl: result.qr_code_url ?? "",
        amount: result.amount,
        currency: result.currency,
        planName,
      });
    },
    [],
  );

  const handleSubscribeQR = useCallback(
    async (planKey: string, methodKey: string) => {
      if (loadingKey) return;
      setLoadingKey(`plan:${planKey}:${methodKey}`);
      try {
        const result = await paymentService.createCheckout(planKey, methodKey);
        const plan = regionPlans.find((p) => p.planKey === planKey);
        openCheckoutResult(result, plan?.name ?? planKey);
      } catch {
        // TODO: toast error
      } finally {
        setLoadingKey(null);
      }
    },
    [loadingKey, regionPlans, openCheckoutResult],
  );

  const handlePaymentSuccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["subscription"] });
    queryClient.invalidateQueries({ queryKey: ["subscription-usage"] });
    celebrate();
  }, [queryClient, celebrate]);

  const handleTopUpQR = useCallback(
    async (credits: number, methodKey: string) => {
      if (loadingKey) return;
      setLoadingKey(`topup:${methodKey}`);
      try {
        const result = await paymentService.createTopUpCheckout(
          credits,
          methodKey,
        );
        openCheckoutResult(
          result,
          t("subscription.topUp.credits", {
            amount: credits.toLocaleString(),
          }),
        );
      } catch {
        // TODO: toast error
      } finally {
        setLoadingKey(null);
      }
    },
    [loadingKey, t, openCheckoutResult],
  );

  const handleSandboxAddonQR = useCallback(
    async (quantity: number, methodKey: string) => {
      if (loadingKey) return;
      setLoadingKey(`sandbox:${methodKey}`);
      try {
        const result = await paymentService.createSandboxAddonCheckout(
          quantity,
          methodKey,
        );
        openCheckoutResult(result, t("subscription.sandboxAddon.title"));
      } catch {
        // TODO: toast error
      } finally {
        setLoadingKey(null);
      }
    },
    [loadingKey, t, openCheckoutResult],
  );

  const handleFullAccessQR = useCallback(
    async (methodKey: string) => {
      if (loadingKey) return;
      setLoadingKey(`fullaccess:${methodKey}`);
      try {
        const result = await paymentService.createFullAccessCheckout(methodKey);
        openCheckoutResult(result, t("subscription.fullAccess.title"));
      } catch {
        // TODO: toast error
      } finally {
        setLoadingKey(null);
      }
    },
    [loadingKey, t, openCheckoutResult],
  );

  return (
    <>
      <SheetModal isOpen={isOpen} onClose={onClose} size="lg">
        <div className="flex h-full flex-col overflow-hidden">
          {/* Mobile title */}
          <div className="shrink-0 px-5 pb-1 pt-6 md:px-6 md:pt-4">
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white md:text-lg">
              {t("subscription.title")}
            </h2>
          </div>
          {/* Scrollable content */}
          <div className="relative flex-1 overflow-y-auto custom-scrollbar px-4 py-2 sm:px-6">
            <div className="space-y-4">
              <Tabs defaultValue={defaultTab} key={defaultTab}>
                {showTabsList && (
                  <TabsList className="mx-auto w-fit">
                    <TabsTrigger
                      value="subscription"
                      className="gap-1.5 px-3 text-xs sm:gap-2 sm:px-5 sm:text-sm"
                    >
                      <SparklesIcon className="h-4 w-4" />
                      {t("subscription.mySubscription")}
                    </TabsTrigger>
                    <TabsTrigger
                      value={regionTab}
                      className="gap-1.5 px-3 text-xs sm:gap-2 sm:px-5 sm:text-sm"
                    >
                      <GlobeAltIcon className="h-4 w-4" />
                      {t("subscription.plans")}
                    </TabsTrigger>
                  </TabsList>
                )}

                <TabsContents>
                  {hasPaidSub && (
                    <TabsContent value="subscription">
                      <MySubscriptionTab />
                    </TabsContent>
                  )}

                  <TabsContent value={regionTab}>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.25 }}
                      className="mt-4 space-y-4"
                    >
                      {catalogLoading ? (
                        <div className="flex items-center justify-center py-16">
                          <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-indigo-500" />
                        </div>
                      ) : (
                        <>
                          {!paymentEnabled && (
                            <motion.div
                              initial={{ opacity: 0, y: -6 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="rounded-lg bg-amber-50/80 px-4 py-3 text-center text-[13px] text-amber-700 dark:bg-amber-950/20 dark:text-amber-400"
                            >
                              {t("subscription.betaNotice")}
                            </motion.div>
                          )}
                          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
                            {regionPlans.map((plan, index) => (
                              <PlanCard
                                key={plan.planKey}
                                plan={plan}
                                index={index}
                                paymentMethods={methods}
                                loadingMethodKey={cardLoading(
                                  `plan:${plan.planKey}`,
                                )}
                                paymentEnabled={paymentEnabled}
                                onSubscribeQR={handleSubscribeQR}
                              />
                            ))}
                          </div>
                          {catalog?.topup_rates[0] && (
                            <TopUpCard
                              displayRate={catalog.topup_rates[0].display_rate}
                              paymentMethods={methods}
                              loadingMethodKey={cardLoading("topup")}
                              delay={0.3}
                              creditsPerUnit={
                                catalog.topup_rates[0].credits_per_unit
                              }
                              unitAmount={catalog.topup_rates[0].unit_amount}
                              currency={catalog.topup_rates[0].currency}
                              paymentEnabled={paymentEnabled}
                              onQRCheckout={handleTopUpQR}
                            />
                          )}
                          {catalog?.sandbox_addon_rates[0] && (
                            <SandboxPackCard
                              displayRate={
                                catalog.sandbox_addon_rates[0].display_rate
                              }
                              paymentMethods={methods}
                              loadingMethodKey={cardLoading("sandbox")}
                              delay={0.35}
                              minPlan={catalog.sandbox_addon_rates[0].min_plan}
                              userPlan={roleName ?? "free"}
                              paymentEnabled={paymentEnabled}
                              onQRCheckout={handleSandboxAddonQR}
                            />
                          )}
                          {catalog?.full_access_pass_rates[0] && (
                            <FullAccessCard
                              displayPrice={
                                catalog.full_access_pass_rates[0].display_price
                              }
                              paymentMethods={methods}
                              loadingMethodKey={cardLoading("fullaccess")}
                              delay={0.4}
                              expiresAt={
                                subInfo?.subQuery.data?.subscription
                                  ?.full_model_access_expires_at
                              }
                              paymentEnabled={paymentEnabled}
                              onQRCheckout={handleFullAccessQR}
                            />
                          )}
                          {isChina && (
                            <motion.p
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: 0.35 }}
                              className="text-center text-xs text-neutral-500 dark:text-neutral-400"
                            >
                              {t("subscription.notInteroperable")}
                            </motion.p>
                          )}
                        </>
                      )}
                    </motion.div>
                  </TabsContent>
                </TabsContents>
              </Tabs>

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
                    {t("subscription.surveyTitle")}
                  </div>
                  <div className="text-xs text-indigo-600/70 dark:text-indigo-300/70">
                    {t("subscription.surveySubtitle")}
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
          <div className="shrink-0 flex justify-end border-t border-neutral-100 px-4 pt-3 pb-3 sm:px-6 dark:border-neutral-800">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={onClose}
              className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 focus:outline-none dark:bg-indigo-600 dark:hover:bg-indigo-500"
            >
              {t("subscription.gotIt")}
            </motion.button>
          </div>
        </div>
      </SheetModal>

      <PaymentQRModal
        isOpen={qrModal.open}
        onClose={() => setQrModal((prev) => ({ ...prev, open: false }))}
        orderId={qrModal.orderId}
        qrCodeUrl={qrModal.qrCodeUrl}
        amount={qrModal.amount}
        currency={qrModal.currency}
        planName={qrModal.planName}
        onSuccess={handlePaymentSuccess}
      />
    </>
  );
}

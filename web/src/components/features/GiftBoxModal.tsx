import { SheetModal } from "@/components/animate-ui/components/animate/sheet-modal";
import { cn } from "@/lib/utils";
import {
  giftService,
  type CampaignStatusResponse,
  type ClaimResultResponse,
  type Milestone,
} from "@/service/giftService";
import { useXyzen } from "@/store";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Crown, Gift, Sparkles, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type Phase = "ready" | "opening" | "revealed";

interface GiftBoxModalProps {
  campaign: CampaignStatusResponse;
  isOpen: boolean;
  onClose: () => void;
  onClaimed: () => void;
}

/* ---------- particle burst config ---------- */
const PARTICLE_COUNT = 14;
const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
  const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
  const distance = 60 + Math.random() * 50;
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    size: 3 + Math.random() * 4,
    delay: Math.random() * 0.15,
    color: ["bg-amber-400", "bg-indigo-400", "bg-rose-400", "bg-emerald-400"][
      i % 4
    ],
  };
});

/* ---------- milestone tier display names ---------- */
const TIER_KEY_MAP: Record<string, string> = {
  standard_unlock: "gift.giftBox.tierStandard",
  pro_unlock: "gift.giftBox.tierPro",
  ultra_unlock: "gift.giftBox.tierUltra",
};

function MilestoneStepper({
  milestones,
  consecutiveDays,
  t,
}: {
  milestones: Milestone[];
  consecutiveDays: number;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <div className="flex w-full flex-col gap-0">
      {milestones.map((ms, idx) => {
        const reached = consecutiveDays >= ms.consecutive_day;
        const isLast = idx === milestones.length - 1;

        return (
          <div key={ms.milestone_name} className="flex items-stretch gap-3">
            {/* Vertical line + circle */}
            <div className="flex w-5 flex-col items-center">
              {/* Circle */}
              <div
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors",
                  reached
                    ? "bg-green-500 dark:bg-green-500"
                    : "bg-neutral-200 dark:bg-neutral-700",
                )}
              >
                {reached && <Check className="h-3 w-3 text-white" />}
              </div>
              {/* Connecting line */}
              {!isLast && (
                <div
                  className={cn(
                    "w-px flex-1 min-h-[20px]",
                    reached
                      ? "bg-green-400/60 dark:bg-green-500/40"
                      : "bg-neutral-200 dark:bg-neutral-700",
                  )}
                />
              )}
            </div>

            {/* Label */}
            <div className="flex flex-col pb-3">
              <span
                className={cn(
                  "text-[13px] font-medium",
                  reached
                    ? "text-neutral-800 dark:text-neutral-100"
                    : "text-neutral-400 dark:text-neutral-500",
                )}
              >
                {t("gift.giftBox.dayN", { day: ms.consecutive_day })}
                {" — "}
                {t(TIER_KEY_MAP[ms.milestone_name] ?? ms.milestone_name)}
              </span>
              {ms.access_days > 0 && (
                <span className="text-xs text-neutral-400 dark:text-neutral-500">
                  {t("gift.giftBox.ultraAccess")}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function GiftBoxModal({
  campaign,
  isOpen,
  onClose,
  onClaimed,
}: GiftBoxModalProps) {
  const { t } = useTranslation();
  const fetchWallet = useXyzen((s) => s.fetchWallet);
  const [phase, setPhase] = useState<Phase>("ready");
  const [claimResult, setClaimResult] = useState<ClaimResultResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const openingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPhase("ready");
      setClaimResult(null);
      setError(null);
    }
    return () => {
      if (openingTimerRef.current) clearTimeout(openingTimerRef.current);
    };
  }, [isOpen]);

  const handleOpen = useCallback(async () => {
    if (phase !== "ready") return;
    setPhase("opening");
    setError(null);

    try {
      const result = await giftService.claimGift(campaign.id);
      setClaimResult(result);
      fetchWallet();
      // Wait for particle animation to finish
      openingTimerRef.current = setTimeout(() => {
        setPhase("revealed");
      }, 1200);
    } catch {
      setError("Claim failed. Please try again.");
      setPhase("ready");
    }
  }, [phase, campaign.id, fetchWallet]);

  const handleDismiss = useCallback(() => {
    if (claimResult) onClaimed();
    onClose();
  }, [claimResult, onClaimed, onClose]);

  const nextDay = campaign.total_claims + 1;
  const streakLabel = t("gift.giftBox.streak", {
    current: nextDay,
    total: campaign.total_days,
  });

  return (
    <SheetModal isOpen={isOpen} onClose={handleDismiss} size="sm">
      {/* Decorative gradient backdrop */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-20 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-amber-400/10 blur-3xl dark:bg-amber-500/[0.07]" />
        <div className="absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-indigo-400/10 blur-3xl dark:bg-indigo-500/[0.07]" />
      </div>

      {/* Header */}
      <div className="relative shrink-0 border-b border-neutral-200/60 px-5 pb-3 pt-5 dark:border-neutral-800/60">
        <h2 className="text-center text-lg font-semibold text-neutral-800 dark:text-neutral-100">
          {t("gift.giftBox.title")}
        </h2>
        <p className="mt-0.5 text-center text-xs text-neutral-400 dark:text-neutral-500">
          {streakLabel}
        </p>
      </div>

      {/* Content */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-5 py-8">
        <AnimatePresence mode="wait">
          {/* ── READY phase ── */}
          {phase === "ready" && (
            <motion.div
              key="ready"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center gap-5"
            >
              {/* Gift box icon with wobble */}
              <motion.div
                animate={{
                  rotate: [0, -6, 6, -4, 4, 0],
                }}
                transition={{
                  duration: 1.6,
                  repeat: Infinity,
                  repeatDelay: 1.2,
                  ease: "easeInOut",
                }}
                className="flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-amber-200/80 shadow-lg shadow-amber-200/30 dark:from-amber-900/40 dark:to-amber-800/30 dark:shadow-amber-900/20"
              >
                <Gift className="h-12 w-12 text-amber-600 dark:text-amber-400" />
              </motion.div>

              {/* Milestone stepper */}
              {campaign.milestones && campaign.milestones.length > 0 ? (
                <div className="w-full rounded-lg bg-neutral-100/60 px-4 py-3 dark:bg-white/[0.04]">
                  <MilestoneStepper
                    milestones={campaign.milestones}
                    consecutiveDays={campaign.consecutive_days}
                    t={t}
                  />
                </div>
              ) : (
                /* Fallback progress bar for campaigns without milestones */
                <div className="w-full max-w-[200px]">
                  <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200/60 dark:bg-white/[0.06]">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-amber-400 to-indigo-500"
                      initial={{ width: 0 }}
                      animate={{
                        width: `${(campaign.total_claims / campaign.total_days) * 100}%`,
                      }}
                      transition={{ duration: 0.6, delay: 0.2 }}
                    />
                  </div>
                </div>
              )}

              {/* Daily credits badge */}
              <div className="flex items-center gap-1.5 rounded-full bg-amber-50/80 px-3 py-1 dark:bg-amber-950/20">
                <Zap className="h-3 w-3 text-amber-500 dark:text-amber-400" />
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  {t("gift.giftBox.dailyCredits")}
                </span>
              </div>

              {error && (
                <p className="text-xs text-red-500 dark:text-red-400">
                  {error}
                </p>
              )}
            </motion.div>
          )}

          {/* ── OPENING phase ── */}
          {phase === "opening" && (
            <motion.div
              key="opening"
              initial={{ opacity: 1 }}
              className="relative flex flex-col items-center"
            >
              {/* Particle burst */}
              {PARTICLES.map((p, i) => (
                <motion.div
                  key={i}
                  className={cn("absolute rounded-full", p.color)}
                  style={{ width: p.size, height: p.size }}
                  initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
                  animate={{
                    x: p.x,
                    y: p.y,
                    opacity: [1, 1, 0],
                    scale: [0, 1.2, 0.5],
                  }}
                  transition={{
                    duration: 0.9,
                    delay: p.delay,
                    ease: "easeOut",
                  }}
                />
              ))}

              {/* Gift icon scaling up */}
              <motion.div
                animate={{ scale: [1, 1.3, 0.2], opacity: [1, 1, 0] }}
                transition={{ duration: 1, ease: "easeInOut" }}
                className="flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-amber-200/80 shadow-lg shadow-amber-200/30 dark:from-amber-900/40 dark:to-amber-800/30 dark:shadow-amber-900/20"
              >
                <Gift className="h-12 w-12 text-amber-600 dark:text-amber-400" />
              </motion.div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="mt-4 text-[13px] text-neutral-400"
              >
                {t("gift.giftBox.claiming")}
              </motion.p>
            </motion.div>
          )}

          {/* ── REVEALED phase ── */}
          {phase === "revealed" && claimResult && (
            <motion.div
              key="revealed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="flex w-full flex-col items-center gap-4"
            >
              {/* Sparkle icon */}
              <motion.div
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 18,
                }}
              >
                <Sparkles className="h-10 w-10 text-amber-500 dark:text-amber-400" />
              </motion.div>

              <p className="text-[13px] text-neutral-500 dark:text-neutral-400">
                {t("gift.giftBox.enjoy")}
              </p>

              {/* Credits reward card */}
              {claimResult.reward.credits > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="flex w-full items-center gap-3 rounded-lg bg-neutral-100/60 p-4 dark:bg-white/[0.04]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50/80 dark:bg-amber-950/30">
                    <Zap className="h-5 w-5 text-amber-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[15px] font-semibold text-neutral-800 dark:text-neutral-100">
                      {t("gift.giftBox.credits", {
                        amount: claimResult.reward.credits,
                      })}
                    </p>
                    <p className="text-xs text-neutral-400 dark:text-neutral-500">
                      Day {claimResult.day_number}
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Milestone unlock card */}
              {claimResult.reward.milestone_reached && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="flex w-full items-center gap-3 rounded-lg bg-green-50/80 p-4 dark:bg-green-950/30"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100/80 dark:bg-green-900/30">
                    <Crown className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold text-green-700 dark:text-green-300">
                      {t(
                        `gift.milestones.${claimResult.reward.milestone_name}`,
                      )}
                    </p>
                    {claimResult.reward.full_model_access_days > 0 && (
                      <p className="text-xs text-green-600/70 dark:text-green-400/70">
                        {t("gift.giftBox.fullModelAccess", {
                          days: claimResult.reward.full_model_access_days,
                        })}
                      </p>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Streak badge */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.45 }}
                className="flex items-center gap-1.5 rounded-full bg-indigo-50/80 px-3 py-1 dark:bg-indigo-950/30"
              >
                <Zap className="h-3 w-3 text-indigo-500 dark:text-indigo-400" />
                <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                  {t("gift.giftBox.consecutiveDays", {
                    days: claimResult.consecutive_days,
                  })}
                </span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="relative shrink-0 border-t border-neutral-200/60 px-5 py-4 dark:border-neutral-800/60">
        <div className="flex justify-center">
          {phase === "ready" && (
            <button
              onClick={handleOpen}
              className="w-full rounded-lg bg-indigo-500 px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-indigo-600 dark:hover:bg-indigo-400"
            >
              {t("gift.giftBox.openGift")}
            </button>
          )}
          {phase === "revealed" && (
            <button
              onClick={handleDismiss}
              className="w-full rounded-lg bg-neutral-100/80 px-5 py-2.5 text-[13px] font-medium text-neutral-700 transition-colors hover:bg-neutral-200/80 dark:bg-white/[0.06] dark:text-neutral-300 dark:hover:bg-white/[0.1]"
            >
              {t("gift.giftBox.dismiss")}
            </button>
          )}
        </div>
      </div>
    </SheetModal>
  );
}

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { memo } from "react";
import { useTranslation } from "react-i18next";

interface ContextUsageRingProps {
  tokenUsage: number;
  modelTier: string | null;
}

const TIER_LIMITS: Record<string, number> = {
  lite: 256_000,
  standard: 1_000_000,
  pro: 1_000_000,
  ultra: 1_000_000,
};

const SIZE = 18;
const STROKE = 2;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function getColor(remainingPct: number): string {
  if (remainingPct > 0.5) return "#22c55e"; // green-500
  if (remainingPct > 0.2) return "#eab308"; // yellow-500
  return "#ef4444"; // red-500
}

function formatTokens(n: number): string {
  return n.toLocaleString();
}

const ContextUsageRing = memo(function ContextUsageRing({
  tokenUsage,
  modelTier,
}: ContextUsageRingProps) {
  const { t } = useTranslation();

  const limit = TIER_LIMITS[modelTier ?? ""] ?? TIER_LIMITS.standard;
  const usedPct = Math.min(tokenUsage / limit, 1);
  const remainingPct = 1 - usedPct;
  const offset = CIRCUMFERENCE * (1 - usedPct);
  const color = getColor(remainingPct);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center p-2 -m-2 touch-manipulation"
        >
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="shrink-0"
          >
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={STROKE}
              className="text-neutral-200 dark:text-neutral-700"
            />
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={color}
              strokeWidth={STROKE}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={offset}
              strokeLinecap="round"
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" className="w-auto px-3 py-2">
        <p className="text-xs">
          {t("app.chatHeader.contextRemaining", {
            percent: Math.round(remainingPct * 100),
            defaultValue: "Context remaining: {{percent}}%",
          })}
        </p>
        <p className="text-[10px] opacity-60">
          {formatTokens(tokenUsage)} / {formatTokens(limit)}
        </p>
      </PopoverContent>
    </Popover>
  );
});

export default ContextUsageRing;

"use client";

import {
  ChevronDownIcon,
  CpuChipIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TierInfoModal } from "./TierInfoModal";

export type ModelTier = "ultra" | "pro" | "standard" | "lite";

interface TierSelectorProps {
  currentTier: ModelTier | null | undefined;
  onTierChange: (tier: ModelTier) => void;
  disabled?: boolean;
}

interface TierConfig {
  key: ModelTier;
  bgColor: string;
  textColor: string;
  dotColor: string;
  rate: number; // Consumption rate multiplier
}

const TIER_CONFIGS: TierConfig[] = [
  {
    key: "ultra",
    bgColor: "bg-purple-500/10 dark:bg-purple-500/20",
    textColor: "text-purple-700 dark:text-purple-400",
    dotColor: "bg-purple-500",
    rate: 6.8,
  },
  {
    key: "pro",
    bgColor: "bg-blue-500/10 dark:bg-blue-500/20",
    textColor: "text-blue-700 dark:text-blue-400",
    dotColor: "bg-blue-500",
    rate: 3.0,
  },
  {
    key: "standard",
    bgColor: "bg-green-500/10 dark:bg-green-500/20",
    textColor: "text-green-700 dark:text-green-400",
    dotColor: "bg-green-500",
    rate: 1.0,
  },
  {
    key: "lite",
    bgColor: "bg-orange-500/10 dark:bg-orange-500/20",
    textColor: "text-orange-700 dark:text-orange-400",
    dotColor: "bg-orange-500",
    rate: 0.0,
  },
];

export function TierSelector({
  currentTier,
  onTierChange,
  disabled = false,
}: TierSelectorProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);

  // Default to standard if no tier is selected
  const effectiveTier = currentTier || "standard";
  const currentConfig =
    TIER_CONFIGS.find((c) => c.key === effectiveTier) || TIER_CONFIGS[2];

  const handleTierClick = (tier: ModelTier) => {
    onTierChange(tier);
    setIsOpen(false);
  };

  // Format rate for display
  const formatRate = (rate: number): string => {
    if (rate === 0) return t("app.tierSelector.free");
    return t("app.tierSelector.rateFormat", { rate: rate.toFixed(1) });
  };

  return (
    <>
      <div
        className="relative"
        onMouseEnter={() => !disabled && setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
      >
        {/* Main Trigger Button */}
        <motion.button
          disabled={disabled}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${currentConfig.bgColor} ${currentConfig.textColor} ${isOpen ? "shadow-md" : "shadow-sm"} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          whileHover={disabled ? undefined : { scale: 1.02 }}
          whileTap={disabled ? undefined : { scale: 0.98 }}
          onClick={() => !disabled && setIsOpen(!isOpen)}
        >
          <CpuChipIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="max-w-32 truncate">
            {t(`app.tierSelector.tiers.${effectiveTier}.name`)}
          </span>
          <ChevronDownIcon
            className={`h-3 w-3 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </motion.button>

        {/* Dropdown */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-full left-0 mb-1 z-50 w-80 rounded-xl border border-neutral-200/60 bg-white/80 shadow-xl backdrop-blur-xl dark:border-neutral-700/50 dark:bg-neutral-900/80 p-2"
            >
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  {t("app.tierSelector.title")}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsInfoModalOpen(true);
                  }}
                  className="p-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                  title={t("app.tierSelector.infoModal.title")}
                >
                  <InformationCircleIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-1">
                {TIER_CONFIGS.map((config, index) => (
                  <motion.button
                    key={config.key}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03, duration: 0.2 }}
                    onClick={() => handleTierClick(config.key)}
                    className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors ${
                      effectiveTier === config.key
                        ? `${config.bgColor} ${config.textColor}`
                        : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    }`}
                  >
                    <div
                      className={`h-2 w-2 shrink-0 rounded-full ${config.dotColor}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm text-neutral-900 dark:text-neutral-100">
                          {t(`app.tierSelector.tiers.${config.key}.name`)}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                          {formatRate(config.rate)}
                        </span>
                      </div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        {t(`app.tierSelector.tiers.${config.key}.description`)}
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Tier Info Modal */}
      <TierInfoModal open={isInfoModalOpen} onOpenChange={setIsInfoModalOpen} />
    </>
  );
}

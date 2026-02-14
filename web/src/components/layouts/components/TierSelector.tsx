"use client";

import { zIndexClasses } from "@/constants/zIndex";
import {
  ChevronDownIcon,
  CpuChipIcon,
  InformationCircleIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { TierInfoModal } from "./TierInfoModal";

export type ModelTier = "ultra" | "pro" | "standard" | "lite";

const TIER_ORDER: ModelTier[] = ["lite", "standard", "pro", "ultra"];

// Mapping: which subscription plan name unlocks each tier
const TIER_REQUIRED_PLAN: Record<ModelTier, string> = {
  lite: "Free",
  standard: "Standard",
  pro: "Professional",
  ultra: "Ultra",
};

interface TierSelectorProps {
  currentTier: ModelTier | null | undefined;
  onTierChange: (tier: ModelTier) => void;
  disabled?: boolean;
  maxTier?: ModelTier;
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
  maxTier = "ultra",
}: TierSelectorProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const closeTimeout = useRef<ReturnType<typeof setTimeout>>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  // Debounced open/close to bridge the gap between trigger and portal dropdown
  const openDropdown = useCallback(() => {
    if (disabled) return;
    if (closeTimeout.current) {
      clearTimeout(closeTimeout.current);
      closeTimeout.current = null;
    }
    setIsOpen(true);
  }, [disabled]);

  const closeDropdown = useCallback(() => {
    closeTimeout.current = setTimeout(() => setIsOpen(false), 80);
  }, []);

  // Default to standard if no tier is selected
  const effectiveTier = currentTier || "standard";
  const currentConfig =
    TIER_CONFIGS.find((c) => c.key === effectiveTier) || TIER_CONFIGS[2];

  const maxTierIndex = TIER_ORDER.indexOf(maxTier);

  const isTierLocked = (tier: ModelTier): boolean => {
    return TIER_ORDER.indexOf(tier) > maxTierIndex;
  };

  const handleTierClick = (tier: ModelTier) => {
    if (isTierLocked(tier)) return;
    onTierChange(tier);
    setIsOpen(false);
  };

  // Format rate for display
  const formatRate = (rate: number): string => {
    if (rate === 0) return t("app.tierSelector.free");
    return t("app.tierSelector.rateFormat", { rate: rate.toFixed(1) });
  };

  // Position the portal dropdown above the trigger
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: "fixed",
      left: rect.left,
      bottom: window.innerHeight - rect.top + 4,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen, updatePosition]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      )
        return;
      setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  return (
    <>
      <div
        className="relative"
        onMouseEnter={openDropdown}
        onMouseLeave={closeDropdown}
      >
        {/* Main Trigger Button */}
        <motion.button
          ref={triggerRef}
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
      </div>

      {/* Portal dropdown — renders at body level so backdrop-blur works */}
      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              ref={dropdownRef}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className={`${zIndexClasses.popover} w-80 rounded-sm border border-neutral-200/60 bg-white/80 shadow-xl backdrop-blur-xl dark:border-neutral-700/50 dark:bg-neutral-900/80 p-2`}
              style={dropdownStyle}
              onMouseEnter={openDropdown}
              onMouseLeave={closeDropdown}
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
                {TIER_CONFIGS.map((config, index) => {
                  const locked = isTierLocked(config.key);
                  return (
                    <motion.button
                      key={config.key}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03, duration: 0.2 }}
                      onClick={() => handleTierClick(config.key)}
                      disabled={locked}
                      className={`group/tier flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors ${
                        locked
                          ? "cursor-not-allowed"
                          : effectiveTier === config.key
                            ? `${config.bgColor} ${config.textColor}`
                            : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      }`}
                    >
                      <div
                        className={`h-2 w-2 shrink-0 rounded-full ${locked ? "bg-neutral-300 dark:bg-neutral-600" : config.dotColor}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`font-medium text-sm flex items-center gap-1.5 ${locked ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-900 dark:text-neutral-100"}`}
                          >
                            {t(`app.tierSelector.tiers.${config.key}.name`)}
                            {locked && (
                              <LockClosedIcon className="h-3 w-3 text-neutral-300 dark:text-neutral-600" />
                            )}
                          </span>
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 ${
                              locked
                                ? "text-neutral-300 dark:text-neutral-600"
                                : "text-neutral-600 dark:text-neutral-400"
                            }`}
                          >
                            {formatRate(config.rate)}
                          </span>
                        </div>
                        <div
                          className={`text-xs ${locked ? "text-neutral-300 dark:text-neutral-600" : "text-neutral-500 dark:text-neutral-400"}`}
                        >
                          {/* Default: description. Hover: upgrade hint */}
                          <span
                            className={locked ? "group-hover/tier:hidden" : ""}
                          >
                            {t(
                              `app.tierSelector.tiers.${config.key}.description`,
                            )}
                          </span>
                          {locked && (
                            <span className="hidden group-hover/tier:inline text-neutral-400 dark:text-neutral-500">
                              {t("app.tierSelector.locked", {
                                plan: TIER_REQUIRED_PLAN[config.key],
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {/* Tier Info Modal */}
      <TierInfoModal open={isInfoModalOpen} onOpenChange={setIsInfoModalOpen} />
    </>
  );
}

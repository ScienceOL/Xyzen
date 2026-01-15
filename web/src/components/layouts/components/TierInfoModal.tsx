"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface TierInfoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Tier configuration with models
interface TierInfo {
  key: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
  rate: number;
  models: ModelInfo[];
}

interface ModelInfo {
  name: string;
  provider: "anthropic" | "openai" | "google" | "qwen" | "deepseek";
  hasImageGen?: boolean;
}

const PROVIDER_COLORS: Record<string, { bg: string; text: string }> = {
  anthropic: {
    bg: "bg-orange-100 dark:bg-orange-900/30",
    text: "text-orange-700 dark:text-orange-400",
  },
  openai: {
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  google: {
    bg: "bg-blue-100 dark:bg-blue-900/30",
    text: "text-blue-700 dark:text-blue-400",
  },
  qwen: {
    bg: "bg-purple-100 dark:bg-purple-900/30",
    text: "text-purple-700 dark:text-purple-400",
  },
  deepseek: {
    bg: "bg-cyan-100 dark:bg-cyan-900/30",
    text: "text-cyan-700 dark:text-cyan-400",
  },
};

const TIERS: TierInfo[] = [
  {
    key: "ultra",
    icon: "👑",
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-900/20",
    borderColor: "border-purple-200 dark:border-purple-800",
    rate: 6.8,
    models: [
      { name: "Claude Opus 4.5", provider: "anthropic" },
      { name: "GPT-5.2 Pro", provider: "openai" },
      { name: "GPT-5 Pro", provider: "openai" },
    ],
  },
  {
    key: "pro",
    icon: "💼",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-900/20",
    borderColor: "border-blue-200 dark:border-blue-800",
    rate: 3.0,
    models: [
      { name: "Claude Sonnet 4.5", provider: "anthropic" },
      { name: "Gemini 3 Pro", provider: "google" },
      { name: "Qwen3 Max", provider: "qwen" },
      { name: "GPT-5.2", provider: "openai" },
    ],
  },
  {
    key: "standard",
    icon: "☕",
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-900/20",
    borderColor: "border-green-200 dark:border-green-800",
    rate: 1.0,
    models: [
      { name: "Gemini 3 Flash", provider: "google" },
      { name: "DeepSeek V3.1", provider: "deepseek" },
      { name: "GPT-5 Mini", provider: "openai" },
    ],
  },
  {
    key: "lite",
    icon: "🧠",
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-900/20",
    borderColor: "border-orange-200 dark:border-orange-800",
    rate: 0.0,
    models: [
      { name: "Qwen3 30B A3B", provider: "qwen" },
      { name: "Gemini 2.5 Flash Lite", provider: "google" },
      { name: "GPT-5 Nano", provider: "openai" },
    ],
  },
];

export function TierInfoModal({ open, onOpenChange }: TierInfoModalProps) {
  const { t } = useTranslation();

  const formatRate = (rate: number): string => {
    if (rate === 0) return t("app.tierSelector.free");
    return `${rate}x`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1150px] max-w-[1150px] w-[95vw] lg:w-[90vw] h-[85vh] max-h-[850px] p-0 gap-0 overflow-hidden bg-background/95 backdrop-blur-xl border-none shadow-2xl flex flex-col">
        <DialogHeader className="px-8 py-5 border-b bg-muted/30 shrink-0">
          <DialogTitle className="text-xl font-bold flex items-center gap-3">
            <span className="text-2xl">📊</span>
            {t("app.tierSelector.infoModal.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-x-auto overflow-y-auto p-8 bg-dot-pattern">
          <div className="min-w-[900px] flex flex-col gap-6 relative pb-4">
            {TIERS.map((tier, index) => (
              <div key={tier.key} className="relative group">
                {/* Dashed Connector Line */}
                {index !== TIERS.length - 1 && (
                  <div className="absolute left-[46px] top-[50%] bottom-[-50%] w-[2px] border-l-2 border-dashed border-muted-foreground/15 z-0" />
                )}

                <div className="flex items-center gap-8 relative z-10 p-1">
                  {/* 1. Identity Component */}
                  <div className="w-[360px] shrink-0">
                    <div
                      className={cn(
                        "flex items-center gap-4 p-4 pr-6 rounded-3xl border-2 bg-card shadow-sm transition-all hover:shadow-lg hover:-translate-y-1 group-hover:border-primary/10",
                        tier.borderColor,
                      )}
                    >
                      <div
                        className={cn(
                          "flex items-center justify-center w-14 h-14 rounded-2xl text-2xl bg-muted/10 shrink-0",
                          tier.color,
                        )}
                      >
                        {tier.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3
                          className={cn("font-bold text-xl mb-1", tier.color)}
                        >
                          {t(`app.tierSelector.tiers.${tier.key}.name`)}
                        </h3>
                        <p className="text-xs text-muted-foreground leading-snug line-clamp-2">
                          {t(`app.tierSelector.tiers.${tier.key}.description`)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="text-muted-foreground/15 text-3xl font-light">
                    →
                  </div>

                  {/* 2. Rate Component */}
                  <div className="w-[180px] shrink-0 flex justify-center">
                    <div
                      className={cn(
                        "relative flex flex-col items-center justify-center w-full py-4 px-3 rounded-3xl border-2 bg-background shadow-sm group-hover:shadow-md transition-shadow",
                        tier.borderColor,
                      )}
                    >
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest opacity-60 mb-1">
                        Multiplier
                      </span>
                      <span
                        className={cn(
                          "text-2xl font-black tabular-nums tracking-tighter",
                          tier.color,
                        )}
                      >
                        {formatRate(tier.rate)}
                      </span>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="text-muted-foreground/15 text-3xl font-light">
                    →
                  </div>

                  {/* 3. Models Component */}
                  <div className="flex-1 min-w-[300px]">
                    <div
                      className={cn(
                        "rounded-[2rem] p-5 border-2 border-dashed border-spacing-6 flex flex-wrap items-center gap-2.5 bg-muted/5 transition-colors group-hover:bg-muted/10 h-full min-h-[88px]",
                        tier.borderColor,
                      )}
                    >
                      {tier.models.map((model, idx) => {
                        const providerStyle = PROVIDER_COLORS[
                          model.provider
                        ] || {
                          bg: "bg-gray-100",
                          text: "text-gray-700",
                        };
                        return (
                          <div
                            key={idx}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border shadow-sm bg-background hover:scale-105 transition-transform cursor-default",
                              providerStyle.text,
                              "border-black/5 dark:border-white/5",
                            )}
                          >
                            <div
                              className={cn(
                                "w-2 h-2 rounded-full",
                                providerStyle.bg.replace("/30", ""),
                              )}
                            />
                            <span>{model.name}</span>
                            {model.hasImageGen && (
                              <span
                                title={t("app.tierSelector.infoModal.imageGen")}
                                className="text-sm opacity-80 ml-1"
                              >
                                📷
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 bg-muted/40 border-t flex items-center justify-between text-xs text-muted-foreground shrink-0">
          <div className="opacity-50">
            {t("app.tierSelector.infoModal.disclaimer")}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { HoleBackground } from "@/components/animate-ui/components/backgrounds/hole";
import {
  DeepSeekIcon,
  GeminiIcon,
  QwenIcon,
} from "@/components/icons/LlmIcons";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Bot, Brain, Check, Code2, Cpu, Sparkles, Zap } from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { SiAnthropic, SiOpenai } from "react-icons/si";

interface TierInfoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Provider icons as simple SVG components (High quality specific brand icons)
const ProviderIcon = ({
  provider,
  className,
}: {
  provider: string;
  className?: string;
}) => {
  const icons: Record<string, React.ReactElement> = {
    anthropic: <SiAnthropic className={className} />,
    openai: <SiOpenai className={className} />,
    google: <GeminiIcon className={className} />,
    qwen: <QwenIcon className={className} />,
    deepseek: <DeepSeekIcon className={className} />,
    glm: (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor">
        <path d="M12 2L2 12l10 10 10-10L12 2zm0 18l-8-8 8-8 8 8-8 8z" />
      </svg>
    ),
  };
  return icons[provider] || <Bot className={className} />;
};

// Tier configuration with models
interface TierInfo {
  key: string;
  icon: React.ReactElement;
  rate: string;
  speed: number; // 0-100
  reasoning: number; // 0-100
  speedLabelKey: string;
  reasoningLabelKey: string;
  featureKeys: string[];
  models: ModelInfo[];
  gradient?: string;
  accentColor: string;
  buttonStyle: string;
  recommended?: boolean;
}

interface ModelInfo {
  name: string;
  provider: "anthropic" | "openai" | "google" | "qwen" | "deepseek" | "glm";
}

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "text-orange-500",
  openai: "text-emerald-500",
  google: "text-blue-500",
  qwen: "text-purple-500",
  deepseek: "text-cyan-500",
  glm: "text-indigo-500",
};

const TIERS: TierInfo[] = [
  {
    key: "lite",
    icon: <Sparkles className="w-5 h-5" />,
    rate: "0.0x",
    speed: 95,
    reasoning: 35,
    speedLabelKey: "ultraFast",
    reasoningLabelKey: "basic",
    accentColor: "text-amber-500",
    buttonStyle: "bg-surface-200",
    featureKeys: ["quickTranslation", "textSummary", "simpleQA"],
    models: [
      { name: "Gemini 2.5 Flash-Lite", provider: "google" },
      { name: "Qwen3 30B A3B", provider: "qwen" },
      { name: "GPT-5 Nano", provider: "openai" },
    ],
  },
  {
    key: "standard",
    icon: <Bot className="w-5 h-5" />,
    rate: "1.0x",
    speed: 80,
    reasoning: 75,
    speedLabelKey: "fast",
    reasoningLabelKey: "standard",
    accentColor: "text-blue-500",
    buttonStyle: "bg-blue-600 hover:bg-blue-500",
    featureKeys: ["dailyChat", "emailWriting", "knowledgeQA"],
    models: [
      { name: "Claude Haiku 4.5", provider: "anthropic" },
      { name: "DeepSeek V3.2", provider: "deepseek" },
      { name: "Gemini 3 Flash", provider: "google" },
      { name: "GPT-5 Mini", provider: "openai" },
    ],
  },
  {
    key: "pro",
    icon: <Code2 className="w-5 h-5" />,
    rate: "3.0x",
    speed: 65,
    reasoning: 90,
    speedLabelKey: "moderate",
    reasoningLabelKey: "excellent",
    accentColor: "text-violet-500",
    buttonStyle: "bg-violet-600 hover:bg-violet-500",
    recommended: true,
    featureKeys: ["pdfAnalysis", "codeWriting", "taskPlanning"],
    models: [
      { name: "Claude Sonnet 4.5", provider: "anthropic" },
      { name: "Gemini 3 Pro", provider: "google" },
      { name: "GPT-5.2", provider: "openai" },
      { name: "Qwen3 Max", provider: "qwen" },
    ],
  },
  {
    key: "ultra",
    icon: <Brain className="w-5 h-5" />,
    rate: "6.8x",
    speed: 30,
    reasoning: 100,
    speedLabelKey: "thinking",
    reasoningLabelKey: "max",
    accentColor: "text-purple-400",
    gradient:
      "from-purple-500/10 to-pink-500/10 dark:from-purple-900/40 dark:to-pink-900/40",
    buttonStyle:
      "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500",
    featureKeys: ["deepReasoning", "academicAnalysis", "mathSolving"],
    models: [
      { name: "Claude Opus 4.5", provider: "anthropic" },
      { name: "GPT-5.2 Pro", provider: "openai" },
    ],
  },
];

export function TierInfoModal({ open, onOpenChange }: TierInfoModalProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1400px] w-[95vw] h-[90vh] p-0 gap-0 overflow-hidden bg-white/90 dark:bg-black/80 border border-zinc-200 dark:border-white/10 shadow-2xl backdrop-blur-3xl">
        <HoleBackground className="absolute inset-0 z-0 opacity-20 dark:opacity-80 pointer-events-none" />

        <div className="relative z-10 flex flex-col h-full bg-white/40 dark:bg-black/40 backdrop-blur-sm rounded-xl overflow-hidden">
          {/* Header */}
          <div className="px-8 py-6 border-b border-zinc-200 dark:border-white/10 bg-white/60 dark:bg-white/5 backdrop-blur-md z-20 sticky top-0">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
              <div>
                <DialogTitle className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
                  <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 dark:from-blue-400 dark:via-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
                    {t("app.tierSelector.infoModal.title")}
                  </span>
                </DialogTitle>
                <p className="text-zinc-500 dark:text-white/60 text-sm mt-1 max-w-2xl font-light">
                  {t("app.tierSelector.infoModal.subtitle")}
                </p>
              </div>
            </div>
          </div>

          {/* Cards Grid - Added flex-1 and min-h-0 to fix overflow and spacing */}
          <div className="flex-1 p-6 md:p-8 overflow-y-auto min-h-0">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
              {TIERS.map((tier, index) => (
                <motion.div
                  key={tier.key}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1, duration: 0.4 }}
                  className={cn(
                    "group relative flex flex-col rounded-2xl border p-5 transition-all duration-300",
                    tier.recommended
                      ? "border-violet-500/50 bg-violet-50/50 dark:bg-violet-900/10 shadow-[0_0_20px_-5px_rgba(139,92,246,0.2)]"
                      : "border-zinc-200 dark:border-white/10 bg-white/50 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 hover:border-zinc-300 dark:hover:border-white/20",
                    tier.gradient && `bg-gradient-to-br ${tier.gradient}`,
                  )}
                >
                  {tier.recommended && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-violet-500 text-white text-[10px] uppercase font-bold tracking-wider rounded-full shadow-lg">
                      {t("common.recommended", "Recommended")}
                    </div>
                  )}

                  {/* Header */}
                  <div className="flex items-center justify-between mb-4 pb-4 border-b border-zinc-100 dark:border-white/10">
                    <div
                      className={cn(
                        "p-2 rounded-lg bg-zinc-100 dark:bg-white/5 md:mx-0",
                        tier.accentColor,
                      )}
                    >
                      {tier.icon}
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-zinc-900 dark:text-white">
                        {tier.rate}
                      </div>
                      <div className="text-[10px] text-zinc-500 dark:text-white/50 uppercase tracking-widest font-semibold">
                        {t("app.tierSelector.multiplier", "Multiplier")}
                      </div>
                    </div>
                  </div>

                  <div className="text-center md:text-left mb-4">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                      {t(`app.tierSelector.tiers.${tier.key}.name`)}
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-white/60 mt-1 min-h-[2.5em]">
                      {t(`app.tierSelector.tiers.${tier.key}.description`)}
                    </p>
                  </div>

                  {/* Stats */}
                  <div className="space-y-4 mb-6 bg-zinc-100/50 dark:bg-black/20 p-3 rounded-xl border border-zinc-200 dark:border-white/5">
                    {/* Speed */}
                    <div className="group/stat">
                      <div className="flex justify-between text-[11px] text-zinc-500 dark:text-white/60 mb-1.5">
                        <span className="flex items-center gap-1.5">
                          <Zap className="w-3 h-3 text-amber-500 dark:text-amber-400" />{" "}
                          {t("app.tierSelector.infoModal.speed")}
                        </span>
                        <span className="text-zinc-700 dark:text-white/80 font-mono">
                          {t(
                            `app.tierSelector.speedLabels.${tier.speedLabelKey}`,
                          )}
                        </span>
                      </div>
                      <div className="h-1 bg-zinc-200 dark:bg-white/10 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${tier.speed}%` }}
                          transition={{ delay: 0.5 + index * 0.1, duration: 1 }}
                          className="h-full bg-gradient-to-r from-amber-400 to-orange-400 rounded-full"
                        />
                      </div>
                    </div>
                    {/* Reasoning */}
                    <div className="group/stat">
                      <div className="flex justify-between text-[11px] text-zinc-500 dark:text-white/60 mb-1.5">
                        <span className="flex items-center gap-1.5">
                          <Cpu className="w-3 h-3 text-blue-500 dark:text-blue-400" />{" "}
                          {t("app.tierSelector.infoModal.reasoning")}
                        </span>
                        <span className="text-zinc-700 dark:text-white/80 font-mono">
                          {t(
                            `app.tierSelector.reasoningLabels.${tier.reasoningLabelKey}`,
                          )}
                        </span>
                      </div>
                      <div className="h-1 bg-zinc-200 dark:bg-white/10 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${tier.reasoning}%` }}
                          transition={{ delay: 0.7 + index * 0.1, duration: 1 }}
                          className="h-full bg-gradient-to-r from-blue-400 to-indigo-400 rounded-full"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Features */}
                  <div className="space-y-2 mb-6 flex-grow">
                    {tier.featureKeys.map((featureKey, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2.5 text-xs text-zinc-600 dark:text-white/70"
                      >
                        <Check
                          className={cn(
                            "w-3.5 h-3.5 shrink-0 mt-0.5",
                            tier.key === "ultra"
                              ? "text-pink-500 dark:text-pink-400"
                              : "text-blue-500 dark:text-blue-400",
                          )}
                        />
                        <span className="leading-tight">
                          {t(`app.tierSelector.features.${featureKey}`)}
                        </span>
                      </li>
                    ))}
                  </div>

                  {/* Models */}
                  <div className="mt-auto pt-5 border-t border-zinc-100 dark:border-white/10">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-white/40 font-semibold mb-3">
                      {t(
                        "app.tierSelector.infoModal.availableModels",
                        "Included Models",
                      )}
                    </p>
                    <div className="flex flex-col gap-2">
                      {tier.models.map((model, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-100 dark:border-white/5 hover:bg-zinc-100 dark:hover:bg-white/10 hover:border-zinc-200 dark:hover:border-white/10 transition-all group/model"
                        >
                          <ProviderIcon
                            provider={model.provider}
                            className={cn(
                              "w-4 h-4 shrink-0 transition-transform group-hover/model:scale-110",
                              PROVIDER_COLORS[model.provider],
                            )}
                          />
                          <span className="text-xs font-medium text-zinc-700 dark:text-white/90">
                            {model.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
          {/* Footer */}
          <div className="px-8 py-4 bg-zinc-50 dark:bg-black/20 border-t border-zinc-200 dark:border-white/10 text-center text-xs text-zinc-400 dark:text-white/40">
            {t("app.tierSelector.infoModal.disclaimer")}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import type { MessageError } from "@/store/types";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  CloudOff,
  CreditCard,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

const categoryIcons: Record<string, typeof AlertTriangle> = {
  provider: CloudOff,
  content: ShieldAlert,
  agent: Bot,
  tool: Bot,
  billing: CreditCard,
  system: AlertTriangle,
};

interface ErrorMessageCardProps {
  error: MessageError;
  onRetry?: () => void;
}

export default function ErrorMessageCard({
  error,
  onRetry,
}: ErrorMessageCardProps) {
  const { t } = useTranslation();
  const [showDetail, setShowDetail] = useState(false);

  const Icon = categoryIcons[error.category] || AlertTriangle;

  // Try i18n key first, fall back to raw message
  const i18nKey = `app.chatError.${error.code}`;
  const translatedMessage = t(i18nKey, { defaultValue: "" });
  const displayMessage = translatedMessage || error.message;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="rounded-lg border border-red-200/60 bg-red-50/50 px-4 py-3 dark:border-red-800/40 dark:bg-red-950/20"
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-3 h-4 w-4 shrink-0 text-red-500 dark:text-red-400" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-relaxed text-red-700 dark:text-red-300">
            {displayMessage}
          </p>

          {/* Detail toggle */}
          {error.code && (
            <div className="mt-1.5">
              <button
                type="button"
                onClick={() => setShowDetail(!showDetail)}
                className="inline-flex items-center gap-1 text-[11px] text-red-500/70 transition-colors hover:text-red-600 dark:text-red-400/60 dark:hover:text-red-300"
              >
                {t("app.chatError.detailToggle", "Details")}
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${showDetail ? "rotate-180" : ""}`}
                />
              </button>
              <AnimatePresence>
                {showDetail && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="mt-1 overflow-hidden rounded bg-red-100/50 px-2 py-1.5 font-mono text-[11px] text-red-600/80 dark:bg-red-900/20 dark:text-red-400/70"
                  >
                    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                      <span className="text-red-500/60 dark:text-red-400/50">
                        Code
                      </span>
                      <span className="break-all">{error.code}</span>
                      <span className="text-red-500/60 dark:text-red-400/50">
                        Category
                      </span>
                      <span>{error.category}</span>
                    </div>
                    {error.detail && (
                      <pre className="mt-1 whitespace-pre-wrap break-all border-t border-red-200/40 pt-1 dark:border-red-800/30">
                        {error.detail}
                      </pre>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Action buttons */}
          {(error.recoverable || error.category === "billing") && (
            <div className="mt-2 flex items-center gap-2">
              {error.recoverable && onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1 text-[12px] font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  <RefreshCw className="h-3 w-3" />
                  {t("app.chatError.retryAction", "Retry")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

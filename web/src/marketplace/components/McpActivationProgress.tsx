/**
 * MCP Activation Progress Component
 * 可复用的 MCP 激活进度反馈组件
 */

import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import React from "react";
import { useTranslation } from "react-i18next";
import type { McpActivationProgress } from "../types/bohrium";

interface McpActivationProgressProps {
  progress: McpActivationProgress;
  onRetry?: () => void;
  onClose?: () => void;
  className?: string;
}

const McpActivationProgressComponent: React.FC<McpActivationProgressProps> = ({
  progress,
  onRetry,
  onClose,
  className = "",
}) => {
  const { t } = useTranslation();
  const { status, message, progress: percent, error } = progress;

  const getStatusIcon = () => {
    switch (status) {
      case "success":
        return (
          <CheckCircleIcon className="h-12 w-12 text-green-500 animate-bounce" />
        );
      case "error":
      case "timeout":
        return (
          <ExclamationTriangleIcon className="h-12 w-12 text-red-500 animate-pulse" />
        );
      default:
        return (
          <div className="relative h-12 w-12">
            <motion.div
              className="absolute inset-0 rounded-full border-4 border-blue-200 dark:border-blue-900"
              initial={{ opacity: 0.3 }}
            />
            <motion.div
              className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent"
              animate={{ rotate: 360 }}
              transition={{
                duration: 1,
                repeat: Number.POSITIVE_INFINITY,
                ease: "linear",
              }}
            />
          </div>
        );
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case "success":
        return "bg-green-500";
      case "error":
      case "timeout":
        return "bg-red-500";
      default:
        return "bg-blue-500";
    }
  };

  return (
    <AnimatePresence>
      {status !== "idle" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className={`rounded-sm border border-neutral-200 bg-white p-6 shadow-lg dark:border-neutral-800 dark:bg-neutral-900 ${className}`}
        >
          {/* Icon */}
          <div className="mb-4 flex justify-center">{getStatusIcon()}</div>

          {/* Status Message */}
          <div className="mb-4 text-center">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">
              {status === "success"
                ? "激活成功"
                : status === "error" || status === "timeout"
                  ? "激活失败"
                  : "正在激活"}
            </h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {message}
            </p>
            {error && (
              <p className="mt-2 text-xs text-red-500 dark:text-red-400">
                {error}
              </p>
            )}
          </div>

          {/* Progress Bar */}
          {status !== "success" &&
            status !== "error" &&
            status !== "timeout" && (
              <div className="mb-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                  <motion.div
                    className={`h-full ${getStatusColor()}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${percent}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <div className="mt-2 text-center text-xs text-neutral-500 dark:text-neutral-400">
                  {Math.round(percent)}%
                </div>
              </div>
            )}

          {/* Retry Count Info */}
          {progress.retryCount && (
            <div className="mb-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
              {t("mcp.detail.progress.retryCount", {
                count: progress.retryCount,
              })}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 justify-center">
            {(status === "error" || status === "timeout") && onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 transition-colors"
              >
                <ArrowPathIcon className="h-4 w-4" />
                {t("mcp.detail.progress.retry")}
              </button>
            )}

            {status === "success" && onClose && (
              <button
                onClick={onClose}
                className="rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 transition-colors"
              >
                {t("mcp.detail.progress.done")}
              </button>
            )}

            {(status === "error" || status === "timeout") && onClose && (
              <button
                onClick={onClose}
                className="rounded-lg bg-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600 transition-colors"
              >
                {t("mcp.detail.progress.cancel")}
              </button>
            )}
          </div>

          {/* Tips for user */}
          {status === "polling" && (
            <div className="mt-4 rounded-lg bg-blue-50 p-3 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
              <p className="font-medium mb-1">{t("mcp.detail.progress.tip")}</p>
              <p>{t("mcp.detail.progress.bohriumHint")}</p>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default McpActivationProgressComponent;

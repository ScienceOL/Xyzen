import type { TopicStatus } from "@/core/chat";
import { useTranslation } from "react-i18next";

interface ChatStatusBadgeProps {
  status: TopicStatus;
  size?: "xs" | "sm";
  showLabel?: boolean;
  className?: string;
}

const STATUS_STYLES: Record<
  TopicStatus,
  { dot: string; tone: string; key: string; fallback: string }
> = {
  idle: {
    dot: "bg-neutral-400 dark:bg-neutral-500",
    tone: "text-neutral-500 dark:text-neutral-400",
    key: "app.chat.status.idle",
    fallback: "Idle",
  },
  running: {
    dot: "",
    tone: "text-amber-600 dark:text-amber-400",
    key: "app.chat.status.running",
    fallback: "Running",
  },
  stopping: {
    dot: "bg-amber-500 dark:bg-amber-400",
    tone: "text-amber-700 dark:text-amber-300",
    key: "app.chat.status.stopping",
    fallback: "Stopping",
  },
  failed: {
    dot: "bg-red-500 dark:bg-red-400",
    tone: "text-red-700 dark:text-red-300",
    key: "app.chat.status.failed",
    fallback: "Failed",
  },
};

export default function ChatStatusBadge({
  status,
  size = "sm",
  showLabel = false,
  className = "",
}: ChatStatusBadgeProps) {
  const { t } = useTranslation();
  const styles = STATUS_STYLES[status];
  const label = t(styles.key, { defaultValue: styles.fallback });
  const spinnerSize = size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5";

  // Running status: yellow spinner only, no text
  if (status === "running") {
    return (
      <span className={`inline-flex items-center ${className}`} title={label}>
        <svg
          className={`${spinnerSize} animate-spin text-amber-500 dark:text-amber-400`}
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-20"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            className="opacity-90"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
          />
        </svg>
      </span>
    );
  }

  const dotSize = size === "xs" ? "h-1.5 w-1.5" : "h-2 w-2";
  const textSize = size === "xs" ? "text-[10px]" : "text-xs";
  const padding = showLabel ? "px-2 py-0.5" : "px-1.5 py-1";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-white/60 dark:bg-neutral-900/50 ${padding} ${styles.tone} ${textSize} ${className}`}
      title={label}
    >
      <span className={`rounded-full ${dotSize} ${styles.dot}`} />
      {showLabel && <span className="font-medium">{label}</span>}
    </span>
  );
}

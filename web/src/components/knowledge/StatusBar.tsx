import type { StorageStats } from "./types";

interface StatusBarProps {
  itemCount: number;
  stats: StorageStats;
}

const formatSize = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const StatusBar = ({ itemCount, stats }: StatusBarProps) => {
  // Hardcoded total limit for demo (e.g. 100MB) or use stats.total if available/dynamic
  const TOTAL_LIMIT = 100 * 1024 * 1024;
  const available = Math.max(0, TOTAL_LIMIT - stats.total);

  return (
    <div className="flex h-8 select-none items-center justify-between border-t border-neutral-200 bg-neutral-50 px-4 text-xs font-medium text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-4">
        <span>{itemCount} items</span>
        <span className="text-neutral-300 dark:text-neutral-700">|</span>
        <span>{formatSize(available)} available</span>
      </div>
      <div>{/* Optional: Tiny progress or status indicator */}</div>
    </div>
  );
};

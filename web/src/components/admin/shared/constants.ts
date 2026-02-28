export const TIER_BADGE_COLORS: Record<string, string> = {
  ultra: "bg-amber-900/40 text-amber-300",
  pro: "bg-purple-900/40 text-purple-300",
  professional: "bg-purple-900/40 text-purple-300",
  standard: "bg-blue-900/40 text-blue-300",
  lite: "bg-neutral-800 text-neutral-300",
  free: "bg-neutral-800 text-neutral-300",
  unknown: "bg-neutral-800 text-neutral-500",
};

export const TIER_DISPLAY_NAMES: Record<string, string> = {
  free: "Free",
  lite: "Lite",
  standard: "Standard",
  pro: "Pro",
  professional: "Professional",
  ultra: "Ultra",
};

export const TIER_COLORS: Record<string, string> = {
  free: "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300",
  standard: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200",
  professional:
    "bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200",
  ultra: "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200",
};

export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function formatDate(iso: string | null): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDatetime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(0)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

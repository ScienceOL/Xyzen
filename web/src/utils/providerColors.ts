/**
 * Simple color scheme for provider selection
 * Blue for selected, grey for unselected
 */
export const PROVIDER_COLORS = {
  selected: {
    bg: "bg-blue-100 dark:bg-blue-900/30",
    text: "text-blue-700 dark:text-blue-400",
    icon: "text-blue-600 dark:text-blue-500",
    badge: "bg-blue-500",
  },
  unselected: {
    bg: "bg-neutral-100 dark:bg-neutral-800/30",
    text: "text-neutral-700 dark:text-neutral-400",
    icon: "text-neutral-600 dark:text-neutral-500",
    badge: "bg-neutral-500",
  },
} as const;

/**
 * Get color classes based on selection state
 */
export function getProviderColor(isSelected: boolean) {
  return isSelected ? PROVIDER_COLORS.selected : PROVIDER_COLORS.unselected;
}

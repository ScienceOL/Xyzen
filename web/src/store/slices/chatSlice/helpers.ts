import xyzenService from "@/service/xyzenService";

/**
 * Module-level state for timers and guards.
 * Not serializable in the store, so kept outside.
 */

// Track abort timeout IDs per channel to allow cleanup
export const abortTimeoutIds = new Map<string, ReturnType<typeof setTimeout>>();

// Per-topic stale-state watchdog interval IDs
export const staleWatchdogIds = new Map<
  string,
  ReturnType<typeof setInterval>
>();

// Concurrency guard: track in-progress agent IDs to prevent duplicate calls
export const pendingChannelOps = new Set<string>();

export const CHANNEL_CONNECT_TIMEOUT_MS = 5000;
export const CHANNEL_CONNECT_POLL_INTERVAL_MS = 100;

/**
 * Clean up WebSocket connection and module-level timers for a given topic.
 * Must be called before removing a channel from state.
 */
export function cleanupTopicResources(topicId: string): void {
  xyzenService.closeConnection(topicId);

  const watchdog = staleWatchdogIds.get(topicId);
  if (watchdog) {
    clearInterval(watchdog);
    staleWatchdogIds.delete(topicId);
  }

  const abortTimeout = abortTimeoutIds.get(topicId);
  if (abortTimeout) {
    clearTimeout(abortTimeout);
    abortTimeoutIds.delete(topicId);
  }
}

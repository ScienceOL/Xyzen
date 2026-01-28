import { useBackendVersion } from "@/hooks/queries";
import { getFrontendVersion } from "@/types/version";
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "xyzen-update-state";
const MAX_RETRIES = 3;

interface UpdateState {
  targetVersion: string;
  retryCount: number;
}

interface UseAutoUpdateResult {
  /** True during update process (cache clearing, reloading) */
  isUpdating: boolean;
  /** The backend version we're updating to, if updating */
  targetVersion: string | null;
}

/**
 * Clears all caches and unregisters service workers
 */
async function clearCachesAndServiceWorkers(): Promise<void> {
  // Unregister all service workers
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
  }

  // Clear all caches
  if ("caches" in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
  }
}

/**
 * Gets the current update state from localStorage
 */
function getUpdateState(): UpdateState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as UpdateState;
  } catch {
    return null;
  }
}

/**
 * Saves update state to localStorage
 */
function saveUpdateState(state: UpdateState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable or quota exceeded - proceed without persistence
  }
}

/**
 * Clears update state from localStorage
 */
function clearUpdateState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable - proceed without clearing
  }
}

/**
 * Hook that auto-updates the frontend when version mismatches backend.
 *
 * Flow:
 * 1. Fetches backend version after auth succeeds
 * 2. Compares with frontend version
 * 3. If mismatch: clears caches and reloads (up to MAX_RETRIES times)
 * 4. Prevents infinite loops via localStorage retry tracking
 *
 * @param enabled - Whether to enable auto-update checking (default: true)
 * @returns Object with isUpdating state and target version
 */
export function useAutoUpdate(enabled = true): UseAutoUpdateResult {
  const [isUpdating, setIsUpdating] = useState(false);
  const [targetVersion, setTargetVersion] = useState<string | null>(null);

  const {
    data: backendData,
    isLoading,
    isError,
  } = useBackendVersion({ enabled });

  const performUpdate = useCallback(async (version: string) => {
    setIsUpdating(true);
    setTargetVersion(version);

    try {
      await clearCachesAndServiceWorkers();
      // Small delay to ensure UI shows the updating state
      await new Promise((resolve) => setTimeout(resolve, 500));
      window.location.reload();
    } catch (error) {
      console.error("[AutoUpdate] Failed to clear caches:", error);
      // Still try to reload even if cache clearing fails
      window.location.reload();
    }
  }, []);

  useEffect(() => {
    // Skip if disabled, still loading, or errored
    if (!enabled || isLoading || isError || !backendData) {
      return;
    }

    const frontendVersion = getFrontendVersion().version;
    const backendVersion = backendData.version;

    // Versions match - clear any update state and continue normally
    if (frontendVersion === backendVersion) {
      clearUpdateState();
      return;
    }

    // Version mismatch - check retry count
    const existingState = getUpdateState();

    // If we're targeting the same version, increment retry count
    // Otherwise, this is a new version - start fresh
    const retryCount =
      existingState?.targetVersion === backendVersion
        ? existingState.retryCount + 1
        : 1;

    // Exceeded max retries - give up to prevent infinite loop
    if (retryCount > MAX_RETRIES) {
      console.warn(
        `[AutoUpdate] Failed to update to ${backendVersion} after ${MAX_RETRIES} attempts. ` +
          `Frontend: ${frontendVersion}, Backend: ${backendVersion}`,
      );
      clearUpdateState();
      return;
    }

    // Save state before reload
    saveUpdateState({
      targetVersion: backendVersion,
      retryCount,
    });

    console.info(
      `[AutoUpdate] Version mismatch detected. ` +
        `Frontend: ${frontendVersion}, Backend: ${backendVersion}. ` +
        `Attempt ${retryCount}/${MAX_RETRIES}.`,
    );

    void performUpdate(backendVersion);
  }, [enabled, backendData, isLoading, isError, performUpdate]);

  return {
    isUpdating,
    targetVersion,
  };
}

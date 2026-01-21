import { useBackendVersion } from "@/hooks/queries";
import type {
  NormalizedVersionInfo,
  VersionInfo,
  VersionStatus,
} from "@/types/version";
import {
  compareVersions,
  getFrontendVersion,
  normalizeBackendVersion,
} from "@/types/version";

interface UseVersionResult {
  /** Frontend version info (always available) */
  frontend: VersionInfo;
  /** Backend version info (loaded async) */
  backend: NormalizedVersionInfo;
  /** Comparison status between frontend and backend */
  status: VersionStatus;
  /** Whether backend version is loading */
  isLoading: boolean;
  /** Whether backend version fetch failed */
  isError: boolean;
  /** Refresh backend version */
  refresh: () => void;
}

/**
 * Hook to fetch and compare frontend/backend versions
 *
 * Uses TanStack Query for proper caching and server state management.
 */
export function useVersion(): UseVersionResult {
  const {
    data: backendData,
    isLoading,
    isError,
    refetch,
  } = useBackendVersion();

  const frontend = getFrontendVersion();
  const backend = normalizeBackendVersion(
    backendData ?? null,
    isLoading,
    isError,
  );
  const status = compareVersions(frontend, backend);

  return {
    frontend,
    backend,
    status,
    isLoading,
    isError,
    refresh: () => void refetch(),
  };
}

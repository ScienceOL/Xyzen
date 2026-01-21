import { useCallback, useEffect, useState } from "react";

import type {
  BackendVersionInfo,
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
 */
export function useVersion(): UseVersionResult {
  const [backendData, setBackendData] = useState<BackendVersionInfo | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const fetchVersion = useCallback(async () => {
    setIsLoading(true);
    setIsError(false);
    try {
      const res = await fetch("/xyzen/api/v1/system/version");
      if (!res.ok) throw new Error("Failed to fetch version");
      const data: BackendVersionInfo = await res.json();
      setBackendData(data);
    } catch {
      setIsError(true);
      setBackendData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVersion();
  }, [fetchVersion]);

  const frontend = getFrontendVersion();
  const backend = normalizeBackendVersion(backendData, isLoading, isError);
  const status = compareVersions(frontend, backend);

  return {
    frontend,
    backend,
    status,
    isLoading,
    isError,
    refresh: fetchVersion,
  };
}

/**
 * TanStack Query hooks for system data
 *
 * These hooks provide version information and system status.
 */

import { systemService } from "@/service/systemService";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";

interface UseBackendVersionOptions {
  /** Whether to enable the query (default: true) */
  enabled?: boolean;
}

/**
 * Fetch the backend system version information
 *
 * @example
 * ```tsx
 * const { data: version, isLoading, error, refetch } = useBackendVersion();
 * ```
 */
export function useBackendVersion(options: UseBackendVersionOptions = {}) {
  const { enabled = true } = options;
  return useQuery({
    queryKey: queryKeys.system.version(),
    queryFn: () => systemService.getVersion(),
    staleTime: 5 * 60 * 1000, // Consider fresh for 5 minutes
    retry: 1, // Only retry once on failure
    enabled,
  });
}

/**
 * Hook to manually invalidate version cache
 */
export function useInvalidateVersion() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.system.version() });
}

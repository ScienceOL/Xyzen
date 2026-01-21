/**
 * Version information for the application
 */
export interface VersionInfo {
  /** Semantic version string (e.g., "1.2.3") */
  version: string;
  /** Git commit SHA (short hash) */
  commit: string;
  /** ISO 8601 build timestamp */
  buildTime: string;
}

/**
 * Backend version response from /api/v1/system/version
 */
export interface BackendVersionInfo {
  /** Semantic version string */
  version: string;
  /** Git commit SHA (short hash) */
  commit: string;
  /** ISO 8601 build timestamp (snake_case from backend) */
  build_time: string;
  /** Backend framework identifier */
  backend: string;
}

/**
 * Normalized version info for UI display
 */
export interface NormalizedVersionInfo {
  version: string;
  commit: string;
  buildTime: string;
  isLoaded: boolean;
  isError: boolean;
}

/**
 * Version comparison result
 */
export type VersionStatus = "match" | "mismatch" | "unknown";

/**
 * Get frontend version info from build-time injected constants
 */
export function getFrontendVersion(): VersionInfo {
  return {
    version: __APP_VERSION__,
    commit: __APP_COMMIT__,
    buildTime: __APP_BUILD_TIME__,
  };
}

/**
 * Normalize backend version response to common format
 */
export function normalizeBackendVersion(
  data: BackendVersionInfo | null,
  isLoading: boolean,
  isError: boolean,
): NormalizedVersionInfo {
  return {
    version: data?.version ?? "unknown",
    commit: data?.commit ?? "unknown",
    buildTime: data?.build_time ?? "unknown",
    isLoaded: !isLoading && data !== null,
    isError,
  };
}

/**
 * Compare frontend and backend versions
 */
export function compareVersions(
  frontend: VersionInfo,
  backend: NormalizedVersionInfo,
): VersionStatus {
  if (!backend.isLoaded || backend.isError) {
    return "unknown";
  }
  return frontend.version === backend.version ? "match" : "mismatch";
}

/**
 * Parse semantic version string
 */
export function parseVersion(version: string): {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
} | null {
  const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
  };
}

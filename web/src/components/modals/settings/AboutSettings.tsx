import { useVersion } from "@/hooks/useVersion";
import type { NormalizedVersionInfo, VersionInfo } from "@/types/version";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CheckBadgeIcon,
  CloudIcon,
  CodeBracketIcon,
  ComputerDesktopIcon,
  ExclamationTriangleIcon,
  ServerIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";

const GITHUB_REPO = "https://github.com/ScienceOL/Xyzen";

export const AboutSettings = () => {
  const { t } = useTranslation();
  const { frontend, backend, status, isLoading, isError, refresh } =
    useVersion();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header with Logo */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg">
            <span className="text-2xl font-bold text-white">X</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
              Xyzen
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              AI Laboratory Server
            </p>
          </div>
        </div>
        <button
          onClick={refresh}
          disabled={isLoading}
          className="rounded-lg p-2.5 text-neutral-500 transition-all hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          title={t("common.refresh", "Refresh")}
        >
          <ArrowPathIcon
            className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {/* Version Status Banner */}
      <VersionStatusBanner
        status={status}
        frontend={frontend}
        backend={backend}
        isError={isError}
      />

      {/* Version Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        <VersionCard
          type="frontend"
          title={t("settings.about.frontend", "Frontend")}
          info={frontend}
          loading={false}
        />
        <VersionCard
          type="backend"
          title={t("settings.about.backend", "Backend")}
          info={backend}
          loading={isLoading}
        />
      </div>

      {/* Quick Links */}
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900">
        <h4 className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {t("settings.about.links", "Quick Links")}
        </h4>
        <div className="flex flex-wrap gap-2">
          <QuickLink
            href={GITHUB_REPO}
            icon={<CodeBracketIcon className="h-4 w-4" />}
            label="GitHub"
          />
          <QuickLink
            href={`${GITHUB_REPO}/releases`}
            icon={<CloudIcon className="h-4 w-4" />}
            label="Releases"
          />
          <QuickLink
            href={`${GITHUB_REPO}/blob/main/CHANGELOG.md`}
            icon={<ArrowTopRightOnSquareIcon className="h-4 w-4" />}
            label="Changelog"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-neutral-400 dark:text-neutral-500">
        <p>© {new Date().getFullYear()} ScienceOL. Apache-2.0 License.</p>
      </div>
    </div>
  );
};

interface VersionCardProps {
  type: "frontend" | "backend";
  title: string;
  info: VersionInfo | NormalizedVersionInfo;
  loading: boolean;
}

const VersionCard = ({ type, title, info, loading }: VersionCardProps) => {
  const isNormalized = "isError" in info;
  const isError = isNormalized && (info as NormalizedVersionInfo).isError;
  const Icon = type === "frontend" ? ComputerDesktopIcon : ServerIcon;

  const gradientClass =
    type === "frontend"
      ? "from-blue-500/10 to-cyan-500/10 dark:from-blue-500/20 dark:to-cyan-500/20"
      : "from-purple-500/10 to-pink-500/10 dark:from-purple-500/20 dark:to-pink-500/20";

  const iconBgClass =
    type === "frontend"
      ? "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400"
      : "bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400";

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border border-neutral-200 bg-gradient-to-br ${gradientClass} p-5 transition-all hover:shadow-lg dark:border-neutral-700`}
    >
      {/* Background decoration */}
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/50 blur-2xl dark:bg-white/5" />

      <div className="relative">
        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <div className={`rounded-lg p-2 ${iconBgClass}`}>
            <Icon className="h-5 w-5" />
          </div>
          <h4 className="text-base font-semibold text-neutral-900 dark:text-white">
            {title}
          </h4>
        </div>

        {/* Content */}
        {loading ? (
          <LoadingSkeleton />
        ) : isError ? (
          <ErrorState />
        ) : (
          <VersionDetails info={info} type={type} />
        )}
      </div>
    </div>
  );
};

const LoadingSkeleton = () => (
  <div className="animate-pulse space-y-3">
    <div className="h-8 w-20 rounded-lg bg-neutral-200 dark:bg-neutral-700" />
    <div className="flex gap-4">
      <div className="h-4 w-16 rounded bg-neutral-200 dark:bg-neutral-700" />
      <div className="h-4 w-24 rounded bg-neutral-200 dark:bg-neutral-700" />
    </div>
  </div>
);

const ErrorState = () => (
  <div className="flex items-center gap-2 text-sm text-red-500">
    <ExclamationTriangleIcon className="h-4 w-4" />
    <span>Failed to load</span>
  </div>
);

interface VersionDetailsProps {
  info: VersionInfo | NormalizedVersionInfo;
  type: "frontend" | "backend";
}

const VersionDetails = ({ info, type }: VersionDetailsProps) => {
  const version = info.version;
  const commit = info.commit;
  const time = "buildTime" in info ? info.buildTime : undefined;

  const versionColorClass =
    type === "frontend"
      ? "text-blue-600 dark:text-blue-400"
      : "text-purple-600 dark:text-purple-400";

  return (
    <div className="space-y-3">
      {/* Main Version */}
      <div className={`text-2xl font-bold ${versionColorClass}`}>
        v{version}
      </div>

      {/* Meta Info */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
        {commit && commit !== "unknown" && (
          <a
            href={`${GITHUB_REPO}/commit/${commit}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:text-neutral-700 hover:underline dark:hover:text-neutral-200"
          >
            #{commit}
          </a>
        )}
        {time && time !== "unknown" && (
          <span title={new Date(time).toISOString()}>
            {formatRelativeTime(time)}
          </span>
        )}
      </div>
    </div>
  );
};

interface VersionStatusBannerProps {
  status: "match" | "mismatch" | "unknown";
  frontend: VersionInfo;
  backend: NormalizedVersionInfo;
  /**
   * Indicates whether the version fetch request has failed.
   * When true and status is "unknown", an error state is shown
   * instead of the loading spinner.
   */
  isError?: boolean;
}

const VersionStatusBanner = ({
  status,
  frontend,
  backend,
  isError,
}: VersionStatusBannerProps) => {
  // Error state - fetch failed
  if (status === "unknown" && isError) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 p-4 dark:border-red-800/50 dark:from-red-900/20 dark:to-rose-900/20">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
          <ExclamationTriangleIcon className="h-6 w-6 text-red-600 dark:text-red-400" />
        </div>
        <div>
          <p className="font-medium text-red-800 dark:text-red-200">
            Unable to connect to backend
          </p>
          <p className="text-sm text-red-600 dark:text-red-400">
            Version check failed. Please verify the server is running.
          </p>
        </div>
      </div>
    );
  }

  // Loading state - still fetching
  if (status === "unknown") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/50">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700">
          <ArrowPathIcon className="h-5 w-5 animate-spin text-neutral-500" />
        </div>
        <div>
          <p className="font-medium text-neutral-700 dark:text-neutral-300">
            Checking version...
          </p>
          <p className="text-sm text-neutral-500">
            Connecting to backend server
          </p>
        </div>
      </div>
    );
  }

  if (status === "match") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 p-4 dark:border-green-800/50 dark:from-green-900/20 dark:to-emerald-900/20">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50">
          <CheckBadgeIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
        </div>
        <div>
          <p className="font-medium text-green-800 dark:text-green-200">
            System is up to date
          </p>
          <p className="text-sm text-green-600 dark:text-green-400">
            Running version {frontend.version} on all components
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 dark:border-amber-800/50 dark:from-amber-900/20 dark:to-orange-900/20">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50">
          <ExclamationTriangleIcon className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-amber-800 dark:text-amber-200">
            Version Mismatch Detected
          </p>
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
            Frontend and backend are running different versions. This may cause
            compatibility issues.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
              <ComputerDesktopIcon className="h-3.5 w-3.5" />
              Frontend: {frontend.version}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
              <ServerIcon className="h-3.5 w-3.5" />
              Backend: {backend.version}
            </span>
          </div>
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
            💡 Try refreshing the page or clearing browser cache
          </p>
        </div>
      </div>
    </div>
  );
};

interface QuickLinkProps {
  href: string;
  icon: React.ReactNode;
  label: string;
}

const QuickLink = ({ href, icon, label }: QuickLinkProps) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 transition-all hover:border-neutral-300 hover:bg-neutral-50 hover:shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-600 dark:hover:bg-neutral-700"
  >
    {icon}
    {label}
  </a>
);

/**
 * Format timestamp as relative time (e.g., "2 hours ago")
 */
function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 30) {
    return date.toLocaleDateString();
  }
  if (diffDay > 0) {
    return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
  }
  if (diffHour > 0) {
    return `${diffHour} hour${diffHour > 1 ? "s" : ""} ago`;
  }
  if (diffMin > 0) {
    return `${diffMin} min${diffMin > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

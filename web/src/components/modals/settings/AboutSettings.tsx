import { useVersion } from "@/hooks/useVersion";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";

const GITHUB_REPO = "https://github.com/ScienceOL/Xyzen";

export const AboutSettings = () => {
  const { t } = useTranslation();
  const { frontend, backend, status, isLoading, isError, refresh } =
    useVersion();

  return (
    <div className="flex flex-col items-center animate-in fade-in duration-300">
      {/* App Icon & Name */}
      <div className="flex flex-col items-center pt-4 pb-8">
        <img
          src="/icon.png"
          alt="Xyzen"
          className="h-24 w-24 rounded-[22px] shadow-lg shadow-black/20 dark:shadow-black/40"
        />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          Xyzen
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          AI Laboratory Server
        </p>
      </div>

      {/* Version Info List */}
      <div className="w-full">
        <div className="overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-800/60">
          <VersionRow
            label={t("settings.about.frontend", "Frontend")}
            version={frontend.version}
            commit={frontend.commit}
          />
          <div className="mx-4 h-px bg-neutral-200 dark:bg-neutral-700" />
          <VersionRow
            label={t("settings.about.backend", "Backend")}
            version={backend.version}
            commit={backend.commit}
            loading={isLoading}
            error={isError}
            onRefresh={refresh}
          />
        </div>

        {/* Status Indicator */}
        {status === "mismatch" && !isLoading && (
          <p className="mt-3 text-center text-xs text-neutral-500 dark:text-neutral-400">
            {t(
              "settings.about.versionMismatch",
              "Version mismatch detected. Try refreshing the page.",
            )}
          </p>
        )}

        {/* Links */}
        <div className="mt-6 overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-800/60">
          <LinkRow href={GITHUB_REPO} label="GitHub" />
          <div className="mx-4 h-px bg-neutral-200 dark:bg-neutral-700" />
          <LinkRow href={`${GITHUB_REPO}/releases`} label="Releases" />
          <div className="mx-4 h-px bg-neutral-200 dark:bg-neutral-700" />
          <LinkRow
            href={`${GITHUB_REPO}/blob/main/CHANGELOG.md`}
            label="Changelog"
          />
        </div>

        {/* Footer */}
        <p className="mt-8 pb-4 text-center text-xs text-neutral-400 dark:text-neutral-500">
          © {new Date().getFullYear()} ScienceOL. Apache-2.0 License.
        </p>
      </div>
    </div>
  );
};

interface VersionRowProps {
  label: string;
  version: string;
  commit?: string;
  loading?: boolean;
  error?: boolean;
  onRefresh?: () => void;
}

const VersionRow = ({
  label,
  version,
  commit,
  loading,
  error,
  onRefresh,
}: VersionRowProps) => (
  <div className="flex items-center justify-between px-4 py-3">
    <span className="text-sm text-neutral-900 dark:text-neutral-100">
      {label}
    </span>
    <div className="flex items-center gap-2">
      {loading ? (
        <ArrowPathIcon className="h-4 w-4 animate-spin text-neutral-400" />
      ) : error ? (
        <button
          onClick={onRefresh}
          className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
        >
          Retry
        </button>
      ) : (
        <span className="text-sm text-neutral-500 dark:text-neutral-400">
          {version}
          {commit && commit !== "unknown" && (
            <a
              href={`${GITHUB_REPO}/commit/${commit}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1.5 font-mono text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              ({commit.slice(0, 7)})
            </a>
          )}
        </span>
      )}
    </div>
  </div>
);

interface LinkRowProps {
  href: string;
  label: string;
}

const LinkRow = ({ href, label }: LinkRowProps) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-center justify-between px-4 py-3 text-sm text-neutral-900 transition-colors hover:bg-neutral-200/50 dark:text-neutral-100 dark:hover:bg-neutral-700/50"
  >
    <span>{label}</span>
    <svg
      className="h-4 w-4 text-neutral-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5l7 7-7 7"
      />
    </svg>
  </a>
);

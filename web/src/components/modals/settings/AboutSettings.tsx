import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/animate-ui/components/radix/accordion";
import { useVersion } from "@/hooks/useVersion";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";

const GITHUB_REPO = "https://github.com/ScienceOL/Xyzen";

export const AboutSettings = () => {
  const { t, i18n } = useTranslation();
  const { frontend, backend, status, isLoading, isError, refresh } =
    useVersion();

  // Check if frontend version is outdated (mismatch means user should refresh)
  const needsRefresh = status === "mismatch" && !isLoading;

  // Get version description based on current language
  // Chinese for 'zh', English for all other languages
  const versionDescription =
    i18n.language === "zh"
      ? backend.versionDescriptionZh
      : backend.versionDescriptionEn;

  return (
    <div className="flex flex-col items-center animate-in fade-in duration-300">
      {/* App Icon & Name */}
      <div className="flex flex-col items-center pt-4 pb-6">
        <div className="relative">
          <img
            src="/icon.png"
            alt="Xyzen"
            className="h-24 w-24 rounded-[22px] shadow-lg shadow-black/20 dark:shadow-black/40"
          />
          {/* Version mismatch indicator */}
          {needsRefresh && (
            <span
              className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white dark:ring-neutral-900"
              title={t(
                "settings.about.versionMismatch",
                "New version available. Refresh to update.",
              )}
            />
          )}
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          Xyzen
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          AI Laboratory Server
        </p>
      </div>

      {/* Version Display - Using Accordion */}
      <div className="w-full">
        <div className="overflow-hidden rounded-sm bg-neutral-100 dark:bg-neutral-800/60">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="version" className="border-none">
              <AccordionTrigger className="px-4 py-3.5 hover:no-underline">
                <div className="flex w-full items-center justify-between pr-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {t("settings.about.version", "Version")}
                    </span>
                    {needsRefresh && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.location.reload();
                        }}
                        className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                      >
                        {t("settings.about.refresh", "Refresh")}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isLoading ? (
                      <ArrowPathIcon className="h-4 w-4 animate-spin text-neutral-400" />
                    ) : isError ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          refresh();
                        }}
                        className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                      >
                        {t("common.retry", "Retry")}
                      </button>
                    ) : (
                      <>
                        {/* Version Name (Codename) */}
                        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                          {backend.versionName}
                        </span>
                        {/* Version Number */}
                        <span className="text-sm text-neutral-500 dark:text-neutral-400">
                          {backend.version}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 pt-0">
                {!isLoading && !isError && (
                  <div className="space-y-3">
                    {/* Version Description */}
                    {versionDescription && (
                      <p className="text-sm text-neutral-600 dark:text-neutral-300">
                        {versionDescription}
                      </p>
                    )}
                    {/* Commit Info */}
                    {backend.commit && backend.commit !== "unknown" && (
                      <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                        <span>Commit:</span>
                        <a
                          href={`${GITHUB_REPO}/commit/${backend.commit}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono hover:text-neutral-700 dark:hover:text-neutral-200"
                        >
                          {backend.commit.slice(0, 7)}
                        </a>
                      </div>
                    )}
                    {/* Version mismatch hint */}
                    {needsRefresh && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        {t(
                          "settings.about.versionMismatchHint",
                          "Your browser is running v{{frontendVersion}}. Refresh to get v{{backendVersion}}.",
                          {
                            frontendVersion: frontend.version,
                            backendVersion: backend.version,
                          },
                        )}
                      </p>
                    )}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* Links */}
        <div className="mt-6 overflow-hidden rounded-sm bg-neutral-100 dark:bg-neutral-800/60">
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
          © {new Date().getFullYear()} ScienceOL.{" "}
          <a
            href={`${GITHUB_REPO}/blob/main/LICENSE`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            License
          </a>
        </p>
      </div>
    </div>
  );
};

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

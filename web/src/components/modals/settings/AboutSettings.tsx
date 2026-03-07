import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/animate-ui/components/radix/accordion";
import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsList,
  TabsTrigger,
} from "@/components/animate-ui/components/animate/tabs";
import { FieldGroup } from "@/components/base/FieldGroup";
import { Input } from "@/components/base/Input";
import { StepperInput } from "@/components/base/StepperInput";
import { Textarea } from "@/components/base/Textarea";
import { useAuth } from "@/hooks/useAuth";
import { useVersion } from "@/hooks/useVersion";
import { cn } from "@/lib/utils";
import {
  applicationService,
  type InternalApplicationResponse,
} from "@/service/applicationService";
import {
  ArrowPathIcon,
  ClipboardDocumentIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const GITHUB_REPO = "https://github.com/ScienceOL/Xyzen";

export const AboutSettings = () => {
  const { t } = useTranslation();

  return (
    <Tabs defaultValue="about">
      <TabsList className="w-full">
        <TabsTrigger value="about">{t("settings.about.tabAbout")}</TabsTrigger>
        <TabsTrigger value="application">
          {t("settings.about.tabApplication")}
        </TabsTrigger>
      </TabsList>

      <TabsContents>
        <TabsContent value="about" className="px-1">
          <AboutContent />
        </TabsContent>
        <TabsContent value="application" className="px-1">
          <InternalApplicationContent />
        </TabsContent>
      </TabsContents>
    </Tabs>
  );
};

// ---------- About tab content ----------

function AboutContent() {
  const { t, i18n } = useTranslation();
  const { frontend, backend, status, isLoading, isError, refresh } =
    useVersion();

  const needsRefresh = status === "mismatch" && !isLoading;

  const versionDescription =
    i18n.language === "zh"
      ? backend.versionDescriptionZh
      : backend.versionDescriptionEn;

  return (
    <div className="flex flex-col items-center animate-in fade-in duration-300 pt-4">
      {/* App Icon & Name */}
      <div className="flex flex-col items-center pb-6">
        <div className="relative">
          <img
            src="/icon.png"
            alt="Xyzen"
            className="h-24 w-24 rounded-[22px] shadow-lg shadow-black/10 dark:shadow-black/30"
          />
          {needsRefresh && (
            <span
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-neutral-900"
              title={t("settings.about.versionMismatch")}
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

      {/* Version Display */}
      <div className="w-full">
        <div className="overflow-hidden rounded-xl bg-neutral-100/80 dark:bg-neutral-800/50">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="version" className="border-none">
              <AccordionTrigger className="px-4 py-3.5 hover:no-underline">
                <div className="flex w-full items-center justify-between pr-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {t("settings.about.version")}
                    </span>
                    {needsRefresh && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          window.location.reload();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                            window.location.reload();
                          }
                        }}
                        className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 cursor-pointer"
                      >
                        {t("settings.about.refresh")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isLoading ? (
                      <ArrowPathIcon className="h-4 w-4 animate-spin text-neutral-400" />
                    ) : isError ? (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          refresh();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                            refresh();
                          }
                        }}
                        className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 cursor-pointer"
                      >
                        {t("common.retry", "Retry")}
                      </span>
                    ) : (
                      <>
                        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                          {backend.versionName}
                        </span>
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
                    {versionDescription && (
                      <p className="text-sm text-neutral-600 dark:text-neutral-300">
                        {versionDescription}
                      </p>
                    )}
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
                    {needsRefresh && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        {t("settings.about.versionMismatchHint", {
                          frontendVersion: frontend.version,
                          backendVersion: backend.version,
                        })}
                      </p>
                    )}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* Links */}
        <div className="mt-6 overflow-hidden rounded-xl bg-neutral-100/80 dark:bg-neutral-800/50">
          <LinkRow href={GITHUB_REPO} label="GitHub" />
          <div className="mx-4 h-px bg-neutral-200/60 dark:bg-neutral-700/60" />
          <LinkRow href={`${GITHUB_REPO}/releases`} label="Releases" />
          <div className="mx-4 h-px bg-neutral-200/60 dark:bg-neutral-700/60" />
          <LinkRow
            href={`${GITHUB_REPO}/blob/main/CHANGELOG.md`}
            label="Changelog"
          />
          <div className="mx-4 h-px bg-neutral-200/60 dark:bg-neutral-700/60" />
          <LinkRow
            href="#/terms"
            label={t("landing.footer.terms", "Terms of Service")}
            external={false}
          />
          <div className="mx-4 h-px bg-neutral-200/60 dark:bg-neutral-700/60" />
          <LinkRow
            href="#/privacy"
            label={t("landing.footer.privacy", "Privacy Policy")}
            external={false}
          />
        </div>

        {/* Footer */}
        <p className="mt-8 pb-4 text-center text-xs text-neutral-400 dark:text-neutral-500">
          &copy; 2024-2026 ATOMBEAT TECHNOLOGY PTE. LTD.{" "}
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
}

// ---------- Internal Application tab content ----------

const APPLICATION_ITEMS: readonly { key: string; hasAmount?: boolean }[] = [
  { key: "subscription_pro" },
  { key: "subscription_ultra" },
  { key: "credits", hasAmount: true },
  { key: "sandbox" },
  { key: "model_access" },
];

function formatApplicationItem(
  item: string,
  t: (key: string) => string,
): string {
  if (item.startsWith("credits:")) {
    const amount = Number(item.split(":")[1]);
    return `${t("app.betaModal.internal.items.credits")} (${amount.toLocaleString()})`;
  }
  return t(`app.betaModal.internal.items.${item}`);
}

type ApplicationState = "idle" | "submitting";

function InternalApplicationContent() {
  const { t } = useTranslation();
  const auth = useAuth();
  const isAuthed = auth.isAuthenticated || !!auth.token;

  const [appState, setAppState] = useState<ApplicationState>("idle");
  const [companyName, setCompanyName] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [realName, setRealName] = useState("");
  const [reason, setReason] = useState("");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [creditsAmount, setCreditsAmount] = useState(0);
  const [applications, setApplications] = useState<
    InternalApplicationResponse[]
  >([]);
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);

  // Load application history on mount
  useEffect(() => {
    if (!isAuthed) return;

    let cancelled = false;
    (async () => {
      try {
        const apps = await applicationService
          .getMyApplications()
          .catch(() => []);
        if (cancelled) return;
        if (apps && apps.length > 0) {
          setApplications(apps);
        }
      } catch {
        // Silently ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthed]);

  const handleAppSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (
        !companyName ||
        !companyEmail ||
        !realName ||
        !reason ||
        selectedItems.length === 0
      )
        return;

      setAppState("submitting");
      try {
        const items = selectedItems.map((item) =>
          item === "credits" && creditsAmount > 0
            ? `credits:${creditsAmount}`
            : item,
        );
        const result = await applicationService.submitApplication({
          company_name: companyName,
          company_email: companyEmail,
          real_name: realName,
          reason,
          application_items: items,
        });
        setApplications((prev) => [result, ...prev]);
        setCompanyName("");
        setCompanyEmail("");
        setRealName("");
        setReason("");
        setSelectedItems([]);
        setCreditsAmount(0);
        setAppState("idle");
      } catch {
        setAppState("idle");
      }
    },
    [companyName, companyEmail, realName, reason, selectedItems, creditsAmount],
  );

  const toggleItem = useCallback((item: string) => {
    setSelectedItems((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item],
    );
  }, []);

  const handleCopyToken = useCallback((app: InternalApplicationResponse) => {
    navigator.clipboard.writeText(app.certificate_token);
    setCopiedTokenId(app.id);
    setTimeout(() => setCopiedTokenId(null), 2000);
  }, []);

  const appDisabled =
    appState !== "idle" ||
    !companyName ||
    !companyEmail ||
    !realName ||
    !reason ||
    selectedItems.length === 0;

  if (!isAuthed) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-[13px] text-neutral-500 dark:text-neutral-400">
          {t("app.betaModal.internal.loginRequired")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-4">
      {/* Previous applications */}
      {applications.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
            {t("app.betaModal.internal.history")}
          </h3>
          <Accordion type="multiple">
            {applications.map((app) => (
              <AccordionItem
                key={app.id}
                value={app.id}
                className="border-b border-neutral-200/60 dark:border-neutral-800/60"
              >
                <AccordionTrigger className="py-3 hover:no-underline">
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-[13px] font-medium text-neutral-800 dark:text-neutral-200">
                      {app.serial_number}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-400 dark:text-neutral-500">
                        {new Date(app.created_at).toLocaleDateString()}
                      </span>
                      <span className="text-xs text-neutral-300 dark:text-neutral-600">
                        &middot;
                      </span>
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                        {app.application_items
                          .map((item) => formatApplicationItem(item, t))
                          .join(", ")}
                      </span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <CertificateDisplay
                    application={app}
                    onCopyToken={() => handleCopyToken(app)}
                    tokenCopied={copiedTokenId === app.id}
                  />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}

      {/* New application form */}
      <form onSubmit={handleAppSubmit} className="space-y-5">
        <div className="rounded-lg bg-gradient-to-br from-indigo-50/50 to-purple-50/50 dark:from-indigo-950/20 dark:to-purple-950/20 p-4 space-y-5">
          <FieldGroup label={t("app.betaModal.internal.companyName")} required>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </FieldGroup>

          <FieldGroup label={t("app.betaModal.internal.companyEmail")} required>
            <Input
              type="email"
              value={companyEmail}
              onChange={(e) => setCompanyEmail(e.target.value)}
            />
          </FieldGroup>

          <FieldGroup label={t("app.betaModal.internal.realName")} required>
            <Input
              value={realName}
              onChange={(e) => setRealName(e.target.value)}
            />
          </FieldGroup>

          <FieldGroup label={t("app.betaModal.internal.reason")} required>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("app.betaModal.internal.reasonPlaceholder")}
              rows={3}
            />
          </FieldGroup>

          <FieldGroup
            label={t("app.betaModal.internal.applicationItems")}
            required
          >
            <div className="space-y-2">
              {APPLICATION_ITEMS.map(({ key, hasAmount }) => {
                const checked = selectedItems.includes(key);
                return (
                  <div key={key} className="flex items-center gap-3">
                    <label
                      className={cn(
                        "flex flex-1 items-center gap-2 rounded-lg px-3 py-2.5 text-[13px] cursor-pointer transition-colors",
                        checked
                          ? "bg-indigo-100/80 text-indigo-700 ring-1 ring-indigo-500/30 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-400/30"
                          : "bg-neutral-100/60 text-neutral-600 dark:bg-white/[0.04] dark:text-neutral-400",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleItem(key)}
                        className="sr-only"
                      />
                      <div
                        className={cn(
                          "h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors",
                          checked
                            ? "bg-indigo-500 border-indigo-500 text-white"
                            : "border-neutral-300 dark:border-neutral-600",
                        )}
                      >
                        {checked && (
                          <svg
                            className="h-3 w-3"
                            viewBox="0 0 12 12"
                            fill="none"
                          >
                            <path
                              d="M2.5 6L5 8.5L9.5 3.5"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>
                      <span className="flex-1">
                        {t(`app.betaModal.internal.items.${key}`)}
                      </span>
                      {hasAmount && checked && (
                        <StepperInput
                          value={creditsAmount}
                          onChange={setCreditsAmount}
                          minValue={0}
                          step={1000}
                          className="w-32 shrink-0"
                        />
                      )}
                    </label>
                  </div>
                );
              })}
            </div>
          </FieldGroup>
        </div>

        <button
          type="submit"
          disabled={appDisabled}
          className={cn(
            "w-full rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white transition-all",
            appDisabled
              ? "bg-neutral-300 dark:bg-neutral-700 cursor-not-allowed"
              : "bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600",
          )}
        >
          {appState === "submitting"
            ? t("app.betaModal.internal.submitting")
            : t("app.betaModal.internal.submit")}
        </button>
      </form>
    </div>
  );
}

// ---------- Certificate display ----------

function CertificateDisplay({
  application,
  onCopyToken,
  tokenCopied,
}: {
  application: InternalApplicationResponse;
  onCopyToken: () => void;
  tokenCopied: boolean;
}) {
  const { t } = useTranslation();
  const cert = t("app.betaModal.internal.certificate", {
    returnObjects: true,
  }) as Record<string, string>;

  const rows = [
    [cert.serialNumber, application.serial_number, true],
    [cert.appId, application.id],
    [cert.applicant, application.real_name],
    [cert.company, application.company_name],
    [cert.email, application.company_email],
    [cert.date, new Date(application.created_at).toLocaleDateString()],
    [
      cert.items,
      application.application_items
        .map((item) => formatApplicationItem(item, t))
        .join(", "),
    ],
  ] as const;

  return (
    <div className="space-y-4">
      <div className="relative rounded-lg bg-gradient-to-br from-indigo-50/80 to-purple-50/80 dark:from-indigo-950/30 dark:to-purple-950/30 p-5 ring-1 ring-indigo-200/50 dark:ring-indigo-800/30">
        <ShieldCheckIcon className="absolute right-4 top-4 h-12 w-12 text-indigo-200/60 dark:text-indigo-800/30" />

        <h3 className="text-[13px] font-semibold text-indigo-700 dark:text-indigo-300 mb-4">
          {cert.title}
        </h3>

        <div className="space-y-2.5">
          {rows.map(([label, value, mono]) => (
            <div key={String(label)} className="flex text-[13px]">
              <span className="w-28 shrink-0 text-neutral-500 dark:text-neutral-400">
                {label}
              </span>
              <span
                className={cn(
                  "text-neutral-800 dark:text-neutral-200",
                  mono && "font-mono text-xs",
                )}
              >
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* JWT Token */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
            {cert.token}
          </span>
          <button
            onClick={onCopyToken}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/[0.04] transition-colors"
          >
            <ClipboardDocumentIcon className="h-3.5 w-3.5" />
            {tokenCopied ? "Copied!" : cert.copyToken}
          </button>
        </div>
        <pre className="overflow-x-auto rounded-lg bg-neutral-100/60 dark:bg-white/[0.04] p-3 text-xs text-neutral-600 dark:text-neutral-400 break-all whitespace-pre-wrap custom-scrollbar">
          {application.certificate_token}
        </pre>
      </div>
    </div>
  );
}

// ---------- Link row helper ----------

interface LinkRowProps {
  href: string;
  label: string;
  external?: boolean;
}

const LinkRow = ({ href, label, external = true }: LinkRowProps) => (
  <a
    href={href}
    {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
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

import { SheetModal } from "@/components/animate-ui/components/animate/sheet-modal";
import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsList,
  TabsTrigger,
} from "@/components/animate-ui/components/animate/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/animate-ui/components/radix/accordion";
import { FieldGroup } from "@/components/base/FieldGroup";
import { Input } from "@/components/base/Input";
import { StepperInput } from "@/components/base/StepperInput";
import { Textarea } from "@/components/base/Textarea";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  applicationService,
  type InternalApplicationResponse,
} from "@/service/applicationService";
import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import { ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export interface BetaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SurveyState = "idle" | "submitting" | "submitted";
type ApplicationState = "idle" | "submitting";

const APPLICATION_ITEMS: readonly { key: string; hasAmount?: boolean }[] = [
  { key: "subscription_pro" },
  { key: "subscription_ultra" },
  { key: "credits", hasAmount: true },
  { key: "sandbox" },
  { key: "model_access" },
];

/** Parse "credits:1000" → "Credits (1,000)", plain keys → translated label */
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

export function BetaModal({ isOpen, onClose }: BetaModalProps) {
  const { t } = useTranslation();
  const auth = useAuth();
  const isAuthed = auth.isAuthenticated || !!auth.token;

  // Survey state
  const [surveyState, setSurveyState] = useState<SurveyState>("idle");
  const [discoveryChannel, setDiscoveryChannel] = useState("");
  const [occupation, setOccupation] = useState("");
  const [problemToSolve, setProblemToSolve] = useState("");

  // Application state
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

  // Restore submitted state on mount
  useEffect(() => {
    if (!isOpen || !isAuthed) return;

    let cancelled = false;
    (async () => {
      try {
        const [survey, apps] = await Promise.all([
          applicationService.getMySurvey().catch(() => null),
          applicationService.getMyApplications().catch(() => []),
        ]);
        if (cancelled) return;
        if (survey) setSurveyState("submitted");
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
  }, [isOpen, isAuthed]);

  const handleSurveySubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!discoveryChannel || !occupation || !problemToSolve) return;

      setSurveyState("submitting");
      try {
        await applicationService.submitSurvey({
          discovery_channel: discoveryChannel,
          occupation,
          problem_to_solve: problemToSolve,
        });
        setSurveyState("submitted");
      } catch {
        setSurveyState("idle");
      }
    },
    [discoveryChannel, occupation, problemToSolve],
  );

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
        // Encode credits amount into the item string
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
        // Reset form
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
    [companyName, companyEmail, realName, reason, selectedItems],
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

  const surveyDisabled =
    surveyState !== "idle" ||
    !discoveryChannel ||
    !occupation ||
    !problemToSolve;
  const appDisabled =
    appState !== "idle" ||
    !companyName ||
    !companyEmail ||
    !realName ||
    !reason ||
    selectedItems.length === 0;

  return (
    <SheetModal isOpen={isOpen} onClose={onClose} size="md">
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 border-b border-neutral-200/60 px-5 pb-3 pt-5 dark:border-neutral-800/60">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {t("app.betaModal.title")}
          </h2>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="px-5 py-5">
            <Tabs defaultValue="survey">
              <TabsList className="w-full">
                <TabsTrigger value="survey">
                  {t("app.betaModal.tabSurvey")}
                </TabsTrigger>
                <TabsTrigger value="internal">
                  {t("app.betaModal.tabInternal")}
                </TabsTrigger>
              </TabsList>

              <TabsContents>
                {/* Survey Tab — px-1 prevents ring clipping by TabsContents overflow:hidden */}
                <TabsContent value="survey" className="px-1">
                  {surveyState === "submitted" ? (
                    <SurveySubmitted />
                  ) : (
                    <form
                      onSubmit={handleSurveySubmit}
                      className="space-y-5 pt-4"
                    >
                      <FieldGroup
                        label={t("app.betaModal.survey.discoveryChannel")}
                        required
                      >
                        <select
                          value={discoveryChannel}
                          onChange={(e) => setDiscoveryChannel(e.target.value)}
                          className={cn(
                            "w-full rounded-sm px-3.5 py-2.5 text-sm",
                            "bg-white dark:bg-neutral-900",
                            "ring-1 ring-neutral-200 dark:ring-neutral-700/80",
                            "focus:outline-none focus:ring-[1.5px] focus:ring-indigo-500 dark:focus:ring-indigo-400",
                            "text-neutral-900 dark:text-neutral-100",
                          )}
                        >
                          <option value="" disabled />
                          {[
                            "social_media",
                            "friend",
                            "search",
                            "community",
                            "other",
                          ].map((key) => (
                            <option key={key} value={key}>
                              {t(`app.betaModal.survey.channels.${key}`)}
                            </option>
                          ))}
                        </select>
                      </FieldGroup>

                      <FieldGroup
                        label={t("app.betaModal.survey.occupation")}
                        required
                      >
                        <select
                          value={occupation}
                          onChange={(e) => setOccupation(e.target.value)}
                          className={cn(
                            "w-full rounded-sm px-3.5 py-2.5 text-sm",
                            "bg-white dark:bg-neutral-900",
                            "ring-1 ring-neutral-200 dark:ring-neutral-700/80",
                            "focus:outline-none focus:ring-[1.5px] focus:ring-indigo-500 dark:focus:ring-indigo-400",
                            "text-neutral-900 dark:text-neutral-100",
                          )}
                        >
                          <option value="" disabled />
                          {[
                            "student",
                            "researcher",
                            "engineer",
                            "designer",
                            "pm",
                            "other",
                          ].map((key) => (
                            <option key={key} value={key}>
                              {t(`app.betaModal.survey.occupations.${key}`)}
                            </option>
                          ))}
                        </select>
                      </FieldGroup>

                      <FieldGroup
                        label={t("app.betaModal.survey.problemToSolve")}
                        required
                      >
                        <Textarea
                          value={problemToSolve}
                          onChange={(e) => setProblemToSolve(e.target.value)}
                          placeholder={t(
                            "app.betaModal.survey.problemPlaceholder",
                          )}
                          rows={3}
                        />
                      </FieldGroup>

                      <button
                        type="submit"
                        disabled={surveyDisabled}
                        className={cn(
                          "w-full rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white transition-colors",
                          surveyDisabled
                            ? "bg-neutral-300 dark:bg-neutral-700 cursor-not-allowed"
                            : "bg-indigo-500 hover:bg-indigo-600 dark:hover:bg-indigo-400",
                        )}
                      >
                        {surveyState === "submitting"
                          ? t("app.betaModal.survey.submitting")
                          : t("app.betaModal.survey.submit")}
                      </button>
                    </form>
                  )}
                </TabsContent>

                {/* Internal Application Tab — px-1 prevents ring clipping */}
                <TabsContent value="internal" className="px-1">
                  {!isAuthed ? (
                    <div className="flex items-center justify-center py-12">
                      <p className="text-[13px] text-neutral-500 dark:text-neutral-400">
                        {t("app.betaModal.internal.loginRequired")}
                      </p>
                    </div>
                  ) : (
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
                                        {new Date(
                                          app.created_at,
                                        ).toLocaleDateString()}
                                      </span>
                                      <span className="text-xs text-neutral-300 dark:text-neutral-600">
                                        &middot;
                                      </span>
                                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                        {app.application_items
                                          .map((item) =>
                                            formatApplicationItem(item, t),
                                          )
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
                          <FieldGroup
                            label={t("app.betaModal.internal.companyName")}
                            required
                          >
                            <Input
                              value={companyName}
                              onChange={(e) => setCompanyName(e.target.value)}
                            />
                          </FieldGroup>

                          <FieldGroup
                            label={t("app.betaModal.internal.companyEmail")}
                            required
                          >
                            <Input
                              type="email"
                              value={companyEmail}
                              onChange={(e) => setCompanyEmail(e.target.value)}
                            />
                          </FieldGroup>

                          <FieldGroup
                            label={t("app.betaModal.internal.realName")}
                            required
                          >
                            <Input
                              value={realName}
                              onChange={(e) => setRealName(e.target.value)}
                            />
                          </FieldGroup>

                          <FieldGroup
                            label={t("app.betaModal.internal.reason")}
                            required
                          >
                            <Textarea
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              placeholder={t(
                                "app.betaModal.internal.reasonPlaceholder",
                              )}
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
                                  <div
                                    key={key}
                                    className="flex items-center gap-3"
                                  >
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
                                        {t(
                                          `app.betaModal.internal.items.${key}`,
                                        )}
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
                  )}
                </TabsContent>
              </TabsContents>
            </Tabs>
          </div>
        </div>
      </div>
    </SheetModal>
  );
}

function SurveySubmitted() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center py-8 space-y-4">
      <div className="text-4xl">&#127881;</div>
      <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
        {t("app.betaModal.survey.thankYou")}
      </h3>
      <p className="text-[13px] text-neutral-500 dark:text-neutral-400 text-center max-w-xs">
        {t("app.betaModal.survey.thankYouDesc")}
      </p>
      <div className="flex flex-col items-center gap-2 pt-2">
        <div className="h-36 w-36 rounded-lg bg-neutral-100 dark:bg-white/[0.04] overflow-hidden">
          <img
            src="https://storage.sciol.ac.cn/library/docs/discord/discord_qrcode.jpeg"
            alt="Discord QR Code"
            className="h-full w-full object-cover"
          />
        </div>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {t("app.betaModal.survey.joinDiscord")}
        </span>
      </div>
    </div>
  );
}

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
        {/* Decorative icon */}
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

import { SheetModal } from "@/components/animate-ui/components/animate/sheet-modal";
import { FieldGroup } from "@/components/base/FieldGroup";
import { Textarea } from "@/components/base/Textarea";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { applicationService } from "@/service/applicationService";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export interface BetaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SurveyState = "idle" | "submitting" | "submitted";

export function BetaModal({ isOpen, onClose }: BetaModalProps) {
  const { t } = useTranslation();
  const auth = useAuth();
  const isAuthed = auth.isAuthenticated || !!auth.token;

  // Survey state
  const [surveyState, setSurveyState] = useState<SurveyState>("idle");
  const [discoveryChannel, setDiscoveryChannel] = useState("");
  const [occupation, setOccupation] = useState("");
  const [problemToSolve, setProblemToSolve] = useState("");

  // Restore submitted state on mount
  useEffect(() => {
    if (!isOpen || !isAuthed) return;

    let cancelled = false;
    (async () => {
      try {
        const survey = await applicationService.getMySurvey().catch(() => null);
        if (cancelled) return;
        if (survey) setSurveyState("submitted");
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

  const surveyDisabled =
    surveyState !== "idle" ||
    !discoveryChannel ||
    !occupation ||
    !problemToSolve;

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
            {surveyState === "submitted" ? (
              <SurveySubmitted />
            ) : (
              <form onSubmit={handleSurveySubmit} className="space-y-5">
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
                    placeholder={t("app.betaModal.survey.problemPlaceholder")}
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

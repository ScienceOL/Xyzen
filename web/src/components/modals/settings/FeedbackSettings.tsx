import { Textarea } from "@/components/base/Textarea";
import { Input } from "@/components/base/Input";
import {
  EnvelopeIcon,
  ChatBubbleLeftRightIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import { useTranslation } from "react-i18next";

const SUPPORT_EMAIL = "service@sciol.ac.cn";

type FeedbackType = "bug" | "feature" | "complaint" | "other";

export function FeedbackSettings() {
  const { t } = useTranslation();
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("bug");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");

  const handleSend = () => {
    const typeLabel = t(`settings.feedback.types.${feedbackType}`);
    const fullSubject = subject
      ? `[Xyzen ${typeLabel}] ${subject}`
      : `[Xyzen ${typeLabel}]`;
    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(fullSubject)}&body=${encodeURIComponent(content)}`;
    window.open(mailto, "_self");
  };

  return (
    <div className="flex h-full flex-col p-4 md:p-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-500/10">
          <ChatBubbleLeftRightIcon className="h-6 w-6 text-indigo-500" />
        </div>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          {t("settings.feedback.title")}
        </h2>
        <p className="mt-1 max-w-sm text-xs text-neutral-400 dark:text-neutral-500">
          {t("settings.feedback.subtitle")}
        </p>
      </div>

      {/* Form */}
      <div className="mx-auto w-full max-w-md space-y-4">
        {/* Feedback type */}
        <div className="grid grid-cols-4 gap-2">
          {(["bug", "feature", "complaint", "other"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFeedbackType(type)}
              className={`rounded-lg px-2 py-2 text-[13px] font-medium transition-colors ${
                feedbackType === type
                  ? "bg-indigo-500 text-white"
                  : "bg-neutral-100/80 text-neutral-600 hover:bg-neutral-200/60 dark:bg-white/[0.06] dark:text-neutral-400 dark:hover:bg-white/[0.1]"
              }`}
            >
              {t(`settings.feedback.types.${type}`)}
            </button>
          ))}
        </div>

        {/* Subject */}
        <Input
          placeholder={t("settings.feedback.subjectPlaceholder")}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />

        {/* Content */}
        <Textarea
          placeholder={t("settings.feedback.contentPlaceholder")}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-indigo-400"
        >
          <EnvelopeIcon className="h-4 w-4" />
          {t("settings.feedback.send")}
        </button>

        {/* Hint */}
        <p className="text-center text-xs text-neutral-400 dark:text-neutral-500">
          {t("settings.feedback.emailHint")}
        </p>

        {/* Direct email link */}
        <p className="text-center text-xs text-neutral-400 dark:text-neutral-500">
          {t("settings.feedback.or")}{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-indigo-500 hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
        </p>
      </div>
    </div>
  );
}

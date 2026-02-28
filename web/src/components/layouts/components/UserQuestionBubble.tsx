import { Input } from "@/components/base/Input";
import { useXyzen } from "@/store";
import type { UserQuestion } from "@/store/types";
import { CheckIcon, ClockIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

interface UserQuestionBubbleProps {
  userQuestion: UserQuestion;
  messageId: string;
}

function UserQuestionBubble({ userQuestion }: UserQuestionBubbleProps) {
  const { t } = useTranslation();
  const [selectedOption, setSelectedOption] = useState<string | undefined>(
    userQuestion.selectedOption,
  );
  const [textInput, setTextInput] = useState(userQuestion.userText || "");
  const [submitted, setSubmitted] = useState(
    userQuestion.status !== "pending",
  );
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { respondToQuestion, activeChatChannel } = useXyzen(
    useShallow((s) => ({
      respondToQuestion: s.respondToQuestion,
      activeChatChannel: s.activeChatChannel,
    })),
  );

  // Calculate remaining time
  const [remainingSeconds, setRemainingSeconds] = useState(() => {
    if (userQuestion.status !== "pending") return 0;
    const elapsed = Math.floor((Date.now() - userQuestion.askedAt) / 1000);
    return Math.max(0, userQuestion.timeoutSeconds - elapsed);
  });

  // Countdown timer
  useEffect(() => {
    if (userQuestion.status !== "pending" || remainingSeconds <= 0) return;

    timerRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [userQuestion.status, remainingSeconds]);

  // Auto-submit on timeout
  useEffect(() => {
    if (remainingSeconds === 0 && userQuestion.status === "pending" && !submitted) {
      handleSubmit(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds]);

  const handleSubmit = useCallback(
    (timedOut = false) => {
      if (submitted || !activeChatChannel) return;
      setSubmitted(true);
      if (timerRef.current) clearInterval(timerRef.current);

      respondToQuestion(activeChatChannel, userQuestion.questionId, {
        selectedOption: selectedOption,
        text: textInput || undefined,
        timedOut,
      });
    },
    [
      submitted,
      activeChatChannel,
      respondToQuestion,
      userQuestion.questionId,
      selectedOption,
      textInput,
    ],
  );

  const formattedTime = useMemo(() => {
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, [remainingSeconds]);

  const isPending = userQuestion.status === "pending" && !submitted;

  // Answered state — read-only summary
  if (!isPending) {
    const statusText =
      userQuestion.status === "timed_out"
        ? t("app.question.timedOut")
        : t("app.question.answered");

    const answerSummary = [
      userQuestion.selectedOption &&
        userQuestion.options?.find((o) => o.id === userQuestion.selectedOption)
          ?.label,
      userQuestion.userText,
    ]
      .filter(Boolean)
      .join(" — ");

    return (
      <div className="rounded-lg bg-neutral-100/60 px-4 py-3 dark:bg-white/[0.04]">
        <p className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
          {userQuestion.question}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <CheckIcon className="h-4 w-4 text-green-500" />
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            {statusText}
            {answerSummary && `: ${answerSummary}`}
          </span>
        </div>
      </div>
    );
  }

  // Pending state — interactive
  return (
    <div className="rounded-lg bg-neutral-100/60 px-4 py-3 dark:bg-white/[0.04]">
      <p className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
        {userQuestion.question}
      </p>

      {/* Option chips */}
      {userQuestion.options && userQuestion.options.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {userQuestion.options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSelectedOption(option.id)}
              className={clsx(
                "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all",
                selectedOption === option.id
                  ? "bg-indigo-50/80 text-indigo-600 ring-1 ring-indigo-500/30 dark:bg-indigo-950/30 dark:text-indigo-400"
                  : "bg-white/80 text-neutral-600 hover:bg-neutral-50 dark:bg-white/[0.06] dark:text-neutral-400 dark:hover:bg-white/[0.08]",
              )}
              title={option.description}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {/* Free-text input */}
      {userQuestion.allowTextInput && (
        <div className="mt-3">
          <Input
            placeholder={t("app.question.typeAnswer")}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
        </div>
      )}

      {/* Footer: submit + countdown */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ClockIcon className="h-3.5 w-3.5 text-neutral-400" />
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            {t("app.question.remaining", { time: formattedTime })}
          </span>
        </div>
        <button
          type="button"
          onClick={() => handleSubmit()}
          disabled={!selectedOption && !textInput}
          className={clsx(
            "rounded-lg px-4 py-1.5 text-[13px] font-semibold text-white transition-all",
            selectedOption || textInput
              ? "bg-indigo-500 hover:bg-indigo-600 dark:hover:bg-indigo-400"
              : "cursor-not-allowed bg-neutral-300 dark:bg-neutral-700",
          )}
        >
          {t("app.question.submit")}
        </button>
      </div>
    </div>
  );
}

export default memo(UserQuestionBubble);

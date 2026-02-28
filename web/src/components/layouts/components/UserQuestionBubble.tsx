import { Input } from "@/components/base/Input";
import Markdown from "@/lib/Markdown";
import { useXyzen } from "@/store";
import type { UserQuestion } from "@/store/types";
import { CheckIcon, ClockIcon } from "@heroicons/react/24/outline";
import { PencilIcon } from "@heroicons/react/24/outline";
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
  const isMultiSelect = userQuestion.multiSelect ?? false;
  const hasOptions = userQuestion.options && userQuestion.options.length > 0;
  const hasMarkdownOptions = userQuestion.options?.some((o) => o.markdown);

  const [selectedIds, setSelectedIds] = useState<string[]>(
    userQuestion.selectedOptions ?? [],
  );
  const [showTextInput, setShowTextInput] = useState(
    !hasOptions && userQuestion.allowTextInput,
  );
  const [textInput, setTextInput] = useState(userQuestion.userText || "");
  const [focusedOptionId, setFocusedOptionId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(userQuestion.status !== "pending");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { respondToQuestion, activeChatChannel } = useXyzen(
    useShallow((s) => ({
      respondToQuestion: s.respondToQuestion,
      activeChatChannel: s.activeChatChannel,
    })),
  );

  const [remainingSeconds, setRemainingSeconds] = useState(() => {
    if (userQuestion.status !== "pending") return 0;
    const elapsed = Math.floor((Date.now() - userQuestion.askedAt) / 1000);
    return Math.max(0, userQuestion.timeoutSeconds - elapsed);
  });

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

  useEffect(() => {
    if (
      remainingSeconds === 0 &&
      userQuestion.status === "pending" &&
      !submitted
    ) {
      handleSubmit(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds]);

  const handleOptionClick = useCallback(
    (optionId: string) => {
      if (isMultiSelect) {
        setSelectedIds((prev) => {
          const deselecting = prev.includes(optionId);
          if (deselecting) {
            setFocusedOptionId(null);
            return prev.filter((id) => id !== optionId);
          }
          setFocusedOptionId(optionId);
          return [...prev, optionId];
        });
      } else {
        setSelectedIds([optionId]);
        setShowTextInput(false);
        setFocusedOptionId(optionId);
      }
    },
    [isMultiSelect],
  );

  const handleOtherClick = useCallback(() => {
    setShowTextInput((prev) => !prev);
    if (!isMultiSelect) {
      setSelectedIds([]);
      setFocusedOptionId(null);
    }
  }, [isMultiSelect]);

  const handleSubmit = useCallback(
    (timedOut = false) => {
      if (submitted || !activeChatChannel) return;
      setSubmitted(true);
      if (timerRef.current) clearInterval(timerRef.current);

      respondToQuestion(activeChatChannel, userQuestion.questionId, {
        selectedOptions: selectedIds.length > 0 ? selectedIds : undefined,
        text: textInput || undefined,
        timedOut,
      });
    },
    [
      submitted,
      activeChatChannel,
      respondToQuestion,
      userQuestion.questionId,
      selectedIds,
      textInput,
    ],
  );

  const formattedTime = useMemo(() => {
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, [remainingSeconds]);

  const focusedMarkdown = focusedOptionId
    ? userQuestion.options?.find((o) => o.id === focusedOptionId)?.markdown
    : undefined;

  // Description for the currently focused option (works in both single and multi-select)
  const focusedDescription = useMemo(() => {
    if (!focusedOptionId || !hasOptions) return null;
    return (
      userQuestion.options!.find((o) => o.id === focusedOptionId)
        ?.description ?? null
    );
  }, [focusedOptionId, hasOptions, userQuestion.options]);

  const isPending = userQuestion.status === "pending" && !submitted;

  // ── Answered state ──────────────────────────────────────────────────
  if (!isPending) {
    const statusText =
      userQuestion.status === "timed_out"
        ? t("app.question.timedOut")
        : t("app.question.answered");

    const answerLabels = (userQuestion.selectedOptions ?? [])
      .map((id) => userQuestion.options?.find((o) => o.id === id)?.label)
      .filter(Boolean);
    const answerSummary = [
      answerLabels.length > 0 ? answerLabels.join(", ") : null,
      userQuestion.userText,
    ]
      .filter(Boolean)
      .join(" — ");

    return (
      <div className="space-y-2">
        <p className="text-[13px] text-neutral-500 dark:text-neutral-400">
          {userQuestion.question}
        </p>
        <div className="flex items-center gap-1.5">
          <CheckIcon className="h-3.5 w-3.5 text-green-500" />
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            {statusText}
            {answerSummary && ` · ${answerSummary}`}
          </span>
        </div>
      </div>
    );
  }

  // ── Pending state ───────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <p className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
        {userQuestion.question}
      </p>

      {/* Option chips */}
      {hasOptions && (
        <div className="flex flex-wrap gap-1.5">
          {userQuestion.options!.map((option) => {
            const isSelected = selectedIds.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => handleOptionClick(option.id)}
                className={clsx(
                  "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[13px] transition-colors",
                  isSelected
                    ? "bg-indigo-50/80 font-medium text-indigo-600 ring-1 ring-indigo-500/30 dark:bg-indigo-950/30 dark:text-indigo-400 dark:ring-indigo-400/20"
                    : "bg-neutral-100/60 text-neutral-600 hover:bg-neutral-100 dark:bg-white/[0.04] dark:text-neutral-400 dark:hover:bg-white/[0.07]",
                )}
              >
                {isMultiSelect && isSelected && (
                  <CheckIcon className="h-3 w-3 shrink-0" />
                )}
                {option.label}
              </button>
            );
          })}

          {/* "Other" chip */}
          {userQuestion.allowTextInput && (
            <button
              type="button"
              onClick={handleOtherClick}
              className={clsx(
                "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[13px] transition-colors",
                showTextInput
                  ? "bg-indigo-50/80 font-medium text-indigo-600 ring-1 ring-indigo-500/30 dark:bg-indigo-950/30 dark:text-indigo-400 dark:ring-indigo-400/20"
                  : "bg-neutral-100/60 text-neutral-500 hover:bg-neutral-100 dark:bg-white/[0.04] dark:text-neutral-500 dark:hover:bg-white/[0.07]",
              )}
            >
              <PencilIcon className="h-3 w-3 shrink-0" />
              {t("app.question.other")}
            </button>
          )}
        </div>
      )}

      {/* Focused option description */}
      {focusedDescription && (
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          {focusedDescription}
        </p>
      )}

      {/* Markdown preview pane */}
      {hasMarkdownOptions && focusedMarkdown && (
        <div className="custom-scrollbar max-h-[200px] overflow-y-auto rounded-lg bg-neutral-100/60 p-3 text-[13px] dark:bg-white/[0.04]">
          <Markdown content={focusedMarkdown} />
        </div>
      )}

      {/* Free-text input */}
      {showTextInput && (
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
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ClockIcon className="h-3.5 w-3.5 text-neutral-300 dark:text-neutral-600" />
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            {t("app.question.remaining", { time: formattedTime })}
          </span>
        </div>
        <button
          type="button"
          onClick={() => handleSubmit()}
          disabled={selectedIds.length === 0 && !textInput}
          className={clsx(
            "rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-colors",
            selectedIds.length > 0 || textInput
              ? "bg-indigo-500 text-white hover:bg-indigo-600 dark:hover:bg-indigo-400"
              : "cursor-not-allowed bg-neutral-100/80 text-neutral-400 dark:bg-white/[0.04] dark:text-neutral-600",
          )}
        >
          {t("app.question.submit")}
        </button>
      </div>
    </div>
  );
}

export default memo(UserQuestionBubble);

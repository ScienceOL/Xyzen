import { Send } from "lucide-react";
import React, { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface LoftCeoInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

const LoftCeoInput: React.FC<LoftCeoInputProps> = ({
  onSend,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const composingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (composingRef.current) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value);
      // Auto-resize
      const el = e.target;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 72)}px`; // max ~3 lines
    },
    [],
  );

  return (
    <div className="flex items-end gap-2 rounded-2xl border border-amber-200/60 bg-white/80 px-4 py-2 shadow-sm backdrop-blur-sm dark:border-amber-800/40 dark:bg-neutral-900/80">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
        }}
        placeholder={t("app.loft.inputPlaceholder")}
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-neutral-100 dark:placeholder:text-neutral-500"
        style={{ maxHeight: "4.5rem" }}
      />
      <button
        onClick={handleSend}
        disabled={!value.trim() || disabled}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white transition-colors hover:bg-amber-600 disabled:opacity-40 dark:bg-amber-600 dark:hover:bg-amber-500"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  );
};

export default React.memo(LoftCeoInput);

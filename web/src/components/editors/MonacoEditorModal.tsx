import { SheetModal } from "@/components/animate-ui/components/animate/sheet-modal";
import * as monaco from "monaco-editor";
import { useTheme } from "next-themes";
import { memo, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

export interface MonacoEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  value: string;
  onChange: (value: string) => void;
  language?: string;
  readonly?: boolean;
}

/**
 * Fullscreen Monaco editor modal for in-memory text editing.
 * On "Done" → pushes value via onChange then closes.
 * On backdrop/X dismiss → closes without saving.
 */
function MonacoEditorModal({
  isOpen,
  onClose,
  title,
  value,
  onChange,
  language = "markdown",
  readonly = false,
}: MonacoEditorModalProps) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  // Initialize Monaco editor when modal opens
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;
    if (editorRef.current) return;

    const theme = resolvedTheme === "light" ? "vs" : "vs-dark";

    const editor = monaco.editor.create(containerRef.current, {
      value,
      language,
      theme,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      lineNumbers: "on",
      readOnly: readonly,
      fontSize: 13,
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      padding: { top: 12, bottom: 12 },
      bracketPairColorization: { enabled: true },
      folding: true,
      wordWrap: "on",
      tabSize: 2,
    });

    editorRef.current = editor;

    return () => {
      editor.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Update theme when it changes
  useEffect(() => {
    if (editorRef.current) {
      const theme = resolvedTheme === "light" ? "vs" : "vs-dark";
      monaco.editor.setTheme(theme);
    }
  }, [resolvedTheme]);

  // Cleanup editor on close
  useEffect(() => {
    if (!isOpen && editorRef.current) {
      editorRef.current.dispose();
      editorRef.current = null;
    }
  }, [isOpen]);

  const handleDone = useCallback(() => {
    if (editorRef.current && !readonly) {
      onChange(editorRef.current.getValue());
    }
    onClose();
  }, [onChange, onClose, readonly]);

  return (
    <SheetModal isOpen={isOpen} onClose={onClose} size="full">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-200/60 px-5 pb-3 pt-5 dark:border-neutral-800/60">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2 className="truncate text-lg font-semibold text-neutral-900 dark:text-white">
            {title}
          </h2>
          <span className="shrink-0 rounded bg-neutral-100/80 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-400">
            {language}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={onClose}
            className="rounded-lg bg-neutral-100/80 px-4 py-2 text-[13px] font-semibold text-neutral-700 hover:bg-neutral-200/80 dark:bg-white/[0.06] dark:text-neutral-300 dark:hover:bg-white/[0.1]"
          >
            {t("common.cancel")}
          </button>
          {!readonly && (
            <button
              onClick={handleDone}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-indigo-600 dark:hover:bg-indigo-400"
            >
              {t("common.done")}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </SheetModal>
  );
}

export default memo(MonacoEditorModal);

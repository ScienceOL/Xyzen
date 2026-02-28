import { SheetModal } from "@/components/animate-ui/components/animate/sheet-modal";
import { getLanguage } from "@/lib/language";
import * as monaco from "monaco-editor";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export interface FileEditorProps {
  isOpen: boolean;
  onClose: () => void;
  file: {
    id: string;
    name: string;
    contentType: string;
    size: number;
  };
  onLoadContent: (fileId: string) => Promise<Response>;
  onSaveContent: (fileId: string, content: string) => Promise<void>;
  readonly?: boolean;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

const AUTO_SAVE_DELAY = 1500;

export function FileEditor({
  isOpen,
  onClose,
  file,
  onLoadContent,
  onSaveContent,
  readonly = false,
}: FileEditorProps) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // Track the original content for dirty detection
  const originalContentRef = useRef<string>("");
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const language = getLanguage(file.name);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (savedIndicatorTimerRef.current)
        clearTimeout(savedIndicatorTimerRef.current);
    };
  }, []);

  // Load file content when opened
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSaveStatus("idle");

    onLoadContent(file.id)
      .then((response) => response.text())
      .then((text) => {
        if (cancelled) return;
        originalContentRef.current = text;
        setLoading(false);

        // If editor already mounted, set the value
        if (editorRef.current) {
          editorRef.current.setValue(text);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(
          err instanceof Error
            ? err.message
            : t("knowledge.fileEditor.loadError"),
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, file.id]);

  const doSave = useCallback(async () => {
    if (!editorRef.current || readonly) return;
    const content = editorRef.current.getValue();
    if (content === originalContentRef.current) return;

    setSaveStatus("saving");
    if (savedIndicatorTimerRef.current) {
      clearTimeout(savedIndicatorTimerRef.current);
      savedIndicatorTimerRef.current = null;
    }

    try {
      await onSaveContent(file.id, content);
      originalContentRef.current = content;
      setSaveStatus("saved");
      savedIndicatorTimerRef.current = setTimeout(
        () => setSaveStatus("idle"),
        2000,
      );
    } catch {
      setSaveStatus("error");
      savedIndicatorTimerRef.current = setTimeout(
        () => setSaveStatus("idle"),
        3000,
      );
    }
  }, [file.id, onSaveContent, readonly]);

  const scheduleSave = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      doSave();
    }, AUTO_SAVE_DELAY);
  }, [doSave]);

  // Initialize Monaco editor
  useEffect(() => {
    if (!isOpen || loading || loadError || !containerRef.current) return;
    if (editorRef.current) return;

    const theme = resolvedTheme === "light" ? "vs" : "vs-dark";

    const editor = monaco.editor.create(containerRef.current, {
      value: originalContentRef.current,
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

    editor.onDidChangeModelContent(() => {
      if (!readonly) {
        scheduleSave();
      }
    });

    // Ctrl+S / Cmd+S to force-save immediately
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (!readonly) {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        doSave();
      }
    });

    return () => {
      editor.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, loading, loadError, language, readonly]);

  // Update theme when it changes
  useEffect(() => {
    if (editorRef.current) {
      const theme = resolvedTheme === "light" ? "vs" : "vs-dark";
      monaco.editor.setTheme(theme);
    }
  }, [resolvedTheme]);

  // Cleanup editor on close — flush pending save first
  useEffect(() => {
    if (!isOpen && editorRef.current) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        // Fire a final save synchronously before disposing
        const content = editorRef.current.getValue();
        if (content !== originalContentRef.current) {
          onSaveContent(file.id, content).catch(() => {});
          originalContentRef.current = content;
        }
      }
      editorRef.current.dispose();
      editorRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  return (
    <SheetModal isOpen={isOpen} onClose={onClose} size="full">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-200/60 px-5 pb-3 pt-5 dark:border-neutral-800/60">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2 className="truncate text-lg font-semibold text-neutral-900 dark:text-white">
            {file.name}
          </h2>
          <span className="shrink-0 rounded bg-neutral-100/80 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-400">
            {language}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          {/* Auto-save status indicator */}
          {!readonly && <SaveIndicator status={saveStatus} />}
          <button
            onClick={onClose}
            className="rounded-lg bg-neutral-100/80 px-4 py-2 text-[13px] font-semibold text-neutral-700 hover:bg-neutral-200/80 dark:bg-white/[0.06] dark:text-neutral-300 dark:hover:bg-white/[0.1]"
          >
            {t("common.close")}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {loading && (
          <div className="flex h-full items-center justify-center text-[13px] text-neutral-400">
            Loading...
          </div>
        )}
        {loadError && (
          <div className="flex h-full items-center justify-center text-[13px] text-red-500">
            {loadError}
          </div>
        )}
        {!loading && !loadError && (
          <div ref={containerRef} className="h-full w-full" />
        )}
      </div>
    </SheetModal>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const { t } = useTranslation();

  if (status === "idle") return null;

  return (
    <span className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-500">
      {status === "saving" && (
        <>
          <svg
            className="h-3.5 w-3.5 animate-spin"
            viewBox="0 0 16 16"
            fill="none"
          >
            <circle
              cx="8"
              cy="8"
              r="6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="28"
              strokeDashoffset="8"
            />
          </svg>
          {t("knowledge.fileEditor.saving")}
        </>
      )}
      {status === "saved" && (
        <>
          <span className="h-2 w-2 rounded-full bg-green-500" />
          {t("knowledge.fileEditor.autoSaved")}
        </>
      )}
      {status === "error" && (
        <>
          <span className="h-2 w-2 rounded-full bg-red-500" />
          {t("knowledge.fileEditor.saveError")}
        </>
      )}
    </span>
  );
}

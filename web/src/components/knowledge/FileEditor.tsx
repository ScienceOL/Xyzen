import { SheetModal } from "@/components/animate-ui/components/animate/sheet-modal";
import ConfirmationModal from "@/components/modals/ConfirmationModal";
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
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  // Track the original content for dirty detection
  const originalContentRef = useRef<string>("");

  const language = getLanguage(file.name);

  // Load file content when opened
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setDirty(false);

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
      const current = editor.getValue();
      setDirty(current !== originalContentRef.current);
    });

    // Ctrl+S / Cmd+S to save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (!readonly) {
        handleSave();
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

  // Cleanup editor on close
  useEffect(() => {
    if (!isOpen && editorRef.current) {
      editorRef.current.dispose();
      editorRef.current = null;
    }
  }, [isOpen]);

  const handleSave = useCallback(async () => {
    if (!editorRef.current || readonly || saving) return;
    const content = editorRef.current.getValue();

    setSaving(true);
    try {
      await onSaveContent(file.id, content);
      originalContentRef.current = content;
      setDirty(false);
    } catch {
      // Error is handled by caller — toast or notification
    } finally {
      setSaving(false);
    }
  }, [file.id, onSaveContent, readonly, saving]);

  const handleClose = useCallback(() => {
    if (dirty) {
      setShowUnsavedDialog(true);
    } else {
      onClose();
    }
  }, [dirty, onClose]);

  const handleDiscardAndClose = useCallback(() => {
    setShowUnsavedDialog(false);
    setDirty(false);
    onClose();
  }, [onClose]);

  return (
    <>
      <SheetModal isOpen={isOpen} onClose={handleClose} size="full">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200/60 px-5 pb-3 pt-5 dark:border-neutral-800/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <h2 className="truncate text-lg font-semibold text-neutral-900 dark:text-white">
              {file.name}
            </h2>
            <span className="shrink-0 rounded bg-neutral-100/80 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-400">
              {language}
            </span>
            {dirty && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
            )}
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

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-neutral-200/60 px-5 py-4 dark:border-neutral-800/60">
          <button
            onClick={handleClose}
            className="rounded-lg bg-neutral-100/80 px-4 py-2 text-[13px] font-semibold text-neutral-700 hover:bg-neutral-200/80 dark:bg-white/[0.06] dark:text-neutral-300 dark:hover:bg-white/[0.1]"
          >
            {t("common.cancel")}
          </button>
          {!readonly && (
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-indigo-600 disabled:opacity-50 dark:hover:bg-indigo-400"
            >
              {saving
                ? t("knowledge.fileEditor.saving")
                : t("knowledge.fileEditor.save")}
            </button>
          )}
        </div>
      </SheetModal>

      <ConfirmationModal
        isOpen={showUnsavedDialog}
        onClose={() => setShowUnsavedDialog(false)}
        onConfirm={handleDiscardAndClose}
        title={t("knowledge.fileEditor.unsavedTitle")}
        message={t("knowledge.fileEditor.unsavedChanges")}
        confirmLabel={t("knowledge.fileEditor.discard")}
        cancelLabel={t("knowledge.fileEditor.keepEditing")}
        destructive
      />
    </>
  );
}

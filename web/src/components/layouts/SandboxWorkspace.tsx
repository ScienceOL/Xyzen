import {
  sandboxService,
  type SandboxEntry,
  type SandboxFileInfo,
} from "@/service/sandboxService";
import {
  ArrowPathIcon,
  ChevronLeftIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";
import { ChevronDownIcon, ChevronRightIcon, FolderIcon } from "lucide-react";
import * as monaco from "monaco-editor";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getLanguage } from "@/lib/language";

// --- File icon helper ---

function fileIcon(name: string) {
  const lower = name.toLowerCase();
  if (/\.(py|ts|tsx|js|jsx|sh|rb|go|rs|java|c|cpp|h)$/.test(lower)) {
    return <CodeBracketIcon className="h-3.5 w-3.5 text-indigo-500 shrink-0" />;
  }
  if (/\.(png|jpg|jpeg|gif|svg|webp)$/.test(lower)) {
    return <PhotoIcon className="h-3.5 w-3.5 text-pink-500 shrink-0" />;
  }
  return <DocumentTextIcon className="h-3.5 w-3.5 text-neutral-400 shrink-0" />;
}

// --- Sort: folders first, then alpha ---

function sortFiles(files: SandboxFileInfo[]): SandboxFileInfo[] {
  return [...files].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// ─── File Tree ───────────────────────────────────────────────────────

interface FileTreeProps {
  sessionId: string;
  selectedPath: string | null;
  onSelect: (file: SandboxFileInfo) => void;
}

function FileTree({ sessionId, selectedPath, onSelect }: FileTreeProps) {
  const { t } = useTranslation();
  const [rootFiles, setRootFiles] = useState<SandboxFileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [childrenCache, setChildrenCache] = useState<
    Record<string, SandboxFileInfo[]>
  >({});
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );

  const loadDir = useCallback(
    async (path?: string) => {
      if (!path) {
        setLoading(true);
        try {
          const res = await sandboxService.listFiles(sessionId, path);
          setRootFiles(sortFiles(res.files));
        } catch {
          // silently fail
        } finally {
          setLoading(false);
        }
        return;
      }
      // Load child dir
      if (childrenCache[path]) return;
      try {
        const res = await sandboxService.listFiles(sessionId, path);
        setChildrenCache((prev) => ({
          ...prev,
          [path]: sortFiles(res.files),
        }));
      } catch {
        setChildrenCache((prev) => ({ ...prev, [path]: [] }));
      }
    },
    [sessionId, childrenCache],
  );

  useEffect(() => {
    void loadDir();
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFolder = useCallback(
    (path: string) => {
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
          if (!childrenCache[path]) void loadDir(path);
        }
        return next;
      });
    },
    [childrenCache, loadDir],
  );

  const refresh = useCallback(() => {
    setChildrenCache({});
    setExpandedFolders(new Set());
    void loadDir();
  }, [loadDir]);

  const renderItems = (files: SandboxFileInfo[], depth: number) =>
    files.map((file) => {
      if (file.is_dir) {
        const isOpen = expandedFolders.has(file.path);
        const children = childrenCache[file.path];
        return (
          <div key={file.path}>
            <button
              onClick={() => toggleFolder(file.path)}
              className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800`}
              style={{ paddingLeft: `${depth * 12 + 6}px` }}
            >
              {isOpen ? (
                <ChevronDownIcon className="h-3 w-3 shrink-0 text-neutral-400" />
              ) : (
                <ChevronRightIcon className="h-3 w-3 shrink-0 text-neutral-400" />
              )}
              <FolderIcon className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              <span className="truncate text-neutral-700 dark:text-neutral-300">
                {file.name}
              </span>
            </button>
            {isOpen && children && (
              <div>{renderItems(children, depth + 1)}</div>
            )}
          </div>
        );
      }
      const isSelected = selectedPath === file.path;
      return (
        <button
          key={file.path}
          onClick={() => onSelect(file)}
          className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs transition-colors ${
            isSelected
              ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
              : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          }`}
          style={{ paddingLeft: `${depth * 12 + 6 + 16}px` }}
        >
          {fileIcon(file.name)}
          <span className="truncate">{file.name}</span>
        </button>
      );
    });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2 dark:border-neutral-800 shrink-0">
        <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
          {t("app.sandbox.explorer", "Explorer")}
        </span>
        <button
          onClick={refresh}
          className="rounded p-0.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800"
          title={t("common.refresh", "Refresh")}
        >
          <ArrowPathIcon className="h-3 w-3" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
        {loading ? (
          <p className="px-2 py-3 text-xs text-neutral-400">
            {t("common.loading", "Loading...")}
          </p>
        ) : rootFiles.length === 0 ? (
          <p className="px-2 py-3 text-xs text-neutral-400">
            {t("app.sandbox.emptyWorkspace", "No files")}
          </p>
        ) : (
          renderItems(rootFiles, 0)
        )}
      </div>
    </div>
  );
}

// ─── Monaco Viewer ──────────────────────────────────────────────────

interface MonacoViewerProps {
  sessionId: string;
  filePath: string;
  fileName: string;
}

function MonacoViewer({ sessionId, filePath, fileName }: MonacoViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const { resolvedTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const language = useMemo(() => getLanguage(fileName), [fileName]);

  // Load file content
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    sandboxService
      .getFileContent(sessionId, filePath)
      .then(async (blob) => {
        if (cancelled) return;
        const text = await blob.text();
        if (cancelled) return;

        // Create or update editor
        if (!containerRef.current) return;

        if (editorRef.current) {
          const model = editorRef.current.getModel();
          if (model) {
            monaco.editor.setModelLanguage(model, language);
            model.setValue(text);
          }
        } else {
          const theme = resolvedTheme === "light" ? "vs" : "vs-dark";
          editorRef.current = monaco.editor.create(containerRef.current, {
            value: text,
            language,
            theme,
            automaticLayout: true,
            readOnly: true,
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            lineNumbers: "on",
            fontSize: 13,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            padding: { top: 8, bottom: 8 },
            bracketPairColorization: { enabled: true },
            folding: true,
            wordWrap: "off",
            renderLineHighlight: "gutter",
          });
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Failed to load file");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // Intentionally exclude resolvedTheme — handled separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, filePath, language]);

  // Theme changes
  useEffect(() => {
    if (editorRef.current) {
      monaco.editor.setTheme(resolvedTheme === "light" ? "vs" : "vs-dark");
    }
  }, [resolvedTheme]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      editorRef.current?.dispose();
      editorRef.current = null;
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 dark:bg-neutral-950/80">
          <p className="text-sm text-neutral-400">Loading...</p>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

// ─── SandboxWorkspace ───────────────────────────────────────────────

interface SandboxWorkspaceProps {
  sandbox: SandboxEntry;
  onBack: () => void;
}

export default function SandboxWorkspace({
  sandbox,
  onBack,
}: SandboxWorkspaceProps) {
  const { t } = useTranslation();
  const [selectedFile, setSelectedFile] = useState<{
    path: string;
    name: string;
  } | null>(null);

  const handleSelect = useCallback((file: SandboxFileInfo) => {
    if (!file.is_dir) {
      setSelectedFile({ path: file.path, name: file.name });
    }
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800 shrink-0">
        <button
          onClick={onBack}
          className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">
            {sandbox.session_name || sandbox.session_id.slice(0, 8)}
          </p>
          {sandbox.agent_name && (
            <p className="truncate text-[10px] text-neutral-400">
              {sandbox.agent_name}
            </p>
          )}
        </div>
        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          {sandbox.backend}
        </span>
      </div>

      {/* Split: File tree (left) + Editor (right) */}
      <div className="flex flex-1 overflow-hidden">
        {/* File tree */}
        <div className="w-56 shrink-0 border-r border-neutral-200 dark:border-neutral-800">
          <FileTree
            sessionId={sandbox.session_id}
            selectedPath={selectedFile?.path ?? null}
            onSelect={handleSelect}
          />
        </div>

        {/* Editor area */}
        <div className="flex-1 min-w-0">
          {selectedFile ? (
            <MonacoViewer
              key={selectedFile.path}
              sessionId={sandbox.session_id}
              filePath={selectedFile.path}
              fileName={selectedFile.name}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-neutral-400 dark:text-neutral-500">
                {t(
                  "app.sandbox.selectFile",
                  "Select a file from the explorer to view",
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

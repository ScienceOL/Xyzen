import {
  Files,
  FileItem,
  FolderContent,
  FolderItem,
  FolderTrigger,
} from "@/components/animate-ui/components/radix/files";
import { useActiveChannelStatus } from "@/hooks/useChannelSelectors";
import {
  sandboxService,
  type SandboxFileInfo,
} from "@/service/sandboxService";
import {
  ArrowPathIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";
import { FolderIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

function fileIcon(name: string): ReactNode {
  const lower = name.toLowerCase();
  if (
    lower.endsWith(".py") ||
    lower.endsWith(".ts") ||
    lower.endsWith(".js") ||
    lower.endsWith(".tsx") ||
    lower.endsWith(".jsx") ||
    lower.endsWith(".sh") ||
    lower.endsWith(".rb") ||
    lower.endsWith(".go") ||
    lower.endsWith(".rs")
  ) {
    return <CodeBracketIcon className="h-3.5 w-3.5 text-indigo-500" />;
  }
  if (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".gif") ||
    lower.endsWith(".svg") ||
    lower.endsWith(".webp")
  ) {
    return <PhotoIcon className="h-3.5 w-3.5 text-pink-500" />;
  }
  return <DocumentTextIcon className="h-3.5 w-3.5" />;
}

export function SandboxTab() {
  const { t } = useTranslation();
  const { sessionId } = useActiveChannelStatus();

  const [sandboxActive, setSandboxActive] = useState(false);
  const [rootFiles, setRootFiles] = useState<SandboxFileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache of fetched folder contents keyed by path
  const [childrenCache, setChildrenCache] = useState<
    Record<string, SandboxFileInfo[]>
  >({});
  // Tracks which folders are currently loading
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set());
  // Tracks which folders the user has expanded (accordion values)
  const [expandedFolders, setExpandedFolders] = useState<string[]>([]);

  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const loadRoot = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    setChildrenCache({});
    setExpandedFolders([]);
    try {
      const res = await sandboxService.listFiles(sessionId);
      if (sessionIdRef.current !== sessionId) return;
      setSandboxActive(res.sandbox_active);
      setRootFiles(sortFiles(res.files));
    } catch {
      if (sessionIdRef.current !== sessionId) return;
      setError(t("capsule.sandbox.error"));
    } finally {
      if (sessionIdRef.current === sessionId) setLoading(false);
    }
  }, [sessionId, t]);

  useEffect(() => {
    if (!sessionId) {
      setRootFiles([]);
      setSandboxActive(false);
      return;
    }
    void loadRoot();
  }, [sessionId, loadRoot]);

  const loadFolder = useCallback(
    async (path: string) => {
      if (!sessionId || childrenCache[path]) return;
      setLoadingFolders((s) => new Set(s).add(path));
      try {
        const res = await sandboxService.listFiles(sessionId, path);
        setChildrenCache((prev) => ({
          ...prev,
          [path]: sortFiles(res.files),
        }));
      } catch {
        // Silently fail — folder will show empty
        setChildrenCache((prev) => ({ ...prev, [path]: [] }));
      } finally {
        setLoadingFolders((s) => {
          const next = new Set(s);
          next.delete(path);
          return next;
        });
      }
    },
    [sessionId, childrenCache],
  );

  const handleValueChange = useCallback(
    (values: string[]) => {
      setExpandedFolders(values);
      // Trigger lazy load for any newly expanded folder
      for (const path of values) {
        if (!childrenCache[path] && !loadingFolders.has(path)) {
          void loadFolder(path);
        }
      }
    },
    [childrenCache, loadingFolders, loadFolder],
  );

  if (!sessionId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
          {t("capsule.sandbox.noSession")}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-neutral-400 dark:text-neutral-500">
          {t("capsule.sandbox.loading")}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
        <button
          onClick={() => void loadRoot()}
          className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 underline"
        >
          {t("capsule.sandbox.refresh")}
        </button>
      </div>
    );
  }

  if (!sandboxActive) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
          {t("capsule.sandbox.noSandbox")}
        </p>
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          {t("capsule.sandbox.noSandboxHint")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 shrink-0 flex items-center justify-between">
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          /workspace
        </p>
        <button
          onClick={() => void loadRoot()}
          className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
          title={t("capsule.sandbox.refresh")}
        >
          <ArrowPathIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {rootFiles.length === 0 ? (
          <p className="text-xs text-neutral-400 dark:text-neutral-500 px-2 py-1">
            {t("capsule.sandbox.emptyFolder")}
          </p>
        ) : (
          <Files
            type="multiple"
            value={expandedFolders}
            onValueChange={handleValueChange}
            className="space-y-0.5"
          >
            {renderFileList(
              rootFiles,
              childrenCache,
              loadingFolders,
              t,
            )}
          </Files>
        )}
      </div>
    </div>
  );
}

function sortFiles(files: SandboxFileInfo[]): SandboxFileInfo[] {
  return [...files].sort((a, b) => {
    // Directories first
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function renderFileList(
  files: SandboxFileInfo[],
  childrenCache: Record<string, SandboxFileInfo[]>,
  loadingFolders: Set<string>,
  t: (key: string) => string,
): ReactNode[] {
  return files.map((file) => {
    if (file.is_dir) {
      const children = childrenCache[file.path];
      const isLoading = loadingFolders.has(file.path);
      return (
        <FolderItem key={file.path} value={file.path}>
          <FolderTrigger icon={<FolderIcon className="h-3.5 w-3.5 text-amber-500" />}>
            <span className="truncate">{file.name}</span>
          </FolderTrigger>
          <FolderContent className="space-y-0.5">
            {isLoading ? (
              <p className="text-xs text-neutral-400 dark:text-neutral-500 px-2 py-1">
                {t("capsule.sandbox.loading")}
              </p>
            ) : children && children.length === 0 ? (
              <p className="text-xs text-neutral-400 dark:text-neutral-500 px-2 py-1">
                {t("capsule.sandbox.emptyFolder")}
              </p>
            ) : children ? (
              renderFileList(children, childrenCache, loadingFolders, t)
            ) : null}
          </FolderContent>
        </FolderItem>
      );
    }

    return (
      <FileItem
        key={file.path}
        icon={fileIcon(file.name)}
      >
        <span className="truncate">{file.name}</span>
        {file.size != null && (
          <span className="ml-auto pl-2 shrink-0 text-[10px] text-neutral-400 dark:text-neutral-500">
            {formatFileSize(file.size)}
          </span>
        )}
      </FileItem>
    );
  });
}

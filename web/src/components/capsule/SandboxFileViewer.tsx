import { sandboxService } from "@/service/sandboxService";
import { ArrowDownTrayIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const TEXT_EXTENSIONS = new Set([
  ".py",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".txt",
  ".csv",
  ".yaml",
  ".yml",
  ".toml",
  ".cfg",
  ".ini",
  ".sh",
  ".bash",
  ".html",
  ".css",
  ".xml",
  ".sql",
  ".r",
  ".rb",
  ".go",
  ".rs",
  ".c",
  ".cpp",
  ".h",
  ".java",
  ".env",
  ".log",
  ".gitignore",
  ".dockerfile",
]);

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
]);

function getFileType(name: string): "text" | "image" | "other" {
  const lower = name.toLowerCase();
  const ext = lower.includes(".") ? `.${lower.split(".").pop()}` : "";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (TEXT_EXTENSIONS.has(ext)) return "text";
  // Dotfiles without extension (Makefile, Dockerfile, etc.)
  if (!ext && !lower.includes(".")) return "text";
  return "other";
}

interface SandboxFileViewerProps {
  sessionId: string;
  filePath: string;
  fileName: string;
  onClose: () => void;
}

export function SandboxFileViewer({
  sessionId,
  filePath,
  fileName,
  onClose,
}: SandboxFileViewerProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fileType = getFileType(fileName);

  const loadContent = useCallback(async () => {
    if (fileType === "other") {
      setError(null);
      setContent(null);
      setImageUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setContent(null);
    try {
      const blob = await sandboxService.getFileContent(sessionId, filePath);
      if (fileType === "image") {
        const objectUrl = URL.createObjectURL(blob);
        setImageUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return objectUrl;
        });
        return;
      }

      setImageUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      const text = await blob.text();
      setContent(text);
    } catch {
      setError(
        t("capsule.sandbox.viewer.loadError", {
          defaultValue: "Failed to load file",
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [sessionId, filePath, fileType, t]);

  useEffect(() => {
    void loadContent();
  }, [loadContent]);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const handleDownload = useCallback(async () => {
    try {
      const blob = await sandboxService.getFileContent(sessionId, filePath);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, [sessionId, filePath, fileName]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 shrink-0">
        <span className="text-xs font-mono text-neutral-600 dark:text-neutral-400 truncate flex-1">
          {filePath}
        </span>
        <button
          onClick={() => void handleDownload()}
          className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
          title={t("capsule.sandbox.viewer.download", {
            defaultValue: "Download",
          })}
        >
          <ArrowDownTrayIcon className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
          title={t("common.close", { defaultValue: "Close" })}
        >
          <XMarkIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-neutral-400">
              {t("capsule.sandbox.loading")}
            </p>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        ) : fileType === "image" && imageUrl ? (
          <div className="flex items-center justify-center p-4 h-full">
            <img
              src={imageUrl}
              alt={fileName}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        ) : fileType === "text" && content !== null ? (
          <pre className="p-3 text-xs font-mono text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap wrap-break-words">
            {content}
          </pre>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <p className="text-sm text-neutral-500">
              {t("capsule.sandbox.viewer.binaryFile", {
                defaultValue: "Binary file — download to view",
              })}
            </p>
            <button
              onClick={() => void handleDownload()}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {t("capsule.sandbox.viewer.download", {
                defaultValue: "Download",
              })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

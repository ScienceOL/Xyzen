import {
  Files,
  FileItem,
} from "@/components/animate-ui/components/radix/files";
import { useActiveChannelStatus } from "@/hooks/useChannelSelectors";
import { fileService, type FileUploadResponse } from "@/service/fileService";
import { knowledgeSetService } from "@/service/knowledgeSetService";
import type { KnowledgeSetWithFileCount } from "@/service/knowledgeSetService";
import {
  ArchiveBoxIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  FilmIcon,
  MusicalNoteIcon,
  PhotoIcon,
  PresentationChartBarIcon,
  TableCellsIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

function knowledgeFileIcon(filename: string, mimeType: string): ReactNode {
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  if (
    mimeType.startsWith("image/") ||
    ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)
  ) {
    return <PhotoIcon className="h-3.5 w-3.5 text-purple-500" />;
  }
  if (
    mimeType.startsWith("audio/") ||
    ["mp3", "wav", "ogg", "m4a"].includes(ext)
  ) {
    return <MusicalNoteIcon className="h-3.5 w-3.5 text-pink-500" />;
  }
  if (
    mimeType.startsWith("video/") ||
    ["mp4", "mov", "avi", "mkv"].includes(ext)
  ) {
    return <FilmIcon className="h-3.5 w-3.5 text-rose-500" />;
  }

  switch (ext) {
    case "pdf":
      return <DocumentTextIcon className="h-3.5 w-3.5 text-red-500" />;
    case "doc":
    case "docx":
      return <DocumentTextIcon className="h-3.5 w-3.5 text-blue-500" />;
    case "xls":
    case "xlsx":
    case "csv":
      return <TableCellsIcon className="h-3.5 w-3.5 text-green-500" />;
    case "ppt":
    case "pptx":
      return (
        <PresentationChartBarIcon className="h-3.5 w-3.5 text-orange-500" />
      );
    case "txt":
    case "md":
      return <DocumentTextIcon className="h-3.5 w-3.5 text-neutral-500" />;
    case "json":
      return <DocumentTextIcon className="h-3.5 w-3.5 text-yellow-500" />;
    case "zip":
    case "rar":
    case "7z":
    case "tar":
    case "gz":
      return <ArchiveBoxIcon className="h-3.5 w-3.5 text-amber-500" />;
    case "js":
    case "ts":
    case "jsx":
    case "tsx":
    case "py":
    case "html":
    case "css":
      return <CodeBracketIcon className="h-3.5 w-3.5 text-indigo-500" />;
    default:
      return <DocumentTextIcon className="h-3.5 w-3.5 text-neutral-400" />;
  }
}

export function KnowledgeTab() {
  const { t } = useTranslation();
  const { knowledge_set_id } = useActiveChannelStatus();

  const [knowledgeSet, setKnowledgeSet] =
    useState<KnowledgeSetWithFileCount | null>(null);
  const [files, setFiles] = useState<FileUploadResponse[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch knowledge set details
  useEffect(() => {
    if (!knowledge_set_id) {
      setKnowledgeSet(null);
      setFiles([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    knowledgeSetService
      .getKnowledgeSet(knowledge_set_id)
      .then((ks) => {
        if (!cancelled) setKnowledgeSet(ks);
      })
      .catch(() => {
        if (!cancelled) setKnowledgeSet(null);
      });

    knowledgeSetService
      .getFilesInKnowledgeSet(knowledge_set_id)
      .then(async (fileIds) => {
        if (cancelled) return;
        const details = await Promise.all(
          fileIds.map((id) => fileService.getFile(id).catch(() => null)),
        );
        if (!cancelled) {
          setFiles(details.filter((f): f is FileUploadResponse => f !== null));
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFiles([]);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [knowledge_set_id]);

  if (!knowledge_set_id) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
          {t("capsule.knowledge.noKnowledgeSet")}
        </p>
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          {t("capsule.knowledge.noKnowledgeSetHint")}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-neutral-400 dark:text-neutral-500">
          {t("capsule.knowledge.loading")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {knowledgeSet && (
        <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 shrink-0">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white truncate">
            {knowledgeSet.name}
          </h3>
          {knowledgeSet.description && (
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2">
              {knowledgeSet.description}
            </p>
          )}
          <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
            {t("capsule.knowledge.fileCount", {
              count: knowledgeSet.file_count,
            })}
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {files.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-neutral-400 dark:text-neutral-500">
              {t("capsule.knowledge.noFiles")}
            </p>
          </div>
        ) : (
          <Files type="multiple" className="w-full p-2">
            {files.map((file) => (
              <FileItem
                key={file.id}
                icon={knowledgeFileIcon(
                  file.original_filename,
                  file.content_type ?? "",
                )}
              >
                <span className="truncate">{file.original_filename}</span>
                <span className="ml-auto pl-2 shrink-0 text-[10px] text-neutral-400 dark:text-neutral-500">
                  {formatFileSize(file.file_size)}
                </span>
              </FileItem>
            ))}
          </Files>
        )}
      </div>
    </div>
  );
}

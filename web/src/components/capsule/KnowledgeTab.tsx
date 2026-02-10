import { FileIcon } from "@/components/knowledge/FileIcon";
import { useActiveChannelStatus } from "@/hooks/useChannelSelectors";
import { fileService, type FileUploadResponse } from "@/service/fileService";
import { knowledgeSetService } from "@/service/knowledgeSetService";
import type { KnowledgeSetWithFileCount } from "@/service/knowledgeSetService";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
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
      {/* Header */}
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

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {files.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-neutral-400 dark:text-neutral-500">
              {t("capsule.knowledge.noFiles")}
            </p>
          </div>
        ) : (
          <div className="p-2">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
              >
                <FileIcon
                  filename={file.original_filename}
                  mimeType={file.content_type}
                  className="h-5 w-5 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-neutral-800 dark:text-neutral-200 truncate">
                    {file.original_filename}
                  </p>
                </div>
                <span className="text-xs text-neutral-400 dark:text-neutral-500 shrink-0">
                  {formatFileSize(file.file_size)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

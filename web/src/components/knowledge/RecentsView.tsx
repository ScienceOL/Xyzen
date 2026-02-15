import { PreviewModal } from "@/components/preview/PreviewModal";
import type { PreviewFile } from "@/components/preview/types";
import { fileService, type FileUploadResponse } from "@/service/fileService";
import {
  knowledgeSetService,
  type KnowledgeSetWithFileCount,
} from "@/service/knowledgeSetService";
import { formatDistanceToNow } from "date-fns";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileIcon } from "./FileIcon";

interface RecentsViewProps {
  refreshTrigger: number;
  onKnowledgeSetClick: (id: string) => void;
  onCreateKnowledgeSet: () => void;
}

const formatSize = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const isImageFile = (mimeType: string) => {
  return mimeType.startsWith("image/");
};

/**
 * Animated folder icon with a front flap that opens on hover.
 * Built with two SVG layers (back panel + front flap) for the 3D-open effect.
 */
const AnimatedFolderIcon = () => (
  <div
    className="folder-icon-container relative w-14 h-12"
    style={{ perspective: "200px" }}
  >
    {/* Back panel */}
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 56 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4 10C4 7.79086 5.79086 6 8 6H20L24 2H48C50.2091 2 52 3.79086 52 6V42C52 44.2091 50.2091 46 48 46H8C5.79086 46 4 44.2091 4 42V10Z"
        className="fill-amber-400/80 dark:fill-amber-500/70"
      />
    </svg>
    {/* Front flap */}
    <svg
      className="folder-flap absolute inset-0 w-full h-full"
      viewBox="0 0 56 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ transformOrigin: "bottom center" }}
    >
      <path
        d="M2 16C2 13.7909 3.79086 12 6 12H50C52.2091 12 54 13.7909 54 16V44C54 46.2091 52.2091 48 50 48H6C3.79086 48 2 46.2091 2 44V16Z"
        className="fill-amber-500 dark:fill-amber-600"
      />
    </svg>
  </div>
);

export const RecentsView = ({
  refreshTrigger,
  onKnowledgeSetClick,
  onCreateKnowledgeSet,
}: RecentsViewProps) => {
  const { t } = useTranslation();
  const [knowledgeSets, setKnowledgeSets] = useState<
    KnowledgeSetWithFileCount[]
  >([]);
  const [recentFiles, setRecentFiles] = useState<FileUploadResponse[]>([]);
  const [isLoadingKS, setIsLoadingKS] = useState(true);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);

  // Preview modal state
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoadingKS(true);
    setIsLoadingFiles(true);

    try {
      const ks = await knowledgeSetService.listKnowledgeSets();
      const sorted = [...ks].sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      );
      setKnowledgeSets(sorted.slice(0, 8));
    } catch (e) {
      console.error("Failed to fetch knowledge sets", e);
    } finally {
      setIsLoadingKS(false);
    }

    try {
      const files = await fileService.listFiles({
        is_dir: false,
        limit: 20,
        offset: 0,
      });
      setRecentFiles(files);
    } catch (e) {
      console.error("Failed to fetch recent files", e);
    } finally {
      setIsLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshTrigger]);

  const handleFileDoubleClick = (file: FileUploadResponse) => {
    setPreviewFile({
      id: file.id,
      url: file.download_url,
      name: file.original_filename,
      type: file.content_type || "application/octet-stream",
      size: file.file_size,
    });
    setIsPreviewOpen(true);
  };

  return (
    <div className="p-4 sm:p-6 space-y-8">
      {/* --- CSS for folder-open hover animation --- */}
      <style>{`
        .knowledge-card:hover .folder-flap {
          transform: rotateX(-35deg);
        }
        .folder-flap {
          transition: transform 0.3s ease;
        }
      `}</style>

      {/* Knowledge Sets Section */}
      <section>
        <h2 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-4">
          {t("knowledge.recents.knowledgeSets")}
        </h2>

        {isLoadingKS ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-32 rounded-xl bg-neutral-200/50 dark:bg-neutral-800/50 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {/* Permanent "Add" card */}
            <button
              type="button"
              className="group flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-600 cursor-pointer text-center transition-all duration-200 hover:border-neutral-400 hover:bg-neutral-100/60 dark:hover:border-neutral-500 dark:hover:bg-neutral-800/40"
              onClick={onCreateKnowledgeSet}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400 transition-colors group-hover:bg-neutral-200 group-hover:text-neutral-600 dark:bg-neutral-800 dark:text-neutral-500 dark:group-hover:bg-neutral-700 dark:group-hover:text-neutral-300">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
              </div>
              <span className="text-sm font-medium text-neutral-400 dark:text-neutral-500">
                {t("knowledge.recents.createKnowledgeSet")}
              </span>
            </button>

            {knowledgeSets.map((ks) => (
              <button
                key={ks.id}
                type="button"
                className="knowledge-card group flex flex-col items-center gap-2 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700/50 bg-white/80 dark:bg-neutral-800/80 cursor-pointer text-left transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
                onClick={() => onKnowledgeSetClick(ks.id)}
              >
                <AnimatedFolderIcon />
                <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate w-full text-center">
                  {ks.name}
                </span>
                <span className="text-xs text-neutral-400 dark:text-neutral-500 text-center">
                  {t("knowledge.recents.fileCount", { count: ks.file_count })}
                  {" · "}
                  {t("knowledge.recents.updated", {
                    date: formatDistanceToNow(new Date(ks.updated_at), {
                      addSuffix: true,
                    }),
                  })}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Recent Files Section */}
      <section>
        <h2 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-4">
          {t("knowledge.recents.recentFiles")}
        </h2>

        {isLoadingFiles ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-10 rounded-lg bg-neutral-200/50 dark:bg-neutral-800/50 animate-pulse"
              />
            ))}
          </div>
        ) : recentFiles.length === 0 ? (
          <p className="text-sm text-neutral-400 dark:text-neutral-500">
            {t("knowledge.recents.noRecentFiles")}
          </p>
        ) : (
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800/50">
            {recentFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-3 py-2.5 px-2 rounded-lg cursor-pointer hover:bg-neutral-100/60 dark:hover:bg-neutral-800/40 transition-colors group"
                onDoubleClick={() => handleFileDoubleClick(file)}
              >
                {/* Thumbnail or icon */}
                {isImageFile(file.content_type || "") ? (
                  <div className="h-8 w-8 flex-shrink-0 rounded overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                    <FileIcon
                      filename={file.original_filename}
                      mimeType={file.content_type || ""}
                      className="h-8 w-8"
                    />
                  </div>
                ) : (
                  <FileIcon
                    filename={file.original_filename}
                    mimeType={file.content_type || ""}
                    className="h-6 w-6 flex-shrink-0"
                  />
                )}

                {/* Name */}
                <span className="flex-1 text-sm text-neutral-700 dark:text-neutral-300 truncate">
                  {file.original_filename}
                </span>

                {/* Size */}
                <span className="text-xs text-neutral-400 dark:text-neutral-500 hidden sm:block w-16 text-right">
                  {formatSize(file.file_size)}
                </span>

                {/* Date */}
                <span className="text-xs text-neutral-400 dark:text-neutral-500 w-24 text-right hidden sm:block">
                  {formatDistanceToNow(new Date(file.created_at), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Preview Modal */}
      <PreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        file={previewFile}
      />
    </div>
  );
};

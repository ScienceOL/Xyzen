import { XMarkIcon } from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";

export interface UploadItem {
  id: string;
  fileName: string;
  progress: number;
  status: "uploading" | "completed" | "error" | "cancelled";
  error?: string;
}

interface UploadProgressProps {
  uploads: UploadItem[];
  onCancel: (id: string) => void;
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
}

// const formatFileSize = (bytes: number) => {
//   if (bytes === 0) return "0 B";
//   const k = 1024;
//   const sizes = ["B", "KB", "MB", "GB"];
//   const i = Math.floor(Math.log(bytes) / Math.log(k));
//   return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
// };

export const UploadProgress = ({
  uploads,
  onCancel,
  onDismiss,
  onDismissAll,
}: UploadProgressProps) => {
  const { t } = useTranslation();

  if (uploads.length === 0) return null;

  const activeUploads = uploads.filter((u) => u.status === "uploading");
  // const completedUploads = uploads.filter((u) => u.status === "completed");
  // const hasErrors = uploads.some(
  //   (u) => u.status === "error" || u.status === "cancelled",
  // );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            {activeUploads.length > 0
              ? t("knowledge.uploadProgress.uploading", {
                  count: activeUploads.length,
                })
              : t("knowledge.uploadProgress.complete")}
          </h3>
          {activeUploads.length > 0 && (
            <div className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
          )}
        </div>
        <button
          onClick={onDismissAll}
          className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          title={t("common.close")}
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Upload List */}
      <div className="max-h-64 overflow-y-auto">
        <AnimatePresence mode="popLayout">
          {uploads.map((upload) => (
            <motion.div
              key={upload.id}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="border-b border-neutral-100 px-4 py-3 last:border-b-0 dark:border-neutral-800/50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {upload.fileName}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    {upload.status === "uploading" && (
                      <>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                          <motion.div
                            className="h-full bg-indigo-500"
                            initial={{ width: 0 }}
                            animate={{ width: `${upload.progress}%` }}
                            transition={{ duration: 0.3 }}
                          />
                        </div>
                        <span className="text-xs text-neutral-500 dark:text-neutral-400">
                          {upload.progress}%
                        </span>
                      </>
                    )}
                    {upload.status === "completed" && (
                      <span className="text-xs text-green-600 dark:text-green-400">
                        {t("knowledge.uploadProgress.completed")}
                      </span>
                    )}
                    {upload.status === "error" && (
                      <span className="text-xs text-red-600 dark:text-red-400">
                        {upload.error || t("knowledge.uploadProgress.failed")}
                      </span>
                    )}
                    {upload.status === "cancelled" && (
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                        {t("knowledge.uploadProgress.cancelled")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center">
                  {upload.status === "uploading" ? (
                    <button
                      onClick={() => onCancel(upload.id)}
                      className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-red-500 dark:hover:bg-neutral-800"
                      title={t("common.cancel")}
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => onDismiss(upload.id)}
                      className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800"
                      title={t("common.dismiss")}
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Footer - Cancel All button when multiple uploads */}
      {activeUploads.length > 1 && (
        <div className="border-t border-neutral-200 px-4 py-2 dark:border-neutral-800">
          <button
            onClick={() => activeUploads.forEach((u) => onCancel(u.id))}
            className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
          >
            {t("knowledge.uploadProgress.cancelAll")}
          </button>
        </div>
      )}
    </motion.div>
  );
};

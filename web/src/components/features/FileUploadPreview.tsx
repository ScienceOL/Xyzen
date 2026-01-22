import React from "react";
import { useXyzen } from "@/store";
import { FileUploadThumbnail } from "./FileUploadThumbnail";
import clsx from "clsx";

export interface FileUploadPreviewProps {
  className?: string;
}

function FileUploadPreviewComponent({ className }: FileUploadPreviewProps) {
  // Use selective subscriptions to avoid re-renders from unrelated store changes
  const uploadedFiles = useXyzen((state) => state.uploadedFiles);
  const isUploading = useXyzen((state) => state.isUploading);
  const uploadError = useXyzen((state) => state.uploadError);

  if (uploadedFiles.length === 0) {
    return null;
  }

  return (
    <div
      className={clsx(
        "flex flex-col gap-2 px-3 py-2",
        "border-t border-neutral-200 dark:border-neutral-700",
        "bg-neutral-50 dark:bg-neutral-900/50",
        className,
      )}
    >
      {/* Error Message */}
      {uploadError && (
        <div className="text-xs text-red-600 dark:text-red-400 px-2 py-1 bg-red-50 dark:bg-red-900/20 rounded">
          {uploadError}
        </div>
      )}

      {/* File Grid */}
      <div className="flex flex-wrap gap-2">
        {uploadedFiles.map((file) => (
          <FileUploadThumbnail key={file.id} file={file} />
        ))}
      </div>

      {/* Upload Status */}
      {isUploading && (
        <div className="text-xs text-neutral-600 dark:text-neutral-400 px-2">
          Uploading files...
        </div>
      )}

      {/* File Count and Size */}
      {uploadedFiles.length > 0 && !isUploading && (
        <div className="text-xs text-neutral-500 dark:text-neutral-400 px-2">
          {uploadedFiles.length} file{uploadedFiles.length > 1 ? "s" : ""} •{" "}
          {(
            uploadedFiles.reduce((sum, file) => sum + file.size, 0) /
            (1024 * 1024)
          ).toFixed(2)}{" "}
          MB
        </div>
      )}
    </div>
  );
}

export const FileUploadPreview = React.memo(FileUploadPreviewComponent);

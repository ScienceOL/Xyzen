import {
  XMarkIcon,
  DocumentIcon,
  MusicalNoteIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";
import clsx from "clsx";
import { useXyzen } from "@/store";
import type { UploadedFile } from "@/types/file";

export interface FileUploadThumbnailProps {
  file: UploadedFile;
}

export function FileUploadThumbnail({ file }: FileUploadThumbnailProps) {
  const { removeFile, retryUpload } = useXyzen();

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    removeFile(file.id);
  };

  const handleRetry = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    retryUpload(file.id);
  };

  const getFileIcon = () => {
    if (file.category === "images") {
      return <PhotoIcon className="h-6 w-6" />;
    }
    if (file.category === "audio") {
      return <MusicalNoteIcon className="h-6 w-6" />;
    }
    return <DocumentIcon className="h-6 w-6" />;
  };

  const getStatusColor = () => {
    switch (file.status) {
      case "completed":
        return "border-green-500";
      case "uploading":
        return "border-blue-500";
      case "error":
        return "border-red-500";
      default:
        return "border-neutral-300 dark:border-neutral-600";
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div
      className={clsx(
        "relative group flex flex-col items-center justify-center",
        "w-20 h-20 rounded-lg border-2 overflow-hidden",
        "bg-white dark:bg-neutral-900",
        "transition-all duration-200",
        getStatusColor(),
      )}
    >
      {/* Thumbnail or Icon */}
      <div className="relative w-full h-full flex items-center justify-center">
        {file.thumbnailUrl && file.category === "images" ? (
          <img
            src={file.thumbnailUrl}
            alt={file.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-neutral-500 dark:text-neutral-400">
            {getFileIcon()}
          </div>
        )}

        {/* Upload Progress Overlay */}
        {file.status === "uploading" && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <svg className="w-12 h-12 transform -rotate-90">
              <circle
                cx="24"
                cy="24"
                r="20"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                className="text-neutral-700"
              />
              <circle
                cx="24"
                cy="24"
                r="20"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 20}`}
                strokeDashoffset={`${2 * Math.PI * 20 * (1 - file.progress / 100)}`}
                className="text-white transition-all duration-300"
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute text-white text-xs font-medium">
              {file.progress}%
            </span>
          </div>
        )}

        {/* Error State */}
        {file.status === "error" && (
          <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
            <button
              onClick={handleRetry}
              className="text-xs text-red-700 dark:text-red-300 font-medium hover:underline"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Delete Button */}
      <button
        onClick={handleRemove}
        className={clsx(
          "absolute -top-2 -right-2 z-10",
          "w-6 h-6 rounded-full",
          "bg-red-500 hover:bg-red-600",
          "text-white",
          "flex items-center justify-center",
          "shadow-lg",
          "transition-all duration-200",
          "opacity-0 group-hover:opacity-100",
          "focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2",
        )}
        title="Remove file"
        aria-label="Remove file"
      >
        <XMarkIcon className="h-4 w-4" />
      </button>

      {/* File Name Tooltip */}
      <div
        className={clsx(
          "absolute bottom-0 left-0 right-0",
          "px-1 py-0.5",
          "bg-black/70 text-white",
          "text-[10px] leading-tight",
          "truncate",
          "opacity-0 group-hover:opacity-100",
          "transition-opacity duration-200",
        )}
        title={`${file.name} (${formatFileSize(file.size)})`}
      >
        {file.name}
      </div>
    </div>
  );
}

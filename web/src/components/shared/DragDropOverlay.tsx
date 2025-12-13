import clsx from "clsx";

export interface DragDropOverlayProps {
  isVisible: boolean;
  title?: string;
  subtitle?: string;
  maxFiles?: number;
  canAddMore?: boolean;
  className?: string;
}

/**
 * Reusable overlay component shown when files are being dragged over a drop zone
 */
export function DragDropOverlay({
  isVisible,
  title = "Drop files here",
  subtitle,
  maxFiles,
  canAddMore = true,
  className,
}: DragDropOverlayProps) {
  if (!isVisible) return null;

  const subtitleText =
    subtitle ||
    (canAddMore
      ? maxFiles
        ? `Up to ${maxFiles} files`
        : "Drop your files"
      : "Maximum files reached");

  return (
    <div
      className={clsx(
        "absolute inset-0 z-50 flex items-center justify-center",
        "bg-blue-50/95 dark:bg-blue-950/95",
        "border-2 border-dashed border-blue-400 dark:border-blue-600",
        "rounded-lg backdrop-blur-sm",
        "transition-opacity duration-200",
        className,
      )}
    >
      <div className="text-center pointer-events-none">
        <div className="mb-2">
          <svg
            className="mx-auto h-12 w-12 text-blue-500 dark:text-blue-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>
        <p className="text-lg font-medium text-blue-700 dark:text-blue-300">
          {title}
        </p>
        <p className="mt-1 text-sm text-blue-600 dark:text-blue-400">
          {subtitleText}
        </p>
      </div>
    </div>
  );
}

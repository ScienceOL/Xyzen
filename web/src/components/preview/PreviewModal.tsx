import { SheetModal } from "@/components/animate-ui/components/animate/sheet-modal";
import { fileService } from "@/service/fileService";
import { ArrowDownTrayIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { AudioRenderer } from "./renderers/AudioRenderer";
import { ImageRenderer } from "./renderers/ImageRenderer";
import { MarkdownRenderer } from "./renderers/MarkdownRenderer";
import { PdfRenderer } from "./renderers/PdfRenderer";
import { VideoRenderer } from "./renderers/VideoRenderer";
import type { PreviewFile } from "./types";

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: PreviewFile | null;
}

function SkeletonLoader() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8">
      {/* Placeholder image icon */}
      <div className="animate-pulse rounded-lg bg-neutral-200/60 p-6 dark:bg-white/[0.06]">
        <svg
          className="h-16 w-16 text-neutral-300 dark:text-neutral-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z"
          />
        </svg>
      </div>
      {/* Pulse bar */}
      <div className="h-2 w-32 animate-pulse rounded-full bg-neutral-200/60 dark:bg-white/[0.06]" />
    </div>
  );
}

export const PreviewModal = ({ isOpen, onClose, file }: PreviewModalProps) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && file) {
      let active = true;
      const loadContent = async () => {
        setLoading(true);
        setError(null);
        try {
          // If we already have a direct local blob/data URL, use it directly
          if (
            file.url &&
            (file.url.startsWith("blob:") || file.url.startsWith("data:"))
          ) {
            setBlobUrl(file.url);
            setLoading(false);
            return;
          }

          // Download via backend proxy
          const response = await fileService.downloadRaw(file.id);

          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);

          if (active) {
            setBlobUrl(objectUrl);
          } else {
            URL.revokeObjectURL(objectUrl);
          }
        } catch (err: unknown) {
          console.error(err);
          if (active) {
            const errorMessage =
              err instanceof Error
                ? err.message
                : "Failed to load file preview";
            setError(errorMessage);
          }
        } finally {
          if (active) setLoading(false);
        }
      };

      loadContent();

      return () => {
        active = false;
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
          setBlobUrl(null);
        }
      };
    } else {
      setBlobUrl(null);
    }
    // Intentionally omitting blobUrl - it's used in cleanup and would cause infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, file]);

  const isPdf = file?.type.toLowerCase() === "application/pdf";

  const renderContent = () => {
    if (loading) return <SkeletonLoader />;
    if (error)
      return (
        <div className="flex h-full items-center justify-center p-8">
          <div className="text-[13px] text-red-500">{error}</div>
        </div>
      );
    if (!file || !blobUrl) return null;

    const type = file.type.toLowerCase();

    if (type.startsWith("image/")) {
      return <ImageRenderer file={file} url={blobUrl} />;
    }
    if (type.startsWith("video/")) {
      return <VideoRenderer file={file} url={blobUrl} />;
    }
    if (type.startsWith("audio/")) {
      return <AudioRenderer file={file} url={blobUrl} />;
    }
    if (type === "application/pdf") {
      return <PdfRenderer file={file} url={blobUrl} />;
    }
    if (
      type === "text/markdown" ||
      type === "text/plain" ||
      file.name.endsWith(".md") ||
      file.name.endsWith(".txt")
    ) {
      return <MarkdownRenderer file={file} url={blobUrl} />;
    }

    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-neutral-700 dark:text-neutral-300">
        <p className="text-[13px]">Preview not available for this file type.</p>
        <a
          href={blobUrl}
          download={file.name}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-indigo-600 dark:hover:bg-indigo-400"
          title="Download"
        >
          Download File
        </a>
      </div>
    );
  };

  return (
    <SheetModal
      isOpen={isOpen}
      onClose={onClose}
      desktopClassName="md:h-[85vh] md:max-w-5xl"
    >
      {/* Floating toolbar — overlaid on top of content, hidden for PDF (has its own toolbar) */}
      {!isPdf && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-4">
          <span className="pointer-events-auto max-w-[70%] truncate rounded-lg bg-black/40 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur-md">
            {file?.name}
          </span>
          <div className="pointer-events-auto flex items-center gap-1.5">
            {blobUrl && (
              <a
                href={blobUrl}
                download={file?.name}
                className="rounded-lg bg-black/40 p-2 text-white/80 backdrop-blur-md transition-colors hover:bg-black/60 hover:text-white"
                title="Download"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
              </a>
            )}
            <button
              onClick={onClose}
              className="rounded-lg bg-black/40 p-2 text-white/80 backdrop-blur-md transition-colors hover:bg-black/60 hover:text-white"
              title="Close"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Content — fills the entire modal */}
      <div className="relative flex min-h-[60vh] flex-1 items-center justify-center overflow-hidden md:min-h-0">
        {renderContent()}
      </div>
    </SheetModal>
  );
};

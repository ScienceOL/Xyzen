import {
  DocumentIcon,
  MusicalNoteIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";
import type { MessageAttachment } from "@/store/types";
import { useState, useEffect, useCallback } from "react";
import clsx from "clsx";
import { useXyzen } from "@/store";
import { motion, AnimatePresence } from "framer-motion";

interface MessageAttachmentsProps {
  attachments: MessageAttachment[];
  className?: string;
}

export default function MessageAttachments({
  attachments,
  className,
}: MessageAttachmentsProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedPdf, setSelectedPdf] = useState<string | null>(null);
  const [imageBlobUrls, setImageBlobUrls] = useState<Record<string, string>>(
    {},
  );
  const [fileBlobUrls, setFileBlobUrls] = useState<Record<string, string>>({});
  const [imageLoadingStates, setImageLoadingStates] = useState<
    Record<string, boolean>
  >({});
  const [fileLoadingStates, setFileLoadingStates] = useState<
    Record<string, boolean>
  >({});
  const backendUrl = useXyzen((state) => state.backendUrl);
  const token = useXyzen((state) => state.token);

  // Helper to convert relative URLs to absolute
  const getFullUrl = useCallback(
    (url: string | undefined): string => {
      if (!url) return "";
      if (url.startsWith("http://") || url.startsWith("https://")) {
        return url;
      }
      // Relative URL - prepend backend URL
      const base = backendUrl || window.location.origin;
      return `${base}${url.startsWith("/") ? url : `/${url}`}`;
    },
    [backendUrl],
  );

  // Fetch images with authentication and convert to blob URLs
  useEffect(() => {
    const imageAttachments = attachments.filter(
      (att) => att.category === "images" && att.download_url,
    );

    const fetchImages = async () => {
      const newBlobUrls: Record<string, string> = {};
      const loadingStates: Record<string, boolean> = {};

      for (const image of imageAttachments) {
        if (!image.download_url) continue;
        if (imageBlobUrls[image.id]) continue; // Already fetched

        // Set loading state
        loadingStates[image.id] = true;
        setImageLoadingStates((prev) => ({ ...prev, [image.id]: true }));

        try {
          const fullUrl = getFullUrl(image.download_url);
          const response = await fetch(fullUrl, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });

          if (response.ok) {
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            newBlobUrls[image.id] = blobUrl;
          }
        } catch (error) {
          console.error(`Failed to fetch image ${image.id}:`, error);
        } finally {
          setImageLoadingStates((prev) => ({ ...prev, [image.id]: false }));
        }
      }

      if (Object.keys(newBlobUrls).length > 0) {
        setImageBlobUrls((prev) => ({ ...prev, ...newBlobUrls }));
      }
    };

    fetchImages();

    // Cleanup blob URLs when component unmounts
    return () => {
      Object.values(imageBlobUrls).forEach((url) => URL.revokeObjectURL(url));
    };
    // Intentionally omitting imageBlobUrls and getFullUrl - we check imageBlobUrls[image.id] to avoid re-fetching
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments, backendUrl, token]);

  // Fetch audio and document files with authentication
  useEffect(() => {
    const fileAttachments = attachments.filter(
      (att) =>
        (att.category === "audio" || att.category === "documents") &&
        att.download_url,
    );

    const fetchFiles = async () => {
      const newBlobUrls: Record<string, string> = {};

      for (const file of fileAttachments) {
        if (!file.download_url) continue;
        if (fileBlobUrls[file.id]) continue; // Already fetched

        // Set loading state
        setFileLoadingStates((prev) => ({ ...prev, [file.id]: true }));

        try {
          const fullUrl = getFullUrl(file.download_url);
          const response = await fetch(fullUrl, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });

          if (response.ok) {
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            newBlobUrls[file.id] = blobUrl;
          }
        } catch (error) {
          console.error(`Failed to fetch file ${file.id}:`, error);
        } finally {
          setFileLoadingStates((prev) => ({ ...prev, [file.id]: false }));
        }
      }

      if (Object.keys(newBlobUrls).length > 0) {
        setFileBlobUrls((prev) => ({ ...prev, ...newBlobUrls }));
      }
    };

    fetchFiles();

    // Cleanup blob URLs when component unmounts
    return () => {
      Object.values(fileBlobUrls).forEach((url) => URL.revokeObjectURL(url));
    };
    // Intentionally omitting fileBlobUrls and getFullUrl - we check fileBlobUrls[file.id] to avoid re-fetching
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments, backendUrl, token]);

  const getImageUrl = (image: MessageAttachment): string => {
    // Use blob URL if available, otherwise fallback to thumbnail or download URL
    return (
      imageBlobUrls[image.id] ||
      image.thumbnail_url ||
      getFullUrl(image.download_url) ||
      ""
    );
  };

  if (!attachments || attachments.length === 0) {
    return null;
  }

  const images = attachments.filter((att) => att.category === "images");
  const documents = attachments.filter((att) => att.category === "documents");
  const audio = attachments.filter((att) => att.category === "audio");
  const others = attachments.filter((att) => att.category === "others");

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const getFileIcon = (category: string) => {
    switch (category) {
      case "images":
        return <PhotoIcon className="h-5 w-5" />;
      case "audio":
        return <MusicalNoteIcon className="h-5 w-5" />;
      case "documents":
        return <DocumentIcon className="h-5 w-5" />;
      default:
        return <DocumentIcon className="h-5 w-5" />;
    }
  };

  return (
    <div className={clsx("space-y-2", className)}>
      {/* Images - Grid layout for thumbnails */}
      {images.length > 0 && (
        <div
          className={clsx(
            "grid gap-2",
            images.length === 1 && "grid-cols-1 max-w-xs",
            images.length === 2 && "grid-cols-2 max-w-md",
            images.length >= 3 && "grid-cols-3 max-w-lg",
          )}
        >
          {images.map((image) => (
            <div
              key={image.id}
              className="relative group cursor-pointer overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800"
              style={{ height: "120px", width: "100%" }}
              onClick={() =>
                !imageLoadingStates[image.id] &&
                setSelectedImage(getImageUrl(image))
              }
            >
              {imageLoadingStates[image.id] ? (
                <div className="w-full h-full relative overflow-hidden bg-neutral-200 dark:bg-neutral-800">
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 dark:via-white/10 to-transparent"
                    animate={{
                      x: ["-100%", "200%"],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                    style={{
                      backgroundSize: "200% 100%",
                    }}
                  />
                </div>
              ) : (
                <>
                  <img
                    src={getImageUrl(image)}
                    alt={image.name}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    onError={(e) => {
                      // Fallback to thumbnail if blob URL fails
                      const target = e.target as HTMLImageElement;
                      if (
                        image.thumbnail_url &&
                        target.src !== image.thumbnail_url
                      ) {
                        target.src = image.thumbnail_url;
                      }
                    }}
                  />
                  {/* Hover overlay with file name */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end p-2">
                    <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity truncate">
                      {image.name}
                    </span>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Documents - Card layout with preview */}
      {documents.length > 0 && (
        <div
          className={clsx(
            "grid gap-2",
            documents.length === 1 && "grid-cols-1 max-w-xs",
            documents.length === 2 && "grid-cols-2 max-w-md",
            documents.length >= 3 && "grid-cols-3 max-w-lg",
          )}
        >
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="group relative overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              style={{ height: "140px", width: "100%" }}
              onClick={() => {
                if (fileBlobUrls[doc.id]) {
                  setSelectedPdf(fileBlobUrls[doc.id]);
                }
              }}
            >
              {fileLoadingStates[doc.id] ? (
                <div className="w-full h-full relative overflow-hidden bg-neutral-200 dark:bg-neutral-800">
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 dark:via-white/10 to-transparent"
                    animate={{
                      x: ["-100%", "200%"],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                  />
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-3">
                  <div className="w-16 h-16 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-2">
                    <svg
                      className="h-8 w-8 text-red-600 dark:text-red-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200 text-center truncate w-full px-1">
                    {doc.name || "Document"}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 text-center">
                    {doc.size ? formatFileSize(doc.size) : "Unknown size"}
                  </p>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div className="bg-white/90 dark:bg-neutral-800/90 rounded-full p-2">
                      <svg
                        className="h-5 w-5 text-neutral-800 dark:text-neutral-200"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Audio - List layout with audio player */}
      {audio.length > 0 && (
        <div className="space-y-1">
          {audio.map((aud) => (
            <div
              key={aud.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50"
            >
              <div className="flex-shrink-0 text-purple-600 dark:text-purple-400">
                {getFileIcon("audio")}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">
                  {aud.name}
                </p>
                {fileBlobUrls[aud.id] ? (
                  <audio
                    controls
                    className="w-full mt-1"
                    style={{ maxHeight: "40px" }}
                  >
                    <source src={fileBlobUrls[aud.id]} type={aud.type} />
                    Your browser does not support the audio element.
                  </audio>
                ) : (
                  <div className="w-full h-10 mt-1 bg-neutral-200 dark:bg-neutral-700 rounded relative overflow-hidden">
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent"
                      animate={{
                        x: ["-100%", "200%"],
                      }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Other files - Simple list */}
      {others.length > 0 && (
        <div className="space-y-1">
          {others.map((other) => (
            <a
              key={other.id}
              href={fileBlobUrls[other.id] || "#"}
              download={other.name}
              onClick={(e) => {
                if (!fileBlobUrls[other.id]) {
                  e.preventDefault();
                  console.warn("File blob URL not ready yet");
                }
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <div className="flex-shrink-0 text-neutral-600 dark:text-neutral-400">
                {getFileIcon("others")}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">
                  {other.name}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {formatFileSize(other.size)}
                </p>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* Image Lightbox Modal */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md"
            onClick={() => setSelectedImage(null)}
          >
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setSelectedImage(null)}
              className="absolute top-6 right-6 z-10 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 transition-colors backdrop-blur-sm border border-white/20"
              aria-label="Close"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </motion.button>
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              src={selectedImage}
              alt="Full size"
              className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* PDF Preview Modal */}
      <AnimatePresence>
        {selectedPdf && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
            onClick={() => setSelectedPdf(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden border border-neutral-200/50 dark:border-neutral-700/50"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-b from-neutral-50 to-white dark:from-neutral-800 dark:to-neutral-900 border-b border-neutral-200 dark:border-neutral-700">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <svg
                      className="h-4 w-4 text-red-600 dark:text-red-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
                    Document Preview
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <motion.a
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    href={selectedPdf}
                    download
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    <svg
                      className="h-4 w-4 inline-block mr-1.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    Download
                  </motion.a>
                  <motion.button
                    whileHover={{ scale: 1.05, rotate: 90 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedPdf(null)}
                    className="rounded-lg p-2 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                    aria-label="Close"
                  >
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </motion.button>
                </div>
              </div>

              {/* PDF Viewer */}
              <div className="flex-1 overflow-hidden bg-neutral-100 dark:bg-neutral-950">
                <iframe
                  src={selectedPdf}
                  className="w-full h-full border-0"
                  title="PDF Preview"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import {
  DocumentIcon,
  MusicalNoteIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";
import type { MessageAttachment } from "@/store/types";
import { useState, useEffect } from "react";
import clsx from "clsx";
import { useXyzen } from "@/store";

interface MessageAttachmentsProps {
  attachments: MessageAttachment[];
  className?: string;
}

export default function MessageAttachments({
  attachments,
  className,
}: MessageAttachmentsProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageBlobUrls, setImageBlobUrls] = useState<Record<string, string>>(
    {},
  );
  const [fileBlobUrls, setFileBlobUrls] = useState<Record<string, string>>({});
  const backendUrl = useXyzen((state) => state.backendUrl);
  const token = useXyzen((state) => state.token);

  // Helper to convert relative URLs to absolute
  const getFullUrl = (url: string | undefined): string => {
    if (!url) return "";
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    // Relative URL - prepend backend URL
    const base = backendUrl || window.location.origin;
    return `${base}${url.startsWith("/") ? url : `/${url}`}`;
  };

  // Fetch images with authentication and convert to blob URLs
  useEffect(() => {
    const imageAttachments = attachments.filter(
      (att) => att.category === "images" && att.download_url,
    );

    const fetchImages = async () => {
      const newBlobUrls: Record<string, string> = {};

      for (const image of imageAttachments) {
        if (!image.download_url) continue;
        if (imageBlobUrls[image.id]) continue; // Already fetched

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
              onClick={() => setSelectedImage(getImageUrl(image))}
            >
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
            </div>
          ))}
        </div>
      )}

      {/* Documents - List layout with cards */}
      {documents.length > 0 && (
        <div className="space-y-1">
          {documents.map((doc) => (
            <a
              key={doc.id}
              href={fileBlobUrls[doc.id] || "#"}
              download={doc.name}
              onClick={(e) => {
                if (!fileBlobUrls[doc.id]) {
                  e.preventDefault();
                  console.warn("File blob URL not ready yet");
                }
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <div className="flex-shrink-0 text-green-600 dark:text-green-400">
                {getFileIcon("documents")}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">
                  {doc.name}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {formatFileSize(doc.size)}
                </p>
              </div>
              <svg
                className="h-4 w-4 text-neutral-400 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
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
                  <p className="text-xs text-neutral-500 mt-1">Loading...</p>
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
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setSelectedImage(null)}
        >
          <button
            onClick={() => setSelectedImage(null)}
            className="absolute top-4 right-4 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
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
          </button>
          <img
            src={selectedImage}
            alt="Full size"
            className="max-h-[90vh] max-w-[90vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

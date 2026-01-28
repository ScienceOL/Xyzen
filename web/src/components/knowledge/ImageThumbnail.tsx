import { useXyzen } from "@/store";
import { PhotoIcon } from "@heroicons/react/24/solid";
import { useEffect, useRef, useState } from "react";

interface ImageThumbnailProps {
  fileId: string;
  alt: string;
  className?: string;
}

export const ImageThumbnail = ({
  fileId,
  alt,
  className = "",
}: ImageThumbnailProps) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [hasError, setHasError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const token = useXyzen((state) => state.token);
  const backendUrl = useXyzen((state) => state.backendUrl);

  // Use Intersection Observer for lazy loading
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Use viewport as root (null) for simplest and most reliable intersection detection
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.unobserve(entry.target);
          }
        });
      },
      {
        root: null, // Use viewport
        rootMargin: "100px", // Start loading 100px before entering viewport
        threshold: 0.01, // Trigger when at least 1% is visible
      },
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  // Fetch image with authentication when in view
  useEffect(() => {
    if (!isInView || !fileId || hasError || blobUrl) return;

    let active = true;
    const controller = new AbortController();

    const fetchImage = async () => {
      try {
        const base = backendUrl || window.location.origin;
        const url = `${base}${base.endsWith("/") ? "" : "/"}xyzen/api/v1/files/${fileId}/download`;
        const response = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to load image");
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);

        if (active) {
          setBlobUrl(objectUrl);
        } else {
          URL.revokeObjectURL(objectUrl);
        }
      } catch (err) {
        if (active && (err as Error).name !== "AbortError") {
          console.error("Failed to load thumbnail:", err);
          setHasError(true);
        }
      }
    };

    fetchImage();

    return () => {
      active = false;
      controller.abort();
    };
  }, [isInView, fileId, token, hasError, blobUrl, backendUrl]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden bg-neutral-100 dark:bg-neutral-800 ${className}`}
    >
      {/* Placeholder icon - always rendered but hidden when image loads */}
      <div
        className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${
          isLoaded && !hasError ? "opacity-0" : "opacity-100"
        }`}
      >
        <PhotoIcon className="h-8 w-8 text-purple-400" />
      </div>

      {/* Actual image - only render when blob URL is available */}
      {blobUrl && !hasError && (
        <img
          src={blobUrl}
          alt={alt}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
};

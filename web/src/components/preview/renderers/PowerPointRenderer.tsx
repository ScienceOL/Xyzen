import { useXyzen } from "@/store";
import React, { useCallback } from "react";
import type { RendererProps } from "../types";
import { PdfRenderer } from "./PdfRenderer";

export const PowerPointRenderer = ({ file, url, className }: RendererProps) => {
  // Always use PDF conversion for PowerPoint files
  return (
    <PdfRendererWithConversion file={file} url={url} className={className} />
  );
};

// Separate component for PDF conversion logic
const PdfRendererWithConversion = ({ file, url, className }: RendererProps) => {
  const [pdfUrl, setPdfUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const backendUrl = useXyzen((state) => state.backendUrl);
  const token = useXyzen((state) => state.token);

  const getFullUrl = useCallback(
    (path: string): string => {
      if (!path) return "";
      if (path.startsWith("http://") || path.startsWith("https://")) {
        return path;
      }
      const base = backendUrl || window.location.origin;
      return `${base}${path.startsWith("/") ? path : `/${path}`}`;
    },
    [backendUrl],
  );

  React.useEffect(() => {
    const convertAndPreview = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!file?.id) {
          throw new Error("File ID not available");
        }

        // Call the backend API to convert PPTX to PDF
        const convertPath = `/xyzen/api/v1/files/${file.id}/pptx-to-pdf`;
        const convertUrl = getFullUrl(convertPath);

        const response = await fetch(convertUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Server response:", errorText);
          throw new Error(
            `Failed to convert PowerPoint file: ${response.status} ${response.statusText}`,
          );
        }

        // Get the PDF as blob
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
        setLoading(false);
      } catch (err) {
        console.error("Failed to convert PowerPoint to PDF:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to convert PowerPoint to PDF",
        );
        setLoading(false);
      }
    };

    if (url && file?.id) {
      convertAndPreview();
    }

    return () => {
      // Clean up blob URL
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
    // Intentionally excluding pdfUrl from dependencies to avoid infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, file?.id, backendUrl, token, getFullUrl]);

  if (loading) {
    return (
      <div
        className={`h-full w-full flex items-center justify-center bg-black/40 ${className}`}
      >
        <div className="text-center text-white">
          <div className="mb-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-600 border-t-indigo-500 mx-auto"></div>
          </div>
          <p className="mb-2">PowerPoint 转换为 PDF 中...</p>
          <p className="text-sm text-neutral-400">文件较大，正在转换演示文稿</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`h-full w-full flex items-center justify-center ${className}`}
      >
        <div className="text-center text-red-400">
          <p className="mb-2">加载失败</p>
          <p className="text-sm text-neutral-400">{error}</p>
        </div>
      </div>
    );
  }

  // If conversion was successful, render as PDF
  if (pdfUrl && file) {
    return <PdfRenderer file={file} url={pdfUrl} className={className} />;
  }

  return null;
};

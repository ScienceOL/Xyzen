import { useXyzen } from "@/store";
import { useEffect, useRef } from "react";
import type { RendererProps } from "../types";

export const PdfRenderer = ({ url, className }: RendererProps) => {
  const token = useXyzen((state) => state.token);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfBlobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!url) return;
    if (!iframeRef.current) return;

    const loadPDF = async () => {
      try {
        let pdfUrl = url;

        // 如果 URL 不是 blob、http、https 或 data URL，则使用认证令牌获取
        if (
          !url.startsWith("blob:") &&
          !url.startsWith("http://") &&
          !url.startsWith("https://") &&
          !url.startsWith("data:")
        ) {
          const response = await fetch(url, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });

          if (!response.ok) {
            console.error(
              `[PdfRenderer] Failed to load PDF: ${response.status} ${response.statusText}`,
            );
            return;
          }

          // 将响应转换为 Blob
          const blob = await response.blob();

          // 创建 Object URL 并存储在 ref 中
          const blobUrl = URL.createObjectURL(blob);
          pdfBlobUrlRef.current = blobUrl;
          pdfUrl = blobUrl;
        }

        // 尝试检测 PDF 方向（通过 PDF.js）
        try {
          const pdfjsLib = await import("pdfjs-dist");
          const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
          const firstPage = await pdf.getPage(1);
          const viewport = firstPage.getViewport({ scale: 1 });

          // 如果宽度大于高度，说明是横向
          const isLandscapeOrientation = viewport.width > viewport.height;
          console.log(
            `[PdfRenderer] PDF orientation: ${isLandscapeOrientation ? "landscape" : "portrait"}`,
          );
        } catch (error) {
          // PDF.js 不可用或出错，继续加载
          console.warn(
            "[PdfRenderer] Could not detect PDF orientation:",
            error,
          );
        }

        // 设置 iframe src
        if (iframeRef.current) {
          iframeRef.current.src = pdfUrl;
        }
      } catch (error) {
        console.error("[PdfRenderer] Error loading PDF:", error);
      }
    };

    loadPDF();

    return () => {
      // Clean up blob URL using ref
      if (pdfBlobUrlRef.current) {
        URL.revokeObjectURL(pdfBlobUrlRef.current);
        pdfBlobUrlRef.current = null;
      }
    };
  }, [url, token]);

  return (
    <div
      ref={containerRef}
      className={`pdf-viewer-container h-full w-full overflow-auto ${className}`}
    >
      <iframe
        ref={iframeRef}
        className="h-full w-full border-0"
        title="PDF Preview"
        scrolling="no"
      />
    </div>
  );
};

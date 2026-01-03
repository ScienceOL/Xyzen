import { useXyzen } from "@/store";
import React, { useCallback } from "react";
import type { RendererProps } from "../types";
import { PdfRenderer } from "./PdfRenderer";

interface OfficeToPdfRendererProps extends RendererProps {
  conversionPath: string; // e.g., `/xlsx-to-pdf`, `/docx-to-pdf`, `/pptx-to-pdf`
  loadingMessage: string; // e.g., "Excel 转换为 PDF 中..."
  loadingSubtext: string; // e.g., "文件较大，正在转换电子表格"
}

/**
 * Generic Office to PDF Renderer component
 * Handles conversion logic for Word, Excel, and PowerPoint files
 */
export const OfficeToPdfRenderer = ({
  file,
  url,
  className,
  conversionPath,
  loadingMessage,
  loadingSubtext,
}: OfficeToPdfRendererProps) => {
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
          const msg = "File ID not available";
          console.error("[OfficeToPdfRenderer] Error:", msg);
          throw new Error(msg);
        }

        // Build conversion URL
        const convertApiPath = `/xyzen/api/v1/files/${file.id}${conversionPath}`;
        const convertUrl = getFullUrl(convertApiPath);

        console.log("[OfficeToPdfRenderer] 开始转换");
        console.log("[OfficeToPdfRenderer] 文件ID:", file.id);
        console.log("[OfficeToPdfRenderer] 文件名:", file.name);
        console.log("[OfficeToPdfRenderer] 转换路径:", conversionPath);
        console.log("[OfficeToPdfRenderer] 转换URL:", convertUrl);
        console.log("[OfficeToPdfRenderer] Token存在:", !!token);

        const response = await fetch(convertUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        console.log("[OfficeToPdfRenderer] 响应状态码:", response.status);
        console.log("[OfficeToPdfRenderer] 响应状态文本:", response.statusText);
        console.log(
          "[OfficeToPdfRenderer] Content-Type:",
          response.headers.get("content-type"),
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error("[OfficeToPdfRenderer] 服务器错误:", errorText);
          throw new Error(
            `转换失败: ${response.status} ${response.statusText}`,
          );
        }

        // Get the PDF as blob
        const blob = await response.blob();
        console.log("[OfficeToPdfRenderer] PDF Blob 创建成功");
        console.log("[OfficeToPdfRenderer] Blob 大小:", blob.size, "字节");
        console.log("[OfficeToPdfRenderer] Blob 类型:", blob.type);

        const objectUrl = URL.createObjectURL(blob);
        console.log("[OfficeToPdfRenderer] Object URL:", objectUrl);

        setPdfUrl(objectUrl);
        setLoading(false);
        console.log("[OfficeToPdfRenderer] 转换完成！");
      } catch (err) {
        console.error("[OfficeToPdfRenderer] 转换异常:", err);
        const errorMsg = err instanceof Error ? err.message : "转换失败";
        setError(errorMsg);
        setLoading(false);
      }
    };

    console.log(
      "[OfficeToPdfRenderer] useEffect 触发, url:",
      !!url,
      "fileId:",
      file?.id,
    );

    if (url && file?.id) {
      console.log("[OfficeToPdfRenderer] 开始执行转换");
      convertAndPreview();
    }

    return () => {
      // Clean up blob URL
      if (pdfUrl) {
        console.log("[OfficeToPdfRenderer] 清理 Object URL");
        URL.revokeObjectURL(pdfUrl);
      }
    };
    // Intentionally excluding pdfUrl from dependencies to avoid infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, file?.id, backendUrl, token, getFullUrl, conversionPath]);

  if (loading) {
    return (
      <div
        className={`h-full w-full flex items-center justify-center bg-black/40 ${className}`}
      >
        <div className="text-center text-white">
          <div className="mb-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-600 border-t-indigo-500 mx-auto"></div>
          </div>
          <p className="mb-2">{loadingMessage}</p>
          <p className="text-sm text-neutral-400">{loadingSubtext}</p>
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

import type { RendererProps } from "../types";
import { OfficeToPdfRenderer } from "./OfficeToPdfRenderer";

export const PowerPointRenderer = ({ file, url, className }: RendererProps) => {
  return (
    <OfficeToPdfRenderer
      file={file}
      url={url}
      className={className}
      conversionPath="/pptx-to-pdf"
      loadingMessage="PowerPoint 转换为 PDF 中..."
      loadingSubtext="文件较大，正在转换演示文稿"
    />
  );
};

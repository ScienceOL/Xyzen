import type { RendererProps } from "../types";
import { OfficeToPdfRenderer } from "./OfficeToPdfRenderer";

export const WordRenderer = ({ file, url, className }: RendererProps) => {
  return (
    <OfficeToPdfRenderer
      file={file}
      url={url}
      className={className}
      conversionPath="/docx-to-pdf"
      loadingMessage="Word 转换为 PDF 中..."
      loadingSubtext="文件较大，正在转换文档"
    />
  );
};

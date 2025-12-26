import type { RendererProps } from "../types";
import { OfficeToPdfRenderer } from "./OfficeToPdfRenderer";

export const ExcelRenderer = ({ file, url, className }: RendererProps) => {
  return (
    <OfficeToPdfRenderer
      file={file}
      url={url}
      className={className}
      conversionPath="/xlsx-to-pdf"
      loadingMessage="Excel 转换为 PDF 中..."
      loadingSubtext="文件较大，正在转换电子表格"
    />
  );
};

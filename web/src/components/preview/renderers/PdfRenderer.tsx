import type { RendererProps } from "../types";

export const PdfRenderer = ({ url, className }: RendererProps) => {
  return (
    <div className={`h-full w-full ${className}`}>
      <iframe
        src={url}
        className="h-full w-full border-0"
        title="PDF Preview"
      />
    </div>
  );
};

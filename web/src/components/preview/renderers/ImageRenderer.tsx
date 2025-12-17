import type { RendererProps } from "../types";

export const ImageRenderer = ({ file, url, className }: RendererProps) => {
  return (
    <div
      className={`flex h-full w-full items-center justify-center ${className}`}
    >
      <img
        src={url}
        alt={file.name}
        className="max-h-full max-w-full object-contain"
      />
    </div>
  );
};

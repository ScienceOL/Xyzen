import type { RendererProps } from "../types";

export const VideoRenderer = ({ url, className }: RendererProps) => {
  return (
    <div
      className={`flex h-full w-full items-center justify-center ${className}`}
    >
      <video src={url} controls className="max-h-full max-w-full" />
    </div>
  );
};

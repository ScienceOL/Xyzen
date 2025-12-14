import type { RendererProps } from "../types";

export const AudioRenderer = ({ url, className }: RendererProps) => {
  return (
    <div
      className={`flex h-full w-full items-center justify-center ${className}`}
    >
      <audio src={url} controls className="w-full max-w-md" />
    </div>
  );
};

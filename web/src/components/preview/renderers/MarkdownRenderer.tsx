import { useEffect, useState } from "react";
import Markdown from "@/lib/Markdown";
import type { RendererProps } from "../types";

export const MarkdownRenderer = ({ url, className }: RendererProps) => {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const fetchContent = async () => {
      // Reset state on new fetch
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(
            `Failed to load markdown: ${response.status} ${response.statusText}`,
          );
        }
        const text = await response.text();
        if (!controller.signal.aborted) {
          setContent(text);
          setLoading(false);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error("Failed to load markdown content:", err);
          setError("Failed to load content");
          setLoading(false);
        }
      }
    };

    if (url) {
      fetchContent();
    }

    return () => {
      controller.abort();
    };
  }, [url]);

  if (loading) {
    return <div className="text-neutral-400 p-6">Loading markdown...</div>;
  }

  if (error) {
    return <div className="text-red-400 p-6">{error}</div>;
  }

  return (
    <div
      className={`h-full w-full overflow-auto bg-white dark:bg-neutral-800 p-6 rounded-md ${className}`}
    >
      <Markdown content={content} />
    </div>
  );
};

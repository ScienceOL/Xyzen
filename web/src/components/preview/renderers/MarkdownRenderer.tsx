import { useEffect, useState } from "react";
import Markdown from "@/lib/Markdown";
import type { RendererProps } from "../types";

export const MarkdownRenderer = ({ url, className }: RendererProps) => {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const response = await fetch(url);
        const text = await response.text();
        setContent(text);
        setLoading(false);
      } catch (err) {
        console.error("Failed to load markdown content:", err);
        setError("Failed to load content");
        setLoading(false);
      }
    };

    if (url) {
      fetchContent();
    }
  }, [url]);

  if (loading) {
    return <div className="text-neutral-400">Loading markdown...</div>;
  }

  if (error) {
    return <div className="text-red-400">{error}</div>;
  }

  return (
    <div
      className={`h-full w-full overflow-auto bg-white dark:bg-neutral-800 p-6 rounded-md ${className}`}
    >
      <Markdown content={content} />
    </div>
  );
};

import { CopyButton } from "@/components/animate-ui/components/buttons/copy";
import useTheme from "@/hooks/useTheme";
import clsx from "clsx";
import React, { useState } from "react";
import { createHighlighter, type Highlighter } from "shiki";

// Singleton to avoid re-initializing shiki multiple times
let highlighterPromise: Promise<Highlighter> | null = null;

interface JsonDisplayProps {
  data: unknown;
  className?: string;
  compact?: boolean; // for smaller displays in tool cards
  variant?: "default" | "success" | "error"; // color theme variants
  hideHeader?: boolean; // option to hide the json header
  enableCharts?: boolean; // enable automatic chart detection and rendering
  /** Max height for the code area. Defaults to "max-h-80". Use "none" to disable. */
  maxHeight?: string;
}

/**
 * Variant-specific accent colours used in the header bar badge.
 */
const VARIANT_BADGE: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  success: {
    bg: "bg-green-100 dark:bg-green-900/40",
    text: "text-green-700 dark:text-green-300",
    border: "border-green-200 dark:border-green-700/60",
  },
  error: {
    bg: "bg-red-100 dark:bg-red-900/40",
    text: "text-red-700 dark:text-red-300",
    border: "border-red-200 dark:border-red-700",
  },
  default: {
    bg: "",
    text: "text-zinc-500 dark:text-zinc-400",
    border: "",
  },
};

export const JsonDisplay: React.FC<JsonDisplayProps> = ({
  data,
  className,
  compact = false,
  variant = "default",
  hideHeader = false,
  maxHeight = "max-h-80",
}) => {
  const [highlightedHtml, setHighlightedHtml] = useState<string>("");
  const { theme } = useTheme();
  const isDark = React.useMemo(() => {
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    return theme === "dark" || (theme === "system" && prefersDark);
  }, [theme]);

  // Format data to JSON string
  const jsonString = React.useMemo(() => {
    if (typeof data === "string") return data;
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data]);

  React.useEffect(() => {
    let mounted = true;

    const initHighlighter = async () => {
      if (!highlighterPromise) {
        highlighterPromise = createHighlighter({
          themes: ["github-dark", "github-light"],
          langs: ["json"],
        });
      }

      const currentPromise = highlighterPromise;
      if (!currentPromise) return;

      try {
        const highlighter = await currentPromise;
        if (!mounted) return;

        const html = highlighter.codeToHtml(jsonString, {
          lang: "json",
          theme: isDark ? "github-dark" : "github-light",
        });

        if (mounted) setHighlightedHtml(html);
      } catch (e) {
        console.error("Shiki highlight error:", e);
        if (mounted && currentPromise) {
          const highlighter = await currentPromise;
          const html = highlighter.codeToHtml(jsonString, {
            lang: "text",
            theme: isDark ? "github-dark" : "github-light",
          });
          if (mounted) setHighlightedHtml(html);
        }
      }
    };

    initHighlighter();

    return () => {
      mounted = false;
    };
  }, [jsonString, isDark]);

  const badge = VARIANT_BADGE[variant] ?? VARIANT_BADGE.default;

  const hasScrollConstraint = maxHeight !== "none";

  return (
    <div
      className={clsx(
        "group relative w-full min-w-0 overflow-hidden rounded-sm border shadow not-prose",
        hasScrollConstraint && "flex flex-col",
        "border-neutral-200 bg-neutral-50 dark:border-white/10 dark:bg-[#0d1117]",
        className,
      )}
    >
      {/* Header bar — mirrors Markdown CodeBlock */}
      {!hideHeader && (
        <div
          className={clsx(
            "flex items-center justify-between border-b px-4",
            compact ? "h-8" : "h-10",
            "border-neutral-200 bg-white/50 dark:border-white/10 dark:bg-white/5",
          )}
        >
          <span
            className={clsx(
              "font-mono text-xs",
              badge.text,
              variant !== "default" &&
                `px-1.5 py-0.5 rounded ${badge.bg} ${badge.border} border`,
            )}
          >
            json
          </span>

          <CopyButton
            content={jsonString}
            variant="ghost"
            size="xs"
            className={clsx(
              "text-zinc-500 dark:text-zinc-300",
              "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity",
            )}
          />
        </div>
      )}

      {/* Code content */}
      <div
        className={clsx(
          "relative min-h-0",
          hasScrollConstraint &&
            `${maxHeight} overflow-y-auto custom-scrollbar`,
          compact ? "p-2" : "p-5",
        )}
      >
        {/* Floating copy button when header is hidden */}
        {hideHeader && (
          <CopyButton
            content={jsonString}
            variant="ghost"
            size="xs"
            className={clsx(
              "absolute right-2 top-2 text-zinc-500 dark:text-zinc-300",
              "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity",
            )}
          />
        )}

        <div className={clsx(isDark && "dark")}>
          {!highlightedHtml ? (
            <pre
              className={clsx(
                "font-mono text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap break-all",
                compact ? "text-xs" : "text-sm",
              )}
            >
              {jsonString}
            </pre>
          ) : (
            <div
              className={clsx(
                "shiki-container",
                "[&_pre]:!bg-transparent [&_pre]:!p-0 [&_pre]:!m-0 [&_pre]:!overflow-visible [&_pre]:!whitespace-pre-wrap [&_pre]:!break-all",
                "[&_code]:!bg-transparent [&_code]:!font-mono",
                compact ? "[&_code]:!text-xs" : "[&_code]:!text-sm",
              )}
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default JsonDisplay;

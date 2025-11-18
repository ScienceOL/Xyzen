import { CheckIcon, ClipboardIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import React, { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ChartDisplay } from "../charts/ChartDisplay";
import useTheme from "@/hooks/useTheme";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface JsonDisplayProps {
  data: unknown;
  className?: string;
  compact?: boolean; // for smaller displays in tool cards
  variant?: "default" | "success" | "error"; // color theme variants
  hideHeader?: boolean; // option to hide the json header
  enableCharts?: boolean; // enable automatic chart detection and rendering
}

export const JsonDisplay: React.FC<JsonDisplayProps> = ({
  data,
  className,
  compact = false,
  variant = "default",
  hideHeader = false,
  enableCharts = false,
}) => {
  const [copied, setCopied] = useState(false);
  const { theme } = useTheme();
  const isDark = React.useMemo(() => {
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    return theme === "dark" || (theme === "system" && prefersDark);
  }, [theme]);

  // Format data to JSON string
  const jsonString = React.useMemo(() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(jsonString).then(() => {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    });
  };

  // Get variant-based colors
  const getVariantColors = () => {
    switch (variant) {
      case "success":
        return {
          container: compact
            ? "rounded-sm bg-white dark:bg-green-900/10 border border-green-300 dark:border-green-700/60"
            : "w-full min-w-0 overflow-hidden rounded-xl border border-green-300 dark:border-green-700/60 bg-white dark:bg-green-900/10 shadow flex flex-col not-prose",
          header: compact
            ? "flex items-center justify-between px-2 py-1 bg-green-50 dark:bg-green-800/30 border-b border-green-300 dark:border-green-600/60 rounded-t-md"
            : "flex h-10 items-center justify-between px-4 border-b border-green-300 dark:border-green-600/60 bg-green-50 dark:bg-green-800/30",
          text: compact
            ? "text-xs font-mono text-green-800 dark:text-green-300"
            : "text-xs font-mono text-green-800 dark:text-green-300",
        };
      case "error":
        return {
          container: compact
            ? "rounded-sm bg-white dark:bg-red-900/20 border border-red-300 dark:border-red-700"
            : "w-full min-w-0 overflow-hidden rounded-xl border border-red-300 dark:border-red-700 bg-white dark:bg-red-900/20 shadow flex flex-col not-prose",
          header: compact
            ? "flex items-center justify-between px-2 py-1 bg-red-50 dark:bg-red-800/50 border-b border-red-300 dark:border-red-600 rounded-t-md"
            : "flex h-10 items-center justify-between px-4 border-b border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-800/50",
          text: compact
            ? "text-xs font-mono text-red-800 dark:text-red-300"
            : "text-xs font-mono text-red-800 dark:text-red-300",
        };
      default:
        return {
          container: compact
            ? "rounded-sm bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
            : "w-full min-w-0 overflow-hidden rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#1a1a1b] shadow flex flex-col not-prose",
          header: compact
            ? "flex items-center justify-between px-2 py-1 bg-neutral-50 dark:bg-neutral-700/50 border-b border-neutral-200 dark:border-neutral-600 rounded-t-md"
            : "flex h-10 items-center justify-between px-4 border-b border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/5",
          text: compact
            ? "text-xs font-mono text-neutral-600 dark:text-neutral-400"
            : "text-xs font-mono text-neutral-600 dark:text-zinc-400",
        };
    }
  };

  // If charts are enabled, use ChartDisplay which handles both charts and JSON fallback
  if (enableCharts) {
    return (
      <div className={className}>
        <ChartDisplay
          data={data}
          compact={compact}
          variant={variant}
          fallbackToJson={true}
        />
      </div>
    );
  }

  // Standard JSON display
  const variantColors = getVariantColors();
  const containerClasses = clsx("group relative my-5", variantColors.container);
  const contentClasses = compact
    ? "relative p-2"
    : "relative flex-1 min-h-0 p-5";
  const headerClasses = variantColors.header;

  return (
    <div className={clsx(containerClasses, className)}>
      {/* Header - conditionally rendered */}
      {!hideHeader && (
        <div className={headerClasses}>
          <span className={variantColors.text}>json</span>
        </div>
      )}

      {/* Content */}
      <div className={contentClasses}>
        <button
          onClick={copyToClipboard}
          className={clsx(
            compact
              ? "absolute right-1 top-1 h-6 w-6"
              : "absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md border transition opacity-0 text-zinc-600 border-zinc-200 bg-white hover:bg-zinc-50 active:scale-95 dark:text-zinc-300 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/15 backdrop-blur-sm group-hover:opacity-100 focus-visible:opacity-100",
            copied &&
              !compact &&
              "text-white bg-emerald-600 border-emerald-600",
          )}
          aria-label={copied ? "Copied" : "Copy JSON"}
          title={copied ? "Copied" : "Copy JSON"}
        >
          {copied ? (
            <CheckIcon className={compact ? "h-4 w-4" : "h-4 w-4"} />
          ) : (
            <ClipboardIcon className={compact ? "h-4 w-4" : "h-4 w-4"} />
          )}
        </button>

        <div
          className={clsx(
            "h-full w-full min-w-0 overflow-x-auto custom-scrollbar",
            isDark && "dark",
          )}
        >
          <SyntaxHighlighter
            style={isDark ? oneDark : oneLight}
            language="json"
            PreTag="div"
            customStyle={{
              background: "transparent",
              margin: 0,
              padding: 0,
              fontSize: compact ? "0.75rem" : "0.875rem",
              overflowX: "auto",
              width: "100%",
              maxWidth: "100%",
            }}
            showLineNumbers={!compact}
            wrapLines={true}
            lineNumberContainerStyle={
              compact
                ? {}
                : {
                    float: "left",
                    paddingRight: "1em",
                    textAlign: "right",
                    userSelect: "none",
                  }
            }
            lineNumberStyle={
              compact
                ? {}
                : {
                    minWidth: "2.5em",
                    paddingRight: "1em",
                    textAlign: "right",
                    display: "inline-block",
                    fontFamily: "sans-serif",
                    fontSize: "0.75rem",
                    fontVariantNumeric: "tabular-nums",
                    color: isDark ? "#a1a1aa" : "#52525b", // zinc-400 for dark, zinc-600 for light
                  }
            }
            lineProps={
              compact
                ? undefined
                : (lineNumber) => ({
                    className: lineNumber === 1 ? "pl-1" : "",
                  })
            }
          >
            {jsonString}
          </SyntaxHighlighter>
        </div>
      </div>
    </div>
  );
};

export default JsonDisplay;

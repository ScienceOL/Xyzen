"use client";

import { useEffect, useId, useRef, useState } from "react";

interface MermaidRendererProps {
  code: string;
  className?: string;
}

export function MermaidRenderer({ code, className }: MermaidRendererProps) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const baseId = useId().replace(/:/g, "_");
  const scopeId = `mermaid-${baseId}`;

  useEffect(() => {
    let isMounted = true;

    const renderDiagram = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Dynamic import of mermaid
        const mermaid = (await import("mermaid")).default;

        // Initialize with theme-aware config
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          securityLevel: "loose",
          fontFamily: "inherit",
        });

        // Render the diagram
        const { svg: renderedSvg } = await mermaid.render(scopeId, code.trim());

        if (isMounted) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : "Failed to render diagram",
          );
          setSvg("");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    renderDiagram();

    return () => {
      isMounted = false;
    };
  }, [code, scopeId]);

  if (isLoading) {
    return (
      <div
        className={`flex items-center justify-center p-8 ${className || ""}`}
      >
        <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Rendering diagram...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950 ${className || ""}`}
      >
        <div className="flex items-start gap-2">
          <svg
            className="h-5 w-5 text-red-500 shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <div className="text-sm font-medium text-red-800 dark:text-red-200">
              Mermaid Syntax Error
            </div>
            <div className="mt-1 text-xs text-red-600 dark:text-red-400 font-mono">
              {error}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Apply custom styles for dark mode SVG colors

  return (
    <div
      ref={containerRef}
      // 1. 添加 not-prose 尝试阻断
      // 2. 显式声明文字颜色 text-neutral-200
      className={`mermaid-container not-prose relative overflow-auto rounded-lg p-4 ${className || ""}`}
    >
      <style>{`
              #${scopeId} {
                background-color: white !important;
              }
              #${scopeId} text,
              #${scopeId} span,
              #${scopeId} p,
              #${scopeId} div {
                color: #171717 !important; /* Neutral-900 */
                fill: #171717 !important;
              }
              /* 修复可能出现的不可见线条 */
              #${scopeId} .edgePath .path {
                stroke: #525252 !important; /* Neutral-600 */
              }
              #${scopeId} .marker {
                fill: #525252 !important;
                stroke: #525252 !important;
              }
            `}</style>
      <div
        id={scopeId}
        dangerouslySetInnerHTML={{ __html: svg }}
        className="w-full h-full flex justify-center"
      />
    </div>
  );
}

export default MermaidRenderer;

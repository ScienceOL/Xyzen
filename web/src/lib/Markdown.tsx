import { CheckIcon, ClipboardIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { useXyzen } from "@/store";
import { LAYOUT_STYLE } from "@/store/slices/uiSlice/types";
import "katex/dist/katex.css";

interface CodeBlockProps {
  language: string;
  code: string;
  isDark: boolean;
  isStreaming?: boolean;
}

const CodeBlock = React.memo(
  ({ language, code, isDark, isStreaming }: CodeBlockProps) => {
    const [mode, setMode] = useState<"code" | "preview">("code");
    const [copiedCode, setCopiedCode] = useState<string | null>(null);

    // Inject polyfills to prevent crashes in sandboxed environment
    const previewCode = React.useMemo(() => {
      const polyfill = `
<script>
  try {
    const mockStorage = {
      _data: {},
      getItem: function(key) { return this._data[key] || null; },
      setItem: function(key, value) { this._data[key] = String(value); },
      removeItem: function(key) { delete this._data[key]; },
      clear: function() { this._data = {}; },
      key: function(i) { return Object.keys(this._data)[i] || null; },
      get length() { return Object.keys(this._data).length; }
    };

    try { Object.defineProperty(window, 'localStorage', { value: mockStorage }); } catch(e) {}
    try { Object.defineProperty(window, 'sessionStorage', { value: mockStorage }); } catch(e) {}
  } catch (err) {
    console.warn('Failed to polyfill storage:', err);
  }
</script>
`;
      return polyfill + code;
    }, [code]);

    const copyToClipboard = () => {
      navigator.clipboard.writeText(code).then(() => {
        setCopiedCode(code);
        setTimeout(() => {
          setCopiedCode(null);
        }, 2000);
      });
    };

    const isHtml = language === "html" || language === "xml";

    return (
      <div
        className={clsx(
          "group relative my-5 w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#1a1a1b] shadow",
          "flex flex-col",
          "not-prose",
        )}
      >
        <div className="flex h-10 items-center justify-between border-b border-white/10 bg-white/5 px-4">
          <div className="flex items-center gap-2">
            {language ? (
              <span className="font-mono text-xs text-zinc-400">
                {language}
              </span>
            ) : (
              <span className="font-mono text-xs text-zinc-400">code</span>
            )}

            {isHtml && (
              <div className="ml-2 flex items-center rounded-lg bg-white/10 p-0.5">
                <button
                  onClick={() => setMode("code")}
                  className={clsx(
                    "flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-all",
                    mode === "code"
                      ? "bg-white/20 text-white shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200",
                  )}
                >
                  Code
                </button>
                <button
                  onClick={() => setMode("preview")}
                  className={clsx(
                    "flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-all",
                    mode === "preview"
                      ? "bg-white/20 text-white shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200",
                  )}
                >
                  Preview
                </button>
              </div>
            )}
          </div>

          <button
            onClick={copyToClipboard}
            className={clsx(
              "inline-flex h-8 w-8 items-center justify-center rounded-md border text-zinc-300 transition",
              "opacity-0 border-white/10 bg-white/5 backdrop-blur-sm",
              "group-hover:opacity-100 focus-visible:opacity-100",
              "hover:bg-white/15 hover:border-white/20 active:scale-95",
              copiedCode === code &&
                "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
            )}
            aria-label={copiedCode === code ? "Copied" : "Copy"}
            title={copiedCode === code ? "Copied" : "Copy"}
          >
            {copiedCode === code ? (
              <CheckIcon className="h-4 w-4" />
            ) : (
              <ClipboardIcon className="h-4 w-4" />
            )}
          </button>
        </div>
        <div className="relative flex-1 min-h-0">
          {mode === "preview" && isHtml ? (
            <div className="w-full bg-white">
              <iframe
                srcDoc={previewCode}
                className="w-full border-0 bg-white"
                style={{ height: "400px" }}
                sandbox="allow-scripts allow-forms allow-modals"
                allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; midi; clipboard-read; clipboard-write"
                title="HTML Preview"
              />
            </div>
          ) : (
            <div className="p-5">
              <div
                className={clsx(
                  `h-full min-w-0 overflow-x-auto custom-scrollbar`,
                  isDark && "dark",
                )}
              >
                {isStreaming ? (
                  <pre className="font-mono text-sm text-zinc-300 whitespace-pre-wrap break-all">
                    {code}
                  </pre>
                ) : (
                  <SyntaxHighlighter
                    style={vscDarkPlus}
                    language={language}
                    PreTag="div"
                    customStyle={{
                      background: "transparent",
                      margin: 0,
                      padding: 0,
                      fontSize: "0.875rem",
                      width: "100%",
                      maxWidth: "100%",
                      boxSizing: "border-box",
                    }}
                    showLineNumbers
                    wrapLines={true}
                    lineNumberContainerStyle={{
                      float: "left",
                      paddingRight: "1em",
                      textAlign: "right",
                      userSelect: "none",
                    }}
                    lineNumberStyle={{
                      minWidth: "2.5em",
                      paddingRight: "1em",
                      textAlign: "right",
                      display: "inline-block",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      fontSize: "0.75rem",
                      fontVariantNumeric: "tabular-nums",
                      color: isDark ? "#a1a1aa" : "#52525b",
                    }}
                    lineProps={(lineNumber) => ({
                      className: lineNumber === 1 ? "pl-1" : "",
                    })}
                  >
                    {code}
                  </SyntaxHighlighter>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  },
);

interface MarkdownProps {
  content: string;
  className?: string; // optional extra classes for the markdown root
  isStreaming?: boolean;
}

const Markdown: React.FC<MarkdownProps> = function Markdown(props) {
  const panelWidth = useXyzen((state) => state.panelWidth);
  const layoutStyle = useXyzen((state) => state.layoutStyle);
  const { content = "", className, isStreaming } = props;

  // Detect theme for line number colors
  const [isDark, setIsDark] = React.useState(false);

  React.useEffect(() => {
    const checkTheme = () => {
      if (typeof document !== "undefined") {
        const htmlEl = document.documentElement;
        const hasDarkClass = htmlEl.classList.contains("dark");
        const prefersDark =
          window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
        setIsDark(hasDarkClass || prefersDark);
      }
    };

    checkTheme();

    // Watch for theme changes
    const observer = new MutationObserver(checkTheme);
    if (typeof document !== "undefined") {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    return () => observer.disconnect();
  }, []);

  const MarkdownComponents = React.useMemo(
    () => ({
      code({
        inline,
        className,
        children,
        ...props
      }: React.ComponentPropsWithoutRef<"code"> & { inline?: boolean }) {
        const match = /language-(\w+)/.exec(className || "");
        const code = String(children).replace(/\n$/, "");
        const lang = match?.[1] ?? "";

        return !inline && match ? (
          <CodeBlock
            language={lang}
            code={code}
            isDark={isDark}
            isStreaming={isStreaming}
          />
        ) : (
          <div className={clsx("overflow-x-auto", className)} {...props}>
            {children}
          </div>
        );
      },
    }),
    [isDark, isStreaming],
  );
  return (
    <article
      className={clsx("prose", "markdown", "w-full", "max-w-full", className)}
      style={{
        width: layoutStyle === LAYOUT_STYLE.Sidebar ? panelWidth - 164 : "100%",
      }}
    >
      <ReactMarkdown
        components={MarkdownComponents}
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex]}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
};

export default Markdown;

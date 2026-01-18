import { zIndexClasses } from "@/constants/zIndex";
import { Dialog, DialogPanel } from "@headlessui/react";
import {
  ArrowsPointingOutIcon,
  CheckIcon,
  ClipboardIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import clsx from "clsx";
import ReactECharts from "echarts-for-react";
import { AnimatePresence, motion } from "framer-motion";
import React, { Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { createHighlighter, type Highlighter } from "shiki";

import { useXyzen } from "@/store";

// Lazy load MermaidRenderer to avoid SSR issues with mermaid library
const MermaidRenderer = React.lazy(() =>
  import("@/components/preview/renderers/MermaidRenderer").then((m) => ({
    default: m.MermaidRenderer,
  })),
);

import "katex/dist/katex.css";

type MdastNode = {
  type: string;
  value?: string;
  children?: MdastNode[];
};

function remarkStrongQuotedText() {
  const pattern = /\*\*([“"「『])([\s\S]+?)(["”」』])\*\*/g;

  const transform = (node: MdastNode) => {
    if (!node || !Array.isArray(node.children)) return;

    const nextChildren: MdastNode[] = [];

    for (const child of node.children) {
      if (child?.type === "text" && typeof child.value === "string") {
        const text = child.value;
        let lastIndex = 0;
        pattern.lastIndex = 0;

        for (
          let match = pattern.exec(text);
          match;
          match = pattern.exec(text)
        ) {
          const start = match.index;
          const end = start + match[0].length;

          const before = text.slice(lastIndex, start);
          if (before) nextChildren.push({ type: "text", value: before });

          const quoted = `${match[1]}${match[2]}${match[3]}`;
          nextChildren.push({
            type: "strong",
            children: [{ type: "text", value: quoted }],
          });

          lastIndex = end;
        }

        const after = text.slice(lastIndex);
        if (after) nextChildren.push({ type: "text", value: after });
        continue;
      }

      transform(child);
      nextChildren.push(child);
    }

    node.children = nextChildren;
  };

  return (tree: MdastNode) => {
    transform(tree);
  };
}

interface CodeBlockProps {
  language: string;
  code: string;
  isDark: boolean;
}

// Singleton to avoid re-initializing shiki multiple times
let highlighterPromise: Promise<Highlighter> | null = null;

const CodeBlock = React.memo(({ language, code, isDark }: CodeBlockProps) => {
  const [mode, setMode] = useState<"code" | "preview">("code");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [highlightedHtml, setHighlightedHtml] = useState<string>("");
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);

  React.useEffect(() => {
    let mounted = true;

    const initHighlighter = async () => {
      if (!highlighterPromise) {
        highlighterPromise = createHighlighter({
          themes: ["one-dark-pro", "github-light"],
          langs: [
            "javascript",
            "typescript",
            "tsx",
            "jsx",
            "css",
            "html",
            "json",
            "markdown",
            "python",
            "bash",
            "shell",
            "sql",
            "yaml",
            "dockerfile",
            "go",
            "rust",
            "java",
            "c",
            "cpp",
          ],
        });
      }

      const currentPromise = highlighterPromise;
      if (!currentPromise) return;

      try {
        const highlighter = await currentPromise;
        if (!mounted) return;

        const lang =
          language === "echart" || language === "echarts"
            ? "json"
            : language === "mermaid"
              ? "markdown" // Use markdown highlighting for mermaid code view
              : language || "text";

        const html = highlighter.codeToHtml(code, {
          lang,
          theme: isDark ? "one-dark-pro" : "github-light",
        });

        if (mounted) setHighlightedHtml(html);
      } catch (e) {
        console.error("Shiki highlight error:", e);
        // Fallback to text if language fails
        if (mounted) {
          const highlighter = await currentPromise;
          const html = highlighter.codeToHtml(code, {
            lang: "text",
            theme: isDark ? "one-dark-pro" : "github-light",
          });
          if (mounted) setHighlightedHtml(html);
        }
      }
    };

    initHighlighter();

    return () => {
      mounted = false;
    };
  }, [code, language, isDark]);

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
  const isEChart = language === "echart" || language === "echarts";
  const isMermaid = language === "mermaid";
  const canPreview = isHtml || isEChart || isMermaid;

  const PreviewContent = ({ fullscreen = false }: { fullscreen?: boolean }) => (
    <>
      {isMermaid ? (
        <div
          className="w-full p-4 overflow-auto not-prose"
          style={{
            height: fullscreen ? "calc(100vh - 120px)" : "auto",
            minHeight: "200px",
          }}
        >
          <Suspense
            fallback={
              <div className="p-4 text-zinc-500">Loading diagram...</div>
            }
          >
            <MermaidRenderer code={code} />
          </Suspense>
        </div>
      ) : isEChart ? (
        <div
          className="w-full bg-white p-4"
          style={{ height: fullscreen ? "calc(100vh - 120px)" : "400px" }}
        >
          <ReactECharts
            option={(() => {
              try {
                return new Function("return " + code)();
              } catch (e) {
                console.warn("ECharts option parse error:", e);
                return {};
              }
            })()}
            theme={isDark ? "dark" : undefined}
            style={{ height: "100%", width: "100%" }}
          />
        </div>
      ) : (
        <div className="w-full bg-white">
          <iframe
            srcDoc={previewCode}
            className="w-full border-0 bg-white"
            style={{ height: fullscreen ? "calc(100vh - 120px)" : "400px" }}
            sandbox="allow-scripts allow-forms allow-modals"
            allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; midi; clipboard-read; clipboard-write"
            title="HTML Preview"
          />
        </div>
      )}
    </>
  );

  return (
    <>
      <div
        className={clsx(
          "group relative my-5 w-full min-w-0 overflow-hidden rounded-xl border shadow",
          "border-neutral-200 bg-neutral-50 dark:border-white/10 dark:bg-[#1a1a1b]",
          "flex flex-col",
          "not-prose",
        )}
      >
        <div className="flex h-10 items-center justify-between border-b px-4 border-neutral-200 bg-white/50 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center gap-2">
            {language ? (
              <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                {language}
              </span>
            ) : (
              <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                code
              </span>
            )}

            {canPreview && (
              <div className="ml-2 flex items-center rounded-lg bg-black/5 p-0.5 dark:bg-white/10">
                <button
                  onClick={() => setMode("code")}
                  className={clsx(
                    "flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-all",
                    mode === "code"
                      ? "bg-white text-black shadow-sm dark:bg-white/20 dark:text-white"
                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200",
                  )}
                >
                  Code
                </button>
                <button
                  onClick={() => setMode("preview")}
                  className={clsx(
                    "flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-all",
                    mode === "preview"
                      ? "bg-white text-black shadow-sm dark:bg-white/20 dark:text-white"
                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200",
                  )}
                >
                  Preview
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {canPreview && mode === "preview" && (
              <button
                onClick={() => setIsFullscreenOpen(true)}
                className={clsx(
                  "inline-flex h-8 w-8 items-center justify-center rounded-md border transition",
                  "text-zinc-500 dark:text-zinc-300",
                  "opacity-0 backdrop-blur-sm",
                  "border-black/5 bg-black/5 dark:border-white/10 dark:bg-white/5",
                  "group-hover:opacity-100 focus-visible:opacity-100",
                  "hover:bg-black/10 hover:border-black/10 dark:hover:bg-white/15 dark:hover:border-white/20 active:scale-95",
                )}
                aria-label="Fullscreen"
                title="Fullscreen"
              >
                <ArrowsPointingOutIcon className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={copyToClipboard}
              className={clsx(
                "inline-flex h-8 w-8 items-center justify-center rounded-md border transition",
                "text-zinc-500 dark:text-zinc-300",
                "opacity-0 backdrop-blur-sm",
                "border-black/5 bg-black/5 dark:border-white/10 dark:bg-white/5",
                "group-hover:opacity-100 focus-visible:opacity-100",
                "hover:bg-black/10 hover:border-black/10 dark:hover:bg-white/15 dark:hover:border-white/20 active:scale-95",
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
        </div>
        <div className="relative flex-1 min-h-0">
          {mode === "preview" && canPreview ? (
            <PreviewContent />
          ) : (
            <div className="p-5 w-full">
              <div className={clsx(`h-full w-full min-w-0`, isDark && "dark")}>
                {!highlightedHtml ? (
                  <pre className="font-mono text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap break-all">
                    {code}
                  </pre>
                ) : (
                  <div
                    className="shiki-container [&_pre]:!bg-transparent [&_pre]:!p-0 [&_pre]:!m-0 [&_pre]:!overflow-visible [&_pre]:!whitespace-pre-wrap [&_pre]:!break-all [&_code]:!bg-transparent [&_code]:!font-mono [&_code]:!text-sm [&_code>span:first-child]:!pl-[2px]"
                    dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Modal */}
      <AnimatePresence>
        {isFullscreenOpen && (
          <Dialog
            static
            open={isFullscreenOpen}
            onClose={() => setIsFullscreenOpen(false)}
            className={`relative ${zIndexClasses.modal}`}
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm"
              aria-hidden="true"
            />

            {/* Full screen container */}
            <div className="fixed inset-0 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="w-full max-w-7xl h-[90vh]"
              >
                <DialogPanel className="flex flex-col h-full overflow-hidden rounded-sm bg-white shadow-2xl dark:bg-neutral-950">
                  {/* Header */}
                  <div className="flex h-14 items-center justify-between border-b px-4 border-neutral-200 bg-white/50 dark:border-white/10 dark:bg-white/5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-zinc-500 dark:text-zinc-400">
                        {language} Preview
                      </span>
                    </div>
                    <button
                      onClick={() => setIsFullscreenOpen(false)}
                      className="rounded-sm p-1 text-neutral-500 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-800"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>

                  {/* Preview Content */}
                  <div className="flex-1 overflow-hidden">
                    <PreviewContent fullscreen />
                  </div>
                </DialogPanel>
              </motion.div>
            </div>
          </Dialog>
        )}
      </AnimatePresence>
    </>
  );
});

interface MarkdownProps {
  content: string;
  className?: string; // optional extra classes for the markdown root
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isXyzenDownloadUrl = (src: string) =>
  src.includes("/xyzen/api/v1/files/") && src.includes("/download");

const MarkdownImage: React.FC<React.ImgHTMLAttributes<HTMLImageElement>> = (
  props,
) => {
  const { src, alt, ...rest } = props;
  const backendUrl = useXyzen((state) => state.backendUrl);
  const token = useXyzen((state) => state.token);
  const [blobUrl, setBlobUrl] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = React.useState(false);

  const fullSrc = React.useMemo(() => {
    if (!src) return "";
    if (src.startsWith("data:") || src.startsWith("blob:")) return src;
    if (src.startsWith("http://") || src.startsWith("https://")) return src;
    const base =
      backendUrl ||
      (typeof window !== "undefined" ? window.location.origin : "");
    return `${base}${src.startsWith("/") ? src : `/${src}`}`;
  }, [src, backendUrl]);

  // Only intercept our authenticated download endpoint.
  const shouldAuthFetch =
    !!fullSrc &&
    !!token &&
    (fullSrc.startsWith("/") || fullSrc.startsWith(backendUrl || "")) &&
    isXyzenDownloadUrl(fullSrc);

  React.useEffect(() => {
    if (!shouldAuthFetch) {
      setFailed(false);
      setBlobUrl(null);
      return;
    }

    let active = true;
    const controller = new AbortController();

    const run = async () => {
      setFailed(false);

      // Retry briefly to cover the "created but not yet committed" window.
      const delays = [250, 750, 1500];

      for (let attempt = 0; attempt < delays.length + 1; attempt++) {
        try {
          const res = await fetch(fullSrc, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          });

          if (res.ok) {
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            if (!active) {
              URL.revokeObjectURL(url);
              return;
            }
            setBlobUrl(url);
            return;
          }

          // Retry only on transient statuses.
          if (![404, 500, 502, 503].includes(res.status)) {
            break;
          }
        } catch (e) {
          if ((e as Error)?.name === "AbortError") return;
        }

        if (attempt < delays.length) {
          await sleep(delays[attempt]);
        }
      }

      if (active) setFailed(true);
    };

    run();

    return () => {
      active = false;
      controller.abort();
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [shouldAuthFetch, fullSrc, token]);

  if (!src) return null;

  const imageSrc = shouldAuthFetch ? blobUrl : fullSrc;

  // Loading state - shimmer animation (same as MessageAttachments)
  const isLoading = shouldAuthFetch && !blobUrl && !failed;

  // Render image container with loading state and lightbox
  return (
    <>
      <span
        className="inline-block not-prose cursor-pointer"
        onClick={() => !isLoading && imageSrc && setIsLightboxOpen(true)}
      >
        {isLoading ? (
          // Shimmer loading animation
          <span
            className="block relative overflow-hidden rounded-lg bg-neutral-200 dark:bg-neutral-800"
            style={{ width: "200px", height: "150px" }}
          >
            <motion.span
              className="absolute inset-0 bg-linear-to-r from-transparent via-white/50 dark:via-white/10 to-transparent"
              animate={{
                x: ["-100%", "200%"],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "linear",
              }}
              style={{
                backgroundSize: "200% 100%",
              }}
            />
          </span>
        ) : failed ? (
          // Failed state
          <span
            className="flex items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 text-xs"
            style={{ width: "200px", height: "150px" }}
          >
            Image failed to load
          </span>
        ) : imageSrc ? (
          // Loaded image with hover effect - container adapts to image size
          <span className="relative group/img inline-block rounded-lg">
            <img
              src={imageSrc}
              alt={alt}
              {...rest}
              className="block w-[95%] sm:max-w-80 max-h-80 h-auto rounded-lg transition-all duration-200 group-hover/img:scale-[1.02] group-hover/img:shadow-lg"
            />
            {/* Hover overlay */}
            <span className="absolute inset-0 rounded-lg bg-black/0 group-hover/img:bg-black/10 transition-colors pointer-events-none" />
          </span>
        ) : null}
      </span>

      {/* Lightbox Modal - using portal like MessageAttachments */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isLightboxOpen && imageSrc && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md"
                role="dialog"
                aria-modal="true"
                onClick={() => setIsLightboxOpen(false)}
              >
                <ImageLightboxEscapeCatcher
                  onEscape={() => setIsLightboxOpen(false)}
                />
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setIsLightboxOpen(false)}
                  className="absolute top-6 right-6 z-10 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 transition-colors backdrop-blur-sm border border-white/20"
                  aria-label="Close"
                >
                  <XMarkIcon className="h-6 w-6" />
                </motion.button>
                <motion.img
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  src={imageSrc}
                  alt={alt || "Full size"}
                  className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                />
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
};

// Helper component to catch Escape key for image lightbox
function ImageLightboxEscapeCatcher({ onEscape }: { onEscape: () => void }) {
  useEffect(() => {
    const onKeyDownCapture = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e as any).stopImmediatePropagation?.();
      onEscape();
    };

    window.addEventListener("keydown", onKeyDownCapture, true);
    return () => window.removeEventListener("keydown", onKeyDownCapture, true);
  }, [onEscape]);

  return null;
}

const Markdown: React.FC<MarkdownProps> = function Markdown(props) {
  const { content = "", className } = props;

  // Detect theme for line number colors
  const [isDark, setIsDark] = React.useState(false);

  useEffect(() => {
    const checkTheme = () => {
      if (typeof document !== "undefined") {
        const htmlEl = document.documentElement;
        const hasDarkClass = htmlEl.classList.contains("dark");
        setIsDark(hasDarkClass);
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
      pre({ children, ...props }: React.ComponentPropsWithoutRef<"pre">) {
        const childArray = React.Children.toArray(children);
        const firstChild = childArray[0] as React.ReactElement;

        if (childArray.length === 1 && React.isValidElement(firstChild)) {
          const childProps =
            firstChild.props as React.ComponentPropsWithoutRef<"code">;
          const className = childProps.className || "";
          const match = /language-(\w+)/.exec(className);
          const lang = match?.[1] || "text";
          const code = String(childProps.children).replace(/\n$/, "");

          return <CodeBlock language={lang} code={code} isDark={isDark} />;
        }

        return (
          <pre {...props} className={clsx("overflow-x-auto", props.className)}>
            {children}
          </pre>
        );
      },
      table({ children, ...props }: React.ComponentPropsWithoutRef<"table">) {
        return (
          <div className="markdown-table-wrapper">
            <table {...props}>{children}</table>
          </div>
        );
      },
      td({ children, ...props }: React.ComponentPropsWithoutRef<"td">) {
        return (
          <td {...props}>
            {React.Children.map(children, (child) => {
              if (typeof child === "string") {
                return child.split(/<br\s*\/?>/gi).map((text, i, arr) => (
                  <React.Fragment key={i}>
                    {text}
                    {i < arr.length - 1 && <br />}
                  </React.Fragment>
                ));
              }
              return child;
            })}
          </td>
        );
      },
      th({ children, ...props }: React.ComponentPropsWithoutRef<"th">) {
        return (
          <th {...props}>
            {React.Children.map(children, (child) => {
              if (typeof child === "string") {
                return child.split(/<br\s*\/?>/gi).map((text, i, arr) => (
                  <React.Fragment key={i}>
                    {text}
                    {i < arr.length - 1 && <br />}
                  </React.Fragment>
                ));
              }
              return child;
            })}
          </th>
        );
      },
      code({
        className,
        children,
        ...props
      }: React.ComponentPropsWithoutRef<"code">) {
        return (
          <code className={className} {...props}>
            {children}
          </code>
        );
      },
      img(props: React.ComponentPropsWithoutRef<"img">) {
        return <MarkdownImage {...props} />;
      },
    }),
    [isDark],
  );
  return (
    <article
      className={clsx("prose", "markdown", "w-full", "max-w-full", className)}
    >
      <ReactMarkdown
        components={MarkdownComponents}
        remarkPlugins={[remarkMath, remarkGfm, remarkStrongQuotedText]}
        rehypePlugins={[rehypeKatex]}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
};

export default Markdown;

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import "katex/dist/katex.css";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface MarkdownProps {
  content: string;
}

const Markdown: React.FC<MarkdownProps> = function Markdown(props) {
  const { content = "" } = props;
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => {
        setCopiedCode(null);
      }, 2000);
    });
  };

  const MarkdownComponents = {
    code({
      inline,
      className,
      children,
      ...props
    }: React.ComponentPropsWithoutRef<"code"> & { inline?: boolean }) {
      const match = /language-(\w+)/.exec(className || "");
      const code = String(children).replace(/\n$/, "");

      return !inline && match ? (
        <div style={{ position: "relative" }}>
          <button
            onClick={() => copyToClipboard(code)}
            style={{
              position: "absolute",
              top: "5px",
              right: "5px",
              padding: "4px 8px",
              backgroundColor: "#282c34",
              color: "white",
              border: "1px solid #444",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "12px",
              zIndex: 2,
              opacity: 0.8,
              transition: "opacity 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "1";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "0.8";
            }}
          >
            {copiedCode === code ? (
              <span className=" text-green-400">Copied!</span>
            ) : (
              "Copy"
            )}
          </button>
          <SyntaxHighlighter style={oneDark} language={match[1]} PreTag="div">
            {code}
          </SyntaxHighlighter>
        </div>
      ) : (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
  };
  return (
    <ReactMarkdown
      components={MarkdownComponents}
      remarkPlugins={[remarkMath, remarkGfm]}
      rehypePlugins={[rehypeKatex, rehypeRaw]}
    >
      {content}
    </ReactMarkdown>
  );
};

export default Markdown;

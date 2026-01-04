import { AnimatePresence, motion } from "framer-motion";
import { Brain, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Markdown from "@/lib/Markdown";

interface ThinkingBubbleProps {
  content: string;
  isThinking: boolean;
}

/**
 * ThinkingBubble displays AI thinking/reasoning content.
 *
 * Two states:
 * 1. Active thinking (isThinking=true): Animated scrolling view showing last 5 lines
 * 2. Collapsed (isThinking=false): Expandable accordion to view full thinking content
 */
export default function ThinkingBubble({
  content,
  isThinking,
}: ThinkingBubbleProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Split content into lines for display
  const lines = useMemo(() => {
    return content.split("\n").filter((line) => line.trim());
  }, [content]);

  // Get last 5 lines for active thinking display
  const visibleLines = useMemo(() => {
    return lines.slice(-5);
  }, [lines]);

  // Auto-scroll to bottom during active thinking
  useEffect(() => {
    if (isThinking && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [content, isThinking]);

  // Don't render if no content
  if (!content) {
    return null;
  }

  return (
    <div className="mb-3">
      <AnimatePresence mode="wait">
        {isThinking ? (
          // Active thinking state - animated scrolling view
          <motion.div
            key="thinking-active"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="relative overflow-hidden rounded-lg border border-purple-300/50 bg-gradient-to-br from-purple-50/80 via-indigo-50/60 to-violet-50/80 dark:border-purple-500/30 dark:from-purple-950/40 dark:via-indigo-950/30 dark:to-violet-950/40"
          >
            {/* Subtle shimmer effect */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
              animate={{
                x: ["-100%", "100%"],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "linear",
              }}
            />

            {/* Header with animated icon */}
            <div className="flex items-center gap-2 border-b border-purple-200/50 px-3 py-2 dark:border-purple-700/30">
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="flex items-center justify-center"
              >
                <Brain className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </motion.div>
              <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
                {t("app.chat.thinking.label")}
              </span>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              >
                <Sparkles className="h-3 w-3 text-purple-500/60 dark:text-purple-400/60" />
              </motion.div>
            </div>

            {/* Scrolling content - max 5 lines visible */}
            <div
              ref={scrollRef}
              className="max-h-32 overflow-y-auto px-3 py-2"
              style={{
                scrollBehavior: "smooth",
              }}
            >
              {visibleLines.map((line, index) => (
                <motion.div
                  key={`${index}-${line.slice(0, 20)}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                  className="py-0.5 font-mono text-xs leading-relaxed text-purple-900/80 dark:text-purple-100/80"
                >
                  {line}
                </motion.div>
              ))}
              {/* Blinking cursor */}
              <motion.span
                animate={{ opacity: [0.2, 1, 0.2] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="inline-block h-3 w-1 bg-purple-500 dark:bg-purple-400"
              />
            </div>

            {/* Fade overlay at top when more content */}
            {lines.length > 5 && (
              <div className="pointer-events-none absolute left-0 top-8 h-4 w-full bg-gradient-to-b from-purple-50/80 to-transparent dark:from-purple-950/40" />
            )}
          </motion.div>
        ) : (
          // Collapsed state - expandable accordion
          <motion.div
            key="thinking-collapsed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden rounded-lg border border-neutral-200/80 bg-neutral-50/50 dark:border-neutral-700/50 dark:bg-neutral-800/30"
          >
            {/* Collapsible header */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-neutral-100/50 dark:hover:bg-neutral-700/30"
            >
              <Brain className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
              <span className="flex-1 text-xs font-medium text-neutral-600 dark:text-neutral-300">
                {isExpanded
                  ? t("app.chat.thinking.hideThinking")
                  : t("app.chat.thinking.showThinking")}
              </span>
              <motion.div
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-neutral-400" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-neutral-400" />
                )}
              </motion.div>
            </button>

            {/* Expanded content */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <div className="max-h-64 overflow-y-auto border-t border-neutral-200/50 px-3 py-2 dark:border-neutral-700/30">
                    <div className="prose prose-neutral dark:prose-invert prose-sm max-w-none text-xs">
                      <Markdown content={content} />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

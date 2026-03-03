import { useXyzen } from "@/store";
import type { Message } from "@/store/types";
import { AnimatePresence, motion } from "framer-motion";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// Mirror SectionIndicator animation language
const EASE = [0.25, 1, 0.5, 1] as const;
const TRANSITION_FAST = { duration: 0.25, ease: EASE };
const TRANSITION_DEFAULT = { duration: 0.3, ease: EASE };

// Strip markdown to plain text for preview (lightweight, no dependency)
function stripMarkdown(text: string): string {
  return (
    text
      // Remove images ![alt](url)
      .replace(/!\[.*?\]\(.*?\)/g, "")
      // Remove links [text](url) → text
      .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")
      // Remove bold/italic markers
      .replace(/[*_]{1,3}(.+?)[*_]{1,3}/g, "$1")
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, "")
      // Remove inline code
      .replace(/`([^`]+)`/g, "$1")
      // Remove headers
      .replace(/^#{1,6}\s+/gm, "")
      // Collapse whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}

interface ChatMessageNavProps {
  messages: Message[];
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

const ChatMessageNav = React.memo(function ChatMessageNav({
  messages,
  scrollContainerRef,
}: ChatMessageNavProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const dotRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const highlightMessage = useXyzen((s) => s.highlightMessage);

  // Filter to user messages only
  const userMessages = useMemo(
    () => messages.filter((m) => m.role === "user"),
    [messages],
  );

  // Stable list of IDs for observer dependency
  const userMessageIds = useMemo(
    () => userMessages.map((m) => m.dbId || m.id),
    [userMessages],
  );

  // IntersectionObserver: track which user message is in the middle of the viewport
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || userMessageIds.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = (entry.target as HTMLElement).dataset.messageId;
            if (id) setActiveId(id);
          }
        }
      },
      {
        root: container,
        rootMargin: "-30% 0px -30% 0px",
        threshold: 0,
      },
    );

    // Observe user message elements
    for (const id of userMessageIds) {
      const el = container.querySelector(`[data-message-id="${id}"]`);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [userMessageIds, scrollContainerRef]);

  const handleClick = useCallback(
    (msgId: string) => {
      highlightMessage(msgId);
    },
    [highlightMessage],
  );

  // Hidden when < 2 user messages
  if (userMessages.length < 2) return null;

  return (
    <div className="isolate absolute right-2 top-1/2 z-20 hidden -translate-y-1/2 lg:flex">
      <div className="flex flex-col items-center gap-2.5 py-2">
        {userMessages.map((msg) => {
          const msgId = msg.dbId || msg.id;
          const isActive = activeId === msgId;
          const isHovered = hoveredId === msgId;

          return (
            <div key={msgId} className="relative flex items-center">
              {/* Hover preview — positioned left of dot */}
              <AnimatePresence>
                {isHovered && (
                  <motion.div
                    initial={{ opacity: 0, x: 4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 4 }}
                    transition={TRANSITION_FAST}
                    className="absolute right-6 w-56 rounded-lg border border-black/5 bg-white/70 px-3 py-2 text-xs text-neutral-700 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-white/5 dark:text-neutral-300 dark:shadow-black/20"
                  >
                    <span className="line-clamp-3 leading-relaxed">
                      {stripMarkdown(msg.content).slice(0, 120) || "..."}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Dot */}
              <motion.button
                ref={(el) => {
                  if (el) dotRefs.current.set(msgId, el);
                  else dotRefs.current.delete(msgId);
                }}
                onClick={() => handleClick(msgId)}
                onMouseEnter={() => setHoveredId(msgId)}
                onMouseLeave={() => setHoveredId(null)}
                className="flex items-center justify-center"
                style={{ width: 16, height: 16 }}
                aria-label={`Jump to message`}
              >
                <motion.div
                  className="rounded-full bg-neutral-500 dark:bg-neutral-400"
                  animate={{
                    width: isActive ? 8 : isHovered ? 6 : 5,
                    height: isActive ? 8 : isHovered ? 6 : 5,
                    opacity: isActive ? 1 : isHovered ? 0.7 : 0.45,
                  }}
                  transition={TRANSITION_DEFAULT}
                />
              </motion.button>
            </div>
          );
        })}
      </div>
    </div>
  );
}, areMessagesEqual);

// Custom comparator — only re-render when user message list changes
function areMessagesEqual(
  prev: ChatMessageNavProps,
  next: ChatMessageNavProps,
) {
  return prev.messages === next.messages;
}

export default ChatMessageNav;

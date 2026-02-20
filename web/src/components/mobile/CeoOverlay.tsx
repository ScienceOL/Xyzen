import AgentSlotCarousel from "@/components/mobile/AgentSlotCarousel";
import { FloatingChatInput } from "@/components/layouts/components/FloatingChatInput";
import { useXyzen } from "@/store";
import type { Agent } from "@/types/agents";
import { AnimatePresence, motion } from "framer-motion";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

interface CeoOverlayProps {
  /** Fully visible (after threshold or initial load). */
  visible: boolean;
  /** Ref to the overlay container — written to directly by the pull
   *  gesture hook in the parent (no React re-renders during drag). */
  overlayRef: React.RefObject<HTMLDivElement | null>;
  onDismiss: () => void;
  onNavigateToChat: () => void;
}

const noop = () => {};

/**
 * Parse a greeting string with **bold** markers into React nodes.
 */
function parseGreeting(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <span key={i} className="font-bold text-amber-400">
          {part.slice(2, -2)}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

const CeoOverlay: React.FC<CeoOverlayProps> = ({
  visible,
  overlayRef,
  onDismiss,
  onNavigateToChat,
}) => {
  const { t } = useTranslation();
  const { agents, rootAgent, activateChannelForAgent, sendMessage } = useXyzen(
    useShallow((s) => ({
      agents: s.agents,
      rootAgent: s.rootAgent,
      activateChannelForAgent: s.activateChannelForAgent,
      sendMessage: s.sendMessage,
    })),
  );

  // Typewriter effect
  const greeting = t("app.loft.greeting");
  const [displayedChars, setDisplayedChars] = useState(0);
  const hasTyped = useRef(false);

  useEffect(() => {
    if (!visible) return;
    if (hasTyped.current) {
      setDisplayedChars(greeting.length);
      return;
    }
    setDisplayedChars(0);
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplayedChars(i);
      if (i >= greeting.length) {
        clearInterval(timer);
        hasTyped.current = true;
      }
    }, 40);
    return () => clearInterval(timer);
  }, [visible, greeting]);

  const displayedText = greeting.slice(0, displayedChars);
  const greetingNodes = useMemo(
    () => parseGreeting(displayedText),
    [displayedText],
  );

  // Animate the overlay via direct DOM when `visible` changes.
  // During pull gestures the parent writes clipPath directly to the same
  // ref — that path sets `transition: none` so there's no conflict.
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    if (visible) {
      el.style.pointerEvents = "auto";
      // Animate open — use rAF so the browser paints the current state first
      requestAnimationFrame(() => {
        el.style.transition = "clip-path 0.4s cubic-bezier(0.32, 0.72, 0, 1)";
        el.style.clipPath = "inset(0% 0% 0% 0%)";
      });
    } else {
      el.style.transition = "clip-path 0.3s ease-out";
      el.style.clipPath = "inset(0% 0% 100% 0%)";
      // Disable pointer events after transition completes
      const onDone = () => {
        el.removeEventListener("transitionend", onDone);
        el.style.pointerEvents = "none";
      };
      el.addEventListener("transitionend", onDone);
      // Safety fallback
      setTimeout(onDone, 400);
    }
  }, [visible, overlayRef]);

  const handleSendToCeo = useCallback(
    (text: string) => {
      if (!rootAgent) return false;
      activateChannelForAgent(rootAgent.id).then(() => {
        sendMessage(text);
        onNavigateToChat();
      });
    },
    [rootAgent, activateChannelForAgent, sendMessage, onNavigateToChat],
  );

  const handleAgentClick = useCallback(
    async (agent: Agent) => {
      await activateChannelForAgent(agent.id);
      onNavigateToChat();
    },
    [activateChannelForAgent, onNavigateToChat],
  );

  return (
    <div
      ref={overlayRef as React.RefObject<HTMLDivElement>}
      className="absolute inset-0 z-40 bg-gradient-to-b from-black/80 via-black/40 to-black/10 backdrop-blur-xl will-change-[clip-path]"
      style={{
        clipPath: visible ? "inset(0% 0% 0% 0%)" : "inset(0% 0% 100% 0%)",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      {/* Content */}
      <AnimatePresence>
        {visible && (
          <motion.div
            key="ceo-content"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, delay: 0.15 }}
            className="relative flex h-full flex-col items-center justify-center px-6"
            onClick={onDismiss}
          >
            <div
              className="flex w-full flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              {/* CEO Avatar */}
              <div className="relative mb-5">
                <div className="h-20 w-20 overflow-hidden rounded-full border-2 border-white/30 shadow-lg shadow-black/20">
                  <img
                    src={
                      rootAgent?.avatar ||
                      "https://api.dicebear.com/7.x/avataaars/svg?seed=ceo"
                    }
                    alt={rootAgent?.name || "CEO"}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 shadow-sm ring-2 ring-black/30">
                  <span className="text-xs">👑</span>
                </div>
              </div>

              {/* Typewriter greeting */}
              <p className="mb-8 max-w-[280px] text-center text-[15px] leading-relaxed text-white/80">
                {greetingNodes}
                {displayedChars < greeting.length && (
                  <span className="ml-0.5 inline-block w-[2px] animate-pulse bg-amber-500">
                    &nbsp;
                  </span>
                )}
              </p>

              {/* Input */}
              <div className="mb-6 w-full max-w-sm">
                <FloatingChatInput
                  onSendMessage={handleSendToCeo}
                  disabled={!rootAgent}
                  placeholder={t("app.loft.inputPlaceholder")}
                  onShowHistory={noop}
                  showHistory={false}
                  handleCloseHistory={noop}
                  handleSelectTopic={noop}
                />
              </div>

              {/* Agent horizontal scroll strip */}
              {agents.length > 0 && (
                <div className="w-full max-w-sm">
                  <AgentSlotCarousel
                    agents={agents}
                    onAgentClick={handleAgentClick}
                  />
                </div>
              )}

              {/* Dismiss hint */}
              <div className="mt-4 pb-4">
                <span className="text-[11px] text-white/40">
                  {t("app.loft.dismissHint", {
                    defaultValue: "Tap outside to see all agents",
                  })}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default React.memo(CeoOverlay);

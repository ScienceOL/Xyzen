import AgentSlotCarousel from "@/components/mobile/AgentSlotCarousel";
import { FloatingChatInput } from "@/components/layouts/components/FloatingChatInput";
import { useXyzen } from "@/store";
import type { Agent } from "@/types/agents";
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
  const { agents, rootAgentId, activateChannelForAgent, sendMessage } =
    useXyzen(
      useShallow((s) => ({
        agents: s.agents,
        rootAgentId: s.rootAgentId,
        activateChannelForAgent: s.activateChannelForAgent,
        sendMessage: s.sendMessage,
      })),
    );

  // Non-root agents for the carousel (root agent is shown as the overlay avatar)
  const subordinateAgents = useMemo(
    () => agents.filter((a) => a.id !== rootAgentId),
    [agents, rootAgentId],
  );

  // Derive root agent object for name/avatar/etc.
  const rootAgent = useMemo(
    () => agents.find((a) => a.id === rootAgentId) ?? null,
    [agents, rootAgentId],
  );

  // Typewriter effect
  const greeting = t("app.loft.greeting", { name: rootAgent?.name || "Xyzen" });
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

  // Animate the overlay via translateY when `visible` changes.
  // During pull gestures the parent writes transform directly —
  // that path sets `transition: none` so there's no conflict.
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    if (visible) {
      el.style.pointerEvents = "auto";
      // Animate open — use rAF so the browser paints the current state first
      requestAnimationFrame(() => {
        el.style.transition = "transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)";
        el.style.transform = "translateY(0)";
      });
    } else {
      el.style.transition = "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)";
      el.style.transform = "translateY(-100%)";
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

  // Swipe-up on the bottom handle to dismiss
  const handleStartY = useRef(0);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    handleStartY.current = e.touches[0].clientY;
  }, []);
  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const el = overlayRef.current;
      if (!el) return;
      const dy = e.touches[0].clientY - handleStartY.current;
      if (dy < 0) {
        el.style.transition = "none";
        el.style.transform = `translateY(${dy}px)`;
      }
    },
    [overlayRef],
  );
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const el = overlayRef.current;
      if (!el) return;
      const dy = e.changedTouches[0].clientY - handleStartY.current;
      if (dy < -60) {
        el.style.transition = "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)";
        onDismiss();
      } else {
        el.style.transition = "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)";
        el.style.transform = "translateY(0)";
      }
    },
    [overlayRef, onDismiss],
  );

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
      className="absolute inset-0 z-40 bg-gradient-to-b from-black/80 via-black/40 to-black/10 backdrop-blur-xl will-change-transform"
      style={{
        transform: visible ? "translateY(0)" : "translateY(-100%)",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      {/* Pull handle — swipe up to dismiss */}
      <div
        className="absolute bottom-0 left-0 right-0 z-10 flex justify-center pb-2 pt-4"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="h-1 w-10 rounded-full bg-white/30" />
      </div>

      {/* Content — always rendered, clipped by translateY */}
      <div
        className="relative flex h-full flex-col items-center justify-center px-0"
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
                  "https://api.dicebear.com/7.x/avataaars/svg?seed=default"
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
          {subordinateAgents.length > 0 && (
            <div className="w-full max-w-sm">
              <AgentSlotCarousel
                agents={subordinateAgents}
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
      </div>
    </div>
  );
};

export default React.memo(CeoOverlay);

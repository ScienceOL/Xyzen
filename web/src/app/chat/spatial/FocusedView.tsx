import XyzenChat from "@/components/layouts/XyzenChat";
import { useXyzen } from "@/store";
import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { AgentData } from "./types";

interface FocusedViewProps {
  agent: AgentData;
  agents: (AgentData & { id: string })[];
  onClose: () => void;
  onSwitchAgent: (id: string) => void;
  onCanvasClick?: () => void; // Callback specifically for canvas clicks
}

export function FocusedView({
  agent,
  agents,
  onClose,
  onSwitchAgent,
  onCanvasClick,
}: FocusedViewProps) {
  const switcherRef = useRef<HTMLDivElement | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);

  const { activateChannelForAgent } = useXyzen();

  // Activate the channel for the selected agent
  useEffect(() => {
    if (agent.agentId) {
      activateChannelForAgent(agent.agentId).catch((error) => {
        console.error("Failed to activate channel for agent:", error);
      });
    }
  }, [agent.agentId, activateChannelForAgent]);

  useEffect(() => {
    // Check if user is typing in an editable element
    const isEditableTarget = (el: Element | null): boolean => {
      if (!el) return false;
      const tag = (el as HTMLElement).tagName;
      const editable = (el as HTMLElement).isContentEditable;
      return (
        editable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (el as HTMLElement).closest?.('[role="textbox"]') !== null ||
        (el as HTMLElement).closest?.(".tiptap") !== null ||
        (el as HTMLElement).closest?.(".ProseMirror") !== null
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Don't close if user is typing in an input field
      if (e.key === "Escape" && !isEditableTarget(document.activeElement)) {
        onClose();
      }
    };

    const onPointerDownCapture = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Clicking on a node should switch focus to that node, not close.
      if (target.closest(".react-flow__node, .xy-flow__node")) return;

      // Clicking inside UI panels should not close.
      if (chatRef.current?.contains(target)) return;
      if (switcherRef.current?.contains(target)) return;

      // Clicking inside Radix portals (Sheet, Dialog, etc.) should not close.
      // These are rendered outside our ref tree via Portal.
      if (
        target.closest(
          "[data-radix-portal], [data-slot='sheet-overlay'], [data-slot='sheet-content']",
        )
      )
        return;

      // Clicking on modals or dialogs should not close
      if (target.closest("[role='dialog'], [role='alertdialog'], .modal"))
        return;

      // Only close if clicking on the ReactFlow canvas/pane background
      const isCanvasClick = target.closest(
        ".react-flow__pane, .react-flow__renderer",
      );
      if (!isCanvasClick) return;

      // This is a canvas click - close the focused view
      e.preventDefault();
      e.stopPropagation();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e as any).stopImmediatePropagation?.();

      if (onCanvasClick) {
        onCanvasClick();
      } else {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDownCapture, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDownCapture, true);
    };
  }, [onClose, onCanvasClick]);

  return (
    <div className="absolute inset-0 z-40 flex items-stretch p-4 gap-4 pointer-events-none">
      {/* 1. Left Column: Top (Empty for Node visibility) + Bottom (Switcher) */}
      <div className="w-80 flex flex-col justify-end relative z-10 pointer-events-none">
        {/* Agent Switcher List */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="bg-white/55 dark:bg-black/55 backdrop-blur-2xl border border-white/40 dark:border-white/10 shadow-2xl rounded-3xl overflow-hidden pointer-events-auto max-h-[50vh] flex flex-col"
          ref={switcherRef}
        >
          <div className="p-4 border-b border-white/20 dark:border-white/5 bg-white/20 dark:bg-white/5">
            <h3 className="text-xs font-bold uppercase text-neutral-500 tracking-wider">
              Active Agents
            </h3>
          </div>
          <div className="overflow-y-auto p-2 space-y-1">
            {agents.map((a) => (
              <button
                key={a.id}
                onClick={() => onSwitchAgent(a.id)}
                className={`w-full flex items-center gap-3 p-2 rounded-xl transition-all duration-200 ${
                  a.name === agent.name
                    ? "bg-white/80 dark:bg-white/20 shadow-sm"
                    : "hover:bg-white/40 dark:hover:bg-white/10"
                }`}
              >
                <div className="relative">
                  <img
                    src={a.avatar}
                    alt={a.name}
                    className="w-10 h-10 rounded-full border border-white/50 object-cover"
                  />
                  {a.status === "busy" && (
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500"></span>
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <div className="truncate text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                    {a.name}
                  </div>
                  <div className="truncate text-[10px] text-neutral-500">
                    {a.role}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      </div>

      {/* 2. Main Chat Area - Frosted Glass Panel */}
      <motion.div
        initial={{ x: 50, opacity: 0, scale: 0.95 }}
        animate={{ x: 0, opacity: 1, scale: 1 }}
        exit={{ x: 50, opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
        className="spatial-chat-frosted relative z-10 flex flex-1 flex-col overflow-hidden rounded-[28px] border border-white/40 bg-white/60 shadow-2xl backdrop-blur-2xl pointer-events-auto dark:border-white/10 dark:bg-neutral-900/70"
        ref={chatRef}
      >
        {/* XyzenChat Component - No modifications, just wrapped */}
        <XyzenChat />
      </motion.div>
    </div>
  );
}

import { useActiveChannelStatus } from "@/hooks/useChannelSelectors";
import { useXyzen } from "@/store";
import { ChevronLeftIcon } from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { KnowledgeTab } from "./KnowledgeTab";
import { SandboxTab } from "./SandboxTab";
import { ToolsTab } from "./ToolsTab";

const TABS = ["knowledge", "tools", "sandbox"] as const;
const COLLAPSED_WIDTH = 10;
const EXPANDED_WIDTH = 384;

export interface CapsuleProps {
  variant?: "default" | "spatial" | "mobile";
  onBack?: () => void;
}

const transition = { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const };

// ---------------------------------------------------------------------------
// Shared inner pieces
// ---------------------------------------------------------------------------

function CapsuleTabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: string;
  onTabChange: (tab: (typeof TABS)[number]) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center border-b border-neutral-100 dark:border-neutral-800 shrink-0">
      <div className="flex-1 flex">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`px-4 py-2.5 text-xs font-medium transition-colors relative ${
              activeTab === tab
                ? "text-neutral-900 dark:text-white"
                : "text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300"
            }`}
          >
            {t(`capsule.tabs.${tab}`)}
            {activeTab === tab && (
              <motion.div
                layoutId="capsule-tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-neutral-900 dark:bg-white"
                transition={transition}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function CapsuleBody({ activeTab }: { activeTab: string }) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {activeTab === "knowledge" && <KnowledgeTab />}
      {activeTab === "tools" && <ToolsTab />}
      {activeTab === "sandbox" && <SandboxTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function Capsule({ variant = "default", onBack }: CapsuleProps) {
  const { t } = useTranslation();
  const { knowledge_set_id, sessionId } = useActiveChannelStatus();
  const prevKnowledgeSetId = useRef<string | null>(null);

  const { capsuleOpen, capsuleActiveTab, setCapsuleOpen, setCapsuleActiveTab } =
    useXyzen(
      useShallow((s) => ({
        capsuleOpen: s.capsuleOpen,
        capsuleActiveTab: s.capsuleActiveTab,
        setCapsuleOpen: s.setCapsuleOpen,
        setCapsuleActiveTab: s.setCapsuleActiveTab,
      })),
    );

  // Peek state — hover-driven, independent from docked state
  const [peeking, setPeeking] = useState(false);
  const peekTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Auto-open/close when knowledge_set_id changes
  useEffect(() => {
    const prev = prevKnowledgeSetId.current;
    prevKnowledgeSetId.current = knowledge_set_id;

    if (!prev && knowledge_set_id) {
      setCapsuleOpen(true);
      setCapsuleActiveTab("knowledge");
    } else if (prev && !knowledge_set_id) {
      setCapsuleOpen(false);
    }
  }, [knowledge_set_id, setCapsuleOpen, setCapsuleActiveTab]);

  // Cleanup peek timeout on unmount
  useEffect(() => () => clearTimeout(peekTimeout.current), []);

  const handlePeekEnter = useCallback(() => {
    if (capsuleOpen) return; // no peek when already docked
    clearTimeout(peekTimeout.current);
    setPeeking(true);
  }, [capsuleOpen]);

  const handlePeekLeave = useCallback(() => {
    peekTimeout.current = setTimeout(() => setPeeking(false), 200);
  }, []);

  const handleClick = useCallback(() => {
    if (capsuleOpen) {
      // Docked → collapse; also clear peek so it doesn't linger
      setCapsuleOpen(false);
      setPeeking(false);
    } else {
      // Collapsed (may or may not be peeking) → dock it open
      setCapsuleOpen(true);
      setPeeking(false);
    }
  }, [capsuleOpen, setCapsuleOpen]);

  // Determine if the capsule has any content worth showing.
  // Currently only Knowledge tab has real data; Tools and Memory are "coming soon".
  const hasContent = !!knowledge_set_id || !!sessionId;

  // -------------------------------------------------------------------------
  // Mobile variant — full screen with back header
  // -------------------------------------------------------------------------
  if (variant === "mobile") {
    return (
      <div className="h-full flex flex-col bg-white dark:bg-neutral-950">
        {/* Mobile header */}
        <div className="flex items-center gap-1 px-1 py-1.5 border-b border-neutral-100 dark:border-neutral-800 shrink-0">
          <button
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 transition-colors"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold text-neutral-800 dark:text-white">
            {t("capsule.capsule")}
          </span>
        </div>

        <CapsuleTabBar
          activeTab={capsuleActiveTab}
          onTabChange={setCapsuleActiveTab}
        />
        <CapsuleBody activeTab={capsuleActiveTab} />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Desktop / Spatial — if no content, render nothing
  // -------------------------------------------------------------------------
  if (!hasContent) return null;

  const isSpatial = variant === "spatial";

  const panelBg = isSpatial
    ? "bg-white/60 dark:bg-neutral-900/60 backdrop-blur-2xl border border-black/5 dark:border-white/10 shadow-xl rounded-xl"
    : "bg-white dark:bg-neutral-950 border-l border-neutral-200 dark:border-neutral-800";

  const peekBg = isSpatial
    ? "bg-white/70 dark:bg-neutral-900/70 backdrop-blur-2xl border border-black/5 dark:border-white/10 rounded-xl"
    : "bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800";

  // -------------------------------------------------------------------------
  // Layout width only changes on dock; peek is a floating overlay
  // -------------------------------------------------------------------------
  return (
    <motion.div
      initial={false}
      animate={{ width: capsuleOpen ? EXPANDED_WIDTH : COLLAPSED_WIDTH }}
      transition={transition}
      className={`shrink-0 h-full relative ${isSpatial ? "pointer-events-auto" : ""}`}
      onMouseEnter={handlePeekEnter}
      onMouseLeave={handlePeekLeave}
    >
      {/* ---- Docked panel (always mounted, fades in/out) ---- */}
      <motion.div
        initial={false}
        animate={{ opacity: capsuleOpen ? 1 : 0 }}
        transition={{ duration: 0.15 }}
        className={`absolute inset-0 flex flex-col ${panelBg} ${
          capsuleOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
        style={{ width: EXPANDED_WIDTH }}
      >
        <CapsuleTabBar
          activeTab={capsuleActiveTab}
          onTabChange={setCapsuleActiveTab}
        />
        <CapsuleBody activeTab={capsuleActiveTab} />

        {/* Right-edge click strip to collapse */}
        <div
          onClick={handleClick}
          className={`absolute top-0 bottom-0 right-0 w-3 z-10 cursor-pointer transition-colors duration-200 ${
            isSpatial
              ? "hover:bg-neutral-400/20 dark:hover:bg-neutral-500/20"
              : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
          }`}
          title={t("capsule.collapse")}
        />
      </motion.div>

      {/* ---- Collapsed indicator (fixed width, never stretches) ---- */}
      <motion.div
        initial={false}
        animate={{ opacity: capsuleOpen ? 0 : 1 }}
        transition={{ duration: 0.15 }}
        className={`absolute top-0 bottom-0 right-0 cursor-pointer transition-colors duration-200 ${
          capsuleOpen ? "pointer-events-none" : "pointer-events-auto"
        } ${
          isSpatial
            ? "rounded-full bg-neutral-300/50 dark:bg-neutral-600/40 hover:bg-neutral-400/60 dark:hover:bg-neutral-500/50"
            : "bg-neutral-200/60 dark:bg-neutral-700/40 hover:bg-neutral-300/80 dark:hover:bg-neutral-600/50"
        }`}
        style={{ width: COLLAPSED_WIDTH }}
        onClick={handleClick}
        title={t("capsule.expand")}
      />

      {/* ---- Peek overlay — floats on top, no layout shift ---- */}
      <AnimatePresence>
        {peeking && !capsuleOpen && (
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className={`absolute top-0 right-full z-50 flex flex-col pointer-events-auto ${peekBg}`}
            style={{
              width: EXPANDED_WIDTH,
              height: "100%",
              boxShadow:
                "-8px 0 30px -10px rgba(0,0,0,0.12), -2px 0 8px -4px rgba(0,0,0,0.06)",
            }}
          >
            <CapsuleTabBar
              activeTab={capsuleActiveTab}
              onTabChange={setCapsuleActiveTab}
            />
            <CapsuleBody activeTab={capsuleActiveTab} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

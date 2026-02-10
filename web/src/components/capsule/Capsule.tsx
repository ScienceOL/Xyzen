import { useActiveChannelStatus } from "@/hooks/useChannelSelectors";
import { useXyzen } from "@/store";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { KnowledgeTab } from "./KnowledgeTab";
import { MemoryTab } from "./MemoryTab";
import { ToolsTab } from "./ToolsTab";

const TABS = ["knowledge", "tools", "memory"] as const;

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
  trailing,
}: {
  activeTab: string;
  onTabChange: (tab: (typeof TABS)[number]) => void;
  trailing?: React.ReactNode;
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
      {trailing}
    </div>
  );
}

function CapsuleBody({ activeTab }: { activeTab: string }) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {activeTab === "knowledge" && <KnowledgeTab />}
      {activeTab === "tools" && <ToolsTab />}
      {activeTab === "memory" && <MemoryTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function Capsule({ variant = "default", onBack }: CapsuleProps) {
  const { t } = useTranslation();
  const { knowledge_set_id } = useActiveChannelStatus();
  const prevKnowledgeSetId = useRef(knowledge_set_id);

  const { capsuleOpen, capsuleActiveTab, setCapsuleOpen, setCapsuleActiveTab } =
    useXyzen(
      useShallow((s) => ({
        capsuleOpen: s.capsuleOpen,
        capsuleActiveTab: s.capsuleActiveTab,
        setCapsuleOpen: s.setCapsuleOpen,
        setCapsuleActiveTab: s.setCapsuleActiveTab,
      })),
    );

  // Peek state (local, hover-driven)
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

  const handlePeekEnter = useCallback(() => {
    clearTimeout(peekTimeout.current);
    setPeeking(true);
  }, []);

  const handlePeekLeave = useCallback(() => {
    peekTimeout.current = setTimeout(() => setPeeking(false), 150);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => () => clearTimeout(peekTimeout.current), []);

  const handleDock = useCallback(() => {
    setPeeking(false);
    setCapsuleOpen(true);
  }, [setCapsuleOpen]);

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
  // Desktop / Spatial — styling helpers
  // -------------------------------------------------------------------------
  const isSpatial = variant === "spatial";

  const panelBg = isSpatial
    ? "bg-white/60 dark:bg-neutral-900/60 backdrop-blur-2xl border border-black/5 dark:border-white/10 shadow-xl rounded-xl pointer-events-auto"
    : "bg-white dark:bg-neutral-950 border-l border-neutral-200 dark:border-neutral-800";

  const peekBg = isSpatial
    ? "bg-white/70 dark:bg-neutral-900/70 backdrop-blur-2xl border border-black/5 dark:border-white/10 rounded-xl pointer-events-auto"
    : "bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800";

  // -------------------------------------------------------------------------
  // Docked mode (capsuleOpen === true) — takes layout space
  // -------------------------------------------------------------------------
  if (capsuleOpen) {
    return (
      <motion.div
        initial={false}
        animate={{ width: 384 }}
        exit={{ width: 0 }}
        transition={transition}
        className={`overflow-hidden shrink-0 ${isSpatial ? "pointer-events-auto" : ""}`}
      >
        <div className={`w-[384px] h-full flex flex-col ${panelBg}`}>
          <CapsuleTabBar
            activeTab={capsuleActiveTab}
            onTabChange={setCapsuleActiveTab}
            trailing={
              <button
                onClick={() => setCapsuleOpen(false)}
                className="p-2 mr-1 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                title={t("capsule.collapse")}
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            }
          />
          <CapsuleBody activeTab={capsuleActiveTab} />
        </div>
      </motion.div>
    );
  }

  // -------------------------------------------------------------------------
  // Collapsed mode — thin trigger strip + overlay peek on hover
  // -------------------------------------------------------------------------
  return (
    <div
      className={`shrink-0 relative h-full ${isSpatial ? "pointer-events-auto" : ""}`}
      onMouseEnter={handlePeekEnter}
      onMouseLeave={handlePeekLeave}
    >
      {/* Trigger strip */}
      <div
        className={`h-full transition-all duration-200 cursor-pointer ${
          isSpatial ? "w-1.5 rounded-full" : "w-1"
        } ${
          peeking
            ? "bg-blue-400/40 dark:bg-blue-400/30"
            : "bg-neutral-200/60 dark:bg-neutral-700/40 hover:bg-neutral-300/80 dark:hover:bg-neutral-600/50"
        }`}
      />

      {/* Peek overlay */}
      <AnimatePresence>
        {peeking && (
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className={`absolute top-0 right-full w-[384px] h-full z-50 flex flex-col ${peekBg}`}
            style={{
              boxShadow:
                "-8px 0 30px -10px rgba(0,0,0,0.12), -2px 0 8px -4px rgba(0,0,0,0.06)",
            }}
          >
            <CapsuleTabBar
              activeTab={capsuleActiveTab}
              onTabChange={setCapsuleActiveTab}
              trailing={
                <button
                  onClick={handleDock}
                  className="p-2 mr-1 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                  title={t("capsule.dock")}
                >
                  <motion.div
                    initial={false}
                    animate={{ rotate: 0 }}
                    whileHover={{ rotate: 180 }}
                    transition={{ duration: 0.25 }}
                  >
                    <ChevronLeftIcon className="w-4 h-4" />
                  </motion.div>
                </button>
              }
            />
            <CapsuleBody activeTab={capsuleActiveTab} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

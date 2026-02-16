import { AgentList } from "@/components/agents";
import ChatStatusBadge from "@/components/base/ChatStatusBadge";
import { Capsule } from "@/components/capsule";
import {
  DOCK_HORIZONTAL_MARGIN,
  DOCK_SAFE_AREA,
} from "@/components/layouts/BottomDock";
import XyzenChat from "@/components/layouts/XyzenChat";
import {
  useActiveChannelStatus,
  useRunningAgentIds,
} from "@/hooks/useChannelSelectors";
import { useXyzen } from "@/store";
import type { Agent } from "@/types/agents";
import { ChevronLeftIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { AgentData } from "./types";

interface FocusedViewProps {
  agent: AgentData;
  agents: (AgentData & { id: string })[];
  onClose: () => void;
  onSwitchAgent: (id: string) => void;
  onCanvasClick?: () => void; // Callback specifically for canvas clicks
  // Agent edit/delete handlers
  onEditAgent?: (agentId: string) => void;
  onDeleteAgent?: (agentId: string) => void;
}

export function FocusedView({
  agent,
  agents,
  onClose,
  onSwitchAgent,
  onCanvasClick,
  onEditAgent,
  onDeleteAgent,
}: FocusedViewProps) {
  const switcherRef = useRef<HTMLDivElement | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const t = useTranslation().t;

  const {
    activateChannelForAgent,
    reorderAgents,
    spatialSidebarCollapsed,
    setSpatialSidebarCollapsed,
  } = useXyzen(
    useShallow((s) => ({
      activateChannelForAgent: s.activateChannelForAgent,
      reorderAgents: s.reorderAgents,
      spatialSidebarCollapsed: s.spatialSidebarCollapsed,
      setSpatialSidebarCollapsed: s.setSpatialSidebarCollapsed,
    })),
  );
  const collapsed = spatialSidebarCollapsed;
  const runningAgentIds = useRunningAgentIds();
  const { knowledge_set_id: focusedKnowledgeSetId } = useActiveChannelStatus();

  // Convert AgentData to Agent type for AgentList component
  const agentsForList: Agent[] = useMemo(
    () =>
      agents.map((a) => ({
        id: a.id, // Use node ID for switching
        name: a.name,
        description: a.desc,
        avatar: a.avatar,
        user_id: "",
        created_at: "",
        updated_at: "",
      })),
    [agents],
  );

  // Create a map for quick lookup of original AgentData
  const agentDataMap = useMemo(
    () => new Map(agents.map((a) => [a.id, a])),
    [agents],
  );

  // Get selected agent's node ID
  const selectedAgentId = useMemo(
    () => agents.find((a) => a.agentId === agent.agentId)?.id,
    [agents, agent.agentId],
  );

  // Auto-scroll to selected agent in the list
  useEffect(() => {
    if (!selectedAgentId || !listContainerRef.current) return;

    const container = listContainerRef.current;
    const selectedElement = container.querySelector(
      `[data-agent-id="${selectedAgentId}"]`,
    );

    if (selectedElement) {
      selectedElement.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [selectedAgentId]);

  // Callbacks to get status and role from original AgentData
  const getAgentStatus = useCallback(
    (a: Agent) => {
      const realAgentId = agentDataMap.get(a.id)?.agentId;
      if (!realAgentId) return "idle";

      return runningAgentIds.has(realAgentId) ? "busy" : "idle";
    },
    [agentDataMap, runningAgentIds],
  );

  const getAgentRole = useCallback(
    (a: Agent) => agentDataMap.get(a.id)?.role,
    [agentDataMap],
  );

  const handleAgentClick = useCallback(
    (a: Agent) => onSwitchAgent(a.id),
    [onSwitchAgent],
  );

  // Map node id back to real agentId for edit/delete
  const handleEditClick = useCallback(
    (a: Agent) => {
      const agentData = agentDataMap.get(a.id);
      if (agentData?.agentId && onEditAgent) {
        onEditAgent(agentData.agentId);
      }
    },
    [agentDataMap, onEditAgent],
  );

  const handleDeleteClick = useCallback(
    (a: Agent) => {
      const agentData = agentDataMap.get(a.id);
      if (agentData?.agentId && onDeleteAgent) {
        onDeleteAgent(agentData.agentId);
      }
    },
    [agentDataMap, onDeleteAgent],
  );

  // Handle reorder - map node IDs back to real agent IDs
  const handleReorder = useCallback(
    async (nodeIds: string[]) => {
      // Convert node IDs to actual agent IDs
      const agentIds = nodeIds
        .map((nodeId) => agentDataMap.get(nodeId)?.agentId)
        .filter((id): id is string => !!id);

      if (agentIds.length > 0) {
        try {
          await reorderAgents(agentIds);
        } catch (error) {
          console.error("Failed to reorder agents:", error);
        }
      }
    },
    [agentDataMap, reorderAgents],
  );

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
    <div
      className="absolute inset-0 z-40 flex items-stretch pt-4 pointer-events-none"
      style={{
        paddingBottom: DOCK_SAFE_AREA,
        paddingLeft: DOCK_HORIZONTAL_MARGIN,
        paddingRight: DOCK_HORIZONTAL_MARGIN,
      }}
    >
      {/* 1. Left Column: Collapsible Agent Switcher */}
      <motion.div
        initial={false}
        animate={{ width: collapsed ? 56 : 320 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="flex flex-col justify-end relative z-10 pointer-events-none shrink-0"
      >
        {/* Agent Switcher List */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="bg-white/60 dark:bg-neutral-900/60 backdrop-blur-2xl border border-black/5 dark:border-white/10 shadow-xl rounded-xl overflow-hidden pointer-events-auto max-h-[50vh] flex flex-col"
          ref={switcherRef}
        >
          {/* Header with collapse toggle */}
          <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 bg-white/40 dark:bg-white/5 px-3 py-2.5">
            <AnimatePresence mode="wait" initial={false}>
              {collapsed ? (
                <motion.div
                  key="icon"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center justify-center w-8 h-5"
                >
                  <SparklesIcon className="w-4 h-4 text-neutral-500" />
                </motion.div>
              ) : (
                <motion.h3
                  key="text"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15 }}
                  className="text-xs font-bold uppercase text-neutral-500 tracking-wider px-1"
                >
                  {t("agents.title")}
                </motion.h3>
              )}
            </AnimatePresence>
            <button
              onClick={() => setSpatialSidebarCollapsed(!collapsed)}
              className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
            >
              <motion.div
                initial={false}
                animate={{ rotate: collapsed ? 180 : 0 }}
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              >
                <ChevronLeftIcon className="w-3.5 h-3.5" />
              </motion.div>
            </button>
          </div>

          {/* Content: full list or avatar-only column */}
          <div
            ref={listContainerRef}
            className="overflow-y-auto custom-scrollbar"
          >
            <AnimatePresence mode="wait" initial={false}>
              {collapsed ? (
                <motion.div
                  key="collapsed"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col items-center gap-1 p-2"
                >
                  {agents.map((a) => {
                    const isSelected = selectedAgentId === a.id;
                    const realAgentId = agentDataMap.get(a.id)?.agentId;
                    const isBusy = realAgentId
                      ? runningAgentIds.has(realAgentId)
                      : false;
                    return (
                      <button
                        key={a.id}
                        data-agent-id={a.id}
                        onClick={() => onSwitchAgent(a.id)}
                        title={a.name}
                        className={`relative rounded-full p-0.5 transition-all duration-200 ${
                          isSelected
                            ? "ring-2 ring-blue-500/60 shadow-sm"
                            : "hover:ring-2 hover:ring-black/10 dark:hover:ring-white/20"
                        }`}
                      >
                        <img
                          src={
                            a.avatar ||
                            "https://api.dicebear.com/7.x/avataaars/svg?seed=default"
                          }
                          alt={a.name}
                          className="w-9 h-9 rounded-full border border-white/50 object-cover"
                        />
                        {isBusy && (
                          <div className="absolute -bottom-0.5 -right-0.5">
                            <ChatStatusBadge
                              status="running"
                              size="xs"
                              showLabel={false}
                            />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </motion.div>
              ) : (
                <motion.div
                  key="expanded"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="p-2"
                >
                  <AgentList
                    agents={agentsForList}
                    variant="compact"
                    sortable={true}
                    selectedAgentId={selectedAgentId}
                    getAgentStatus={getAgentStatus}
                    getAgentRole={getAgentRole}
                    onAgentClick={handleAgentClick}
                    onEdit={onEditAgent ? handleEditClick : undefined}
                    onDelete={onDeleteAgent ? handleDeleteClick : undefined}
                    onReorder={handleReorder}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>

      {/* 2. Main Chat Area - Frosted Glass Panel */}
      <motion.div
        initial={{ x: 50, opacity: 0, scale: 0.95 }}
        animate={{ x: 0, opacity: 1, scale: 1 }}
        exit={{ x: 50, opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
        className="ml-4 spatial-chat-frosted relative z-10 flex flex-1 min-w-0 flex-col overflow-hidden rounded-xl border border-black/5 bg-white/60 shadow-xl backdrop-blur-2xl pointer-events-auto dark:border-white/10 dark:bg-neutral-900/70"
        ref={chatRef}
      >
        {/* XyzenChat Component - No modifications, just wrapped */}
        <XyzenChat />
      </motion.div>

      {/* 3. Capsule Panel - Right Side
          Always mounted so the outer AnimatePresence (SpatialWorkspace)
          can drive the exit animation when FocusedView unmounts.
          The animate prop reacts to knowledge_set_id within the view. */}
      <motion.div
        initial={{ opacity: 0, width: 0, marginLeft: 0 }}
        animate={
          focusedKnowledgeSetId
            ? { opacity: 1, width: "auto", marginLeft: 16 }
            : { opacity: 0, width: 0, marginLeft: 0 }
        }
        exit={{ opacity: 0, width: 0, marginLeft: 0 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="shrink-0 pointer-events-none h-full"
      >
        {focusedKnowledgeSetId && <Capsule variant="spatial" />}
      </motion.div>
    </div>
  );
}

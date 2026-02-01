import { AgentList } from "@/components/agents";
import XyzenChat from "@/components/layouts/XyzenChat";
import { useXyzen } from "@/store";
import type { Agent } from "@/types/agents";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { AgentData } from "./types";
import { useTranslation } from "react-i18next";

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

  const { activateChannelForAgent, reorderAgents } = useXyzen();

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
    () => agents.find((a) => a.name === agent.name)?.id,
    [agents, agent.name],
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
      const status = agentDataMap.get(a.id)?.status;
      // Map "offline" to "idle" since compact variant only supports "idle" | "busy"
      return status === "busy" ? "busy" : "idle";
    },
    [agentDataMap],
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
    <div className="absolute inset-0 z-40 flex items-stretch p-4 gap-4 pointer-events-none">
      {/* 1. Left Column: Top (Empty for Node visibility) + Bottom (Switcher) */}
      <div className="w-80 flex flex-col justify-end relative z-10 pointer-events-none">
        {/* Agent Switcher List */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="bg-white/60 dark:bg-neutral-900/60 backdrop-blur-2xl border border-black/5 dark:border-white/10 shadow-xl rounded-2xl overflow-hidden pointer-events-auto max-h-[50vh] flex flex-col"
          ref={switcherRef}
        >
          <div className="px-4 py-3 border-b border-black/5 dark:border-white/5 bg-white/40 dark:bg-white/5">
            <h3 className="text-xs font-bold uppercase text-neutral-500 tracking-wider">
              {t("agents.title")}
            </h3>
          </div>
          <div
            ref={listContainerRef}
            className="overflow-y-auto p-2 custom-scrollbar"
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
          </div>
        </motion.div>
      </div>

      {/* 2. Main Chat Area - Frosted Glass Panel */}
      <motion.div
        initial={{ x: 50, opacity: 0, scale: 0.95 }}
        animate={{ x: 0, opacity: 1, scale: 1 }}
        exit={{ x: 50, opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
        className="spatial-chat-frosted relative z-10 flex flex-1 flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/60 shadow-xl backdrop-blur-2xl pointer-events-auto dark:border-white/10 dark:bg-neutral-900/70"
        ref={chatRef}
      >
        {/* XyzenChat Component - No modifications, just wrapped */}
        <XyzenChat />
      </motion.div>
    </div>
  );
}

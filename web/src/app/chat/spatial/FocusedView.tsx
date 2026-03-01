import { AgentList } from "@/components/agents";
import ChatStatusBadge from "@/components/base/ChatStatusBadge";
import { Switch } from "@/components/base/Switch";
import { Capsule } from "@/components/capsule";
import {
  DOCK_HORIZONTAL_MARGIN,
  DOCK_SAFE_AREA,
} from "@/components/layouts/BottomDock";
import XyzenChat from "@/components/layouts/XyzenChat";
import { useRunningAgentIds } from "@/hooks/useChannelSelectors";
import { useXyzen } from "@/store";
import type { Agent } from "@/types/agents";
import { ChevronLeftIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { Crown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TopicTabBar } from "./components/TopicTabBar";
import { useAgentTopics } from "./hooks";
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
  // Stable refs for event-listener callbacks — avoids re-attaching on every render
  const onCloseRef = useRef(onClose);
  const onCanvasClickRef = useRef(onCanvasClick);
  onCloseRef.current = onClose;
  onCanvasClickRef.current = onCanvasClick;

  const t = useTranslation().t;

  const collapsed = useXyzen((s) => s.spatialSidebarCollapsed);
  const runningAgentIds = useRunningAgentIds();
  const toggleAutoExplore = useXyzen((s) => s.toggleAutoExplore);
  const [autoExploreLoading, setAutoExploreLoading] = useState(false);
  const handleAutoExploreToggle = useCallback(
    async (enabled: boolean) => {
      setAutoExploreLoading(true);
      try {
        await toggleAutoExplore(enabled);
      } catch (error) {
        console.error("Failed to toggle auto-explore:", error);
      } finally {
        setAutoExploreLoading(false);
      }
    },
    [toggleAutoExplore],
  );
  const focusedKnowledgeSetId = useXyzen((s) => {
    const id = s.activeChatChannel;
    return id ? (s.channels[id]?.knowledge_set_id ?? null) : null;
  });

  // Separate CEO agent from the rest
  const ceoAgentData = useMemo(
    () => agents.find((a) => a.isCeo) ?? null,
    [agents],
  );
  const nonCeoAgents = useMemo(() => agents.filter((a) => !a.isCeo), [agents]);

  // Convert AgentData to Agent type for AgentList component (non-CEO only)
  const agentsForList: Agent[] = useMemo(
    () =>
      nonCeoAgents.map((a) => ({
        id: a.id, // Use node ID for switching
        name: a.name,
        description: a.desc,
        avatar: a.avatar,
        user_id: "",
        created_at: "",
        updated_at: "",
      })),
    [nonCeoAgents],
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
          await useXyzen.getState().reorderAgents(agentIds);
        } catch (error) {
          console.error("Failed to reorder agents:", error);
        }
      }
    },
    [agentDataMap],
  );

  // Topic management for this agent
  const {
    openTabs,
    sessionId,
    activeTopicId,
    respondingTopicIds,
    createTopic,
    closeTab,
  } = useAgentTopics(agent.agentId);

  // Activate the channel for the selected agent (initial activation)
  useEffect(() => {
    if (agent.agentId) {
      useXyzen
        .getState()
        .activateChannelForAgent(agent.agentId)
        .catch((error) => {
          console.error("Failed to activate channel for agent:", error);
        });
    }
  }, [agent.agentId]);

  const handleSelectTopic = useCallback(
    async (topicId: string) => {
      if (!sessionId) return;
      await useXyzen
        .getState()
        .ensureChannelForTopic(topicId, sessionId, agent.agentId);
    },
    [sessionId, agent.agentId],
  );

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
        onCloseRef.current();
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

      if (onCanvasClickRef.current) {
        onCanvasClickRef.current();
      } else {
        onCloseRef.current();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDownCapture, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDownCapture, true);
    };
    // Refs are stable — register listeners once
  }, []);

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
              onClick={() =>
                useXyzen.getState().setSpatialSidebarCollapsed(!collapsed)
              }
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

          {/* CEO agent — pinned at top, outside scroll */}
          {ceoAgentData && (
            <div className="shrink-0">
              <AnimatePresence mode="wait" initial={false}>
                {collapsed ? (
                  <motion.div
                    key="ceo-collapsed"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col items-center px-2 pt-2"
                  >
                    {(() => {
                      const isSelected = selectedAgentId === ceoAgentData.id;
                      const realAgentId = agentDataMap.get(
                        ceoAgentData.id,
                      )?.agentId;
                      const isBusy = realAgentId
                        ? runningAgentIds.has(realAgentId)
                        : false;
                      return (
                        <button
                          data-agent-id={ceoAgentData.id}
                          onClick={() => onSwitchAgent(ceoAgentData.id)}
                          title={ceoAgentData.name}
                          className={`relative rounded-full p-0.5 transition-all duration-200 ${
                            isSelected
                              ? "ring-2 ring-amber-500/60 shadow-sm"
                              : "hover:ring-2 hover:ring-amber-400/30"
                          }`}
                        >
                          <img
                            src={
                              ceoAgentData.avatar ||
                              "https://api.dicebear.com/7.x/avataaars/svg?seed=default"
                            }
                            alt={ceoAgentData.name}
                            className="w-9 h-9 rounded-full border border-amber-300/40 dark:border-amber-500/30 object-cover"
                          />
                          <div className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 ring-[1px] ring-white/80 dark:ring-neutral-900/80">
                            <Crown className="h-2 w-2 text-white" />
                          </div>
                          {isBusy && (
                            <div className="absolute -top-0.5 -right-0.5">
                              <ChatStatusBadge
                                status="running"
                                size="xs"
                                showLabel={false}
                              />
                            </div>
                          )}
                        </button>
                      );
                    })()}
                  </motion.div>
                ) : (
                  <motion.div
                    key="ceo-expanded"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="px-2 pt-2"
                  >
                    {(() => {
                      const isSelected = selectedAgentId === ceoAgentData.id;
                      const realAgentId = agentDataMap.get(
                        ceoAgentData.id,
                      )?.agentId;
                      const isBusy = realAgentId
                        ? runningAgentIds.has(realAgentId)
                        : false;
                      return (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => onSwitchAgent(ceoAgentData.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onSwitchAgent(ceoAgentData.id);
                            }
                          }}
                          className={`relative flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all duration-200 overflow-hidden ${
                            isSelected
                              ? "bg-amber-50/80 dark:bg-amber-900/20 shadow-sm ring-1 ring-amber-300/30 dark:ring-amber-500/20"
                              : "hover:bg-amber-50/50 dark:hover:bg-amber-900/10"
                          }`}
                        >
                          {/* Thin gold accent line at top */}
                          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
                          {/* Avatar with crown badge */}
                          <div className="relative shrink-0">
                            <img
                              src={
                                ceoAgentData.avatar ||
                                "https://api.dicebear.com/7.x/avataaars/svg?seed=default"
                              }
                              alt={ceoAgentData.name}
                              className="w-10 h-10 rounded-full border border-amber-300/30 dark:border-amber-500/20 object-cover"
                            />
                            <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 ring-[1.5px] ring-white/80 dark:ring-neutral-900/80">
                              <Crown className="h-2.5 w-2.5 text-white" />
                            </div>
                          </div>
                          {/* Text */}
                          <div className="min-w-0 flex-1 text-left">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className="truncate text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                                {ceoAgentData.name}
                              </div>
                              <span className="shrink-0 rounded-sm bg-amber-500/10 px-1 py-px text-[8px] font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
                                {t("agents.rootAgent.badge")}
                              </span>
                              {isBusy && (
                                <ChatStatusBadge
                                  status="running"
                                  size="xs"
                                  showLabel={false}
                                  className="shrink-0"
                                />
                              )}
                            </div>
                            {ceoAgentData.role && (
                              <div className="truncate text-[10px] text-amber-600/70 dark:text-amber-400/60">
                                {ceoAgentData.role}
                              </div>
                            )}
                            {/* Auto-Explore toggle */}
                            <div
                              className="mt-1 flex items-center gap-2"
                              onClick={(e) => e.stopPropagation()}
                              onPointerDown={(e) => e.stopPropagation()}
                            >
                              <span className="text-xs text-neutral-400 dark:text-neutral-500">
                                {t("agents.rootAgent.autoExplore")}
                              </span>
                              <Switch
                                checked={
                                  ceoAgentData.agent?.auto_explore_enabled ??
                                  false
                                }
                                onChange={handleAutoExploreToggle}
                                disabled={autoExploreLoading}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </motion.div>
                )}
              </AnimatePresence>
              {/* Separator */}
              {nonCeoAgents.length > 0 &&
                (collapsed ? (
                  <div className="flex justify-center py-1">
                    <div className="w-6 border-t border-amber-300/20 dark:border-amber-500/10" />
                  </div>
                ) : (
                  <div className="mx-4 my-1 border-t border-neutral-100 dark:border-neutral-800" />
                ))}
            </div>
          )}

          {/* Scrollable non-CEO agent list */}
          <div
            ref={listContainerRef}
            className="overflow-y-auto custom-scrollbar min-h-0"
          >
            <AnimatePresence mode="wait" initial={false}>
              {collapsed ? (
                <motion.div
                  key="collapsed"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col items-center gap-1 px-2 pb-2"
                >
                  {nonCeoAgents.map((a) => {
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
        className="ml-4 spatial-chat-frosted relative z-10 flex flex-1 min-w-0 flex-col overflow-hidden rounded-xl border border-black/5 shadow-xl backdrop-blur-2xl pointer-events-auto dark:border-white/10"
        ref={chatRef}
      >
        {/* Topic Tab Bar */}
        <TopicTabBar
          tabs={openTabs}
          activeTopicId={activeTopicId}
          respondingTopicIds={respondingTopicIds}
          onSelectTopic={handleSelectTopic}
          onCloseTopic={closeTab}
          onCreateTopic={createTopic}
        />
        {/* XyzenChat — min-h-0 lets it shrink within the flex column */}
        <div className="flex-1 min-h-0">
          <XyzenChat />
        </div>
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

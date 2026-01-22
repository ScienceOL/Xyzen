"use client";

import { TooltipProvider } from "@/components/animate-ui/components/animate/tooltip";
import { FileUploadPreview } from "@/components/features";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { useXyzen } from "@/store";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
} from "@dnd-kit/core";
import { EllipsisHorizontalIcon } from "@heroicons/react/24/outline";
import { useCallback, useMemo, useRef, useState } from "react";
import { TierSelector, type ModelTier } from "./TierSelector";
import { useTranslation } from "react-i18next";
import {
  HistorySheetButton,
  McpToolsButton,
  MobileMoreMenu,
  ToolbarActions,
  ToolSelector,
} from "./ChatToolbar/index";

interface ChatToolbarProps {
  onShowHistory: () => void;
  onHeightChange?: (height: number) => void;
  showHistory: boolean;
  handleCloseHistory: () => void;
  handleSelectTopic: (topic: string) => void;
  inputHeight: number;
}

// Draggable resize handle component
const ResizeHandle = () => {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: "resize-handle",
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "absolute -top-3 left-0 right-0 h-6 cursor-ns-resize",
        "flex items-center justify-center",
        "transition-colors",
      )}
      style={{ touchAction: "none" }}
      title={t("app.toolbar.resizeHint")}
    >
      <div
        className={cn(
          "w-full h-1 transition-colors",
          isDragging
            ? "bg-indigo-600 dark:bg-indigo-500"
            : "bg-transparent hover:bg-indigo-600/40 dark:hover:bg-indigo-500/40",
        )}
      />
    </div>
  );
};

export default function ChatToolbar({
  onShowHistory,
  onHeightChange,
  showHistory,
  handleCloseHistory,
  handleSelectTopic,
  inputHeight,
}: ChatToolbarProps) {
  const {
    createDefaultChannel,
    activeChatChannel,
    channels,
    agents,
    mcpServers,
    updateSessionConfig,
    uploadedFiles,
    isUploading,
    updateAgent,
    openSettingsModal,
  } = useXyzen();

  // All user agents for lookup
  const allAgents = useMemo(() => agents, [agents]);

  // Get current channel and associated MCP tools
  const currentMcpInfo = useMemo(() => {
    if (!activeChatChannel) return null;

    const channel = channels[activeChatChannel];
    if (!channel?.agentId) return null;

    const agent = allAgents.find((a) => a.id === channel.agentId);
    if (!agent?.mcp_servers?.length) return null;

    const connectedServers = mcpServers.filter((server) =>
      agent.mcp_servers?.some((mcpRef) => mcpRef.id === server.id),
    );

    return {
      agent,
      servers: connectedServers,
    };
  }, [activeChatChannel, channels, allAgents, mcpServers]);

  // Get current agent
  const currentAgent = useMemo(() => {
    if (!activeChatChannel) return null;
    const channel = channels[activeChatChannel];
    if (!channel?.agentId) return null;
    return allAgents.find((a) => a.id === channel.agentId) || null;
  }, [activeChatChannel, channels, allAgents]);

  // Get current channel
  const currentChannel = useMemo(() => {
    if (!activeChatChannel) return null;
    return channels[activeChatChannel] || null;
  }, [activeChatChannel, channels]);

  // Get current session's tier
  const currentSessionTier = useMemo(() => {
    return currentChannel?.model_tier || null;
  }, [currentChannel]);

  // State for new chat creation loading
  const [isCreatingNewChat, setIsCreatingNewChat] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Refs for drag handling
  const initialHeightRef = useRef(inputHeight);
  const dragDeltaRef = useRef(0);

  // Detect if we're on mobile
  const isMobile = useIsMobile();

  // Setup dnd sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 0 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 0, tolerance: 0 },
    }),
  );

  // Tier change handler
  const handleTierChange = useCallback(
    async (tier: ModelTier) => {
      if (!currentChannel?.sessionId) return;

      try {
        await updateSessionConfig(currentChannel.sessionId, {
          model_tier: tier,
        });
      } catch (error) {
        console.error("Failed to update session tier:", error);
      }
    },
    [currentChannel, updateSessionConfig],
  );

  // Knowledge set change handler
  const handleKnowledgeSetChange = useCallback(
    async (knowledgeSetId: string | null) => {
      if (!currentChannel?.sessionId) return;

      try {
        await updateSessionConfig(currentChannel.sessionId, {
          knowledge_set_id: knowledgeSetId,
        });
      } catch (error) {
        console.error("Failed to update session knowledge set:", error);
      }
    },
    [currentChannel, updateSessionConfig],
  );

  const handleNewChat = async () => {
    if (isCreatingNewChat) return;

    try {
      setIsCreatingNewChat(true);
      await createDefaultChannel(currentAgent?.id);
    } catch (error) {
      console.error("Failed to create new chat:", error);
    } finally {
      setIsCreatingNewChat(false);
    }
  };

  // Drag handlers
  const handleDragStart = () => {
    initialHeightRef.current = inputHeight;
    dragDeltaRef.current = 0;
  };

  const handleDragMoveDesktop = useCallback(
    (event: DragMoveEvent) => {
      const { delta } = event;
      dragDeltaRef.current = delta.y;
      const newHeight = Math.max(60, initialHeightRef.current - delta.y);
      onHeightChange?.(newHeight);
    },
    [onHeightChange],
  );

  const handleDragMoveMobile = useCallback(
    (event: DragMoveEvent) => {
      const { delta } = event;
      dragDeltaRef.current = delta.y;
      const maxHeight = Math.floor(window.innerHeight * 0.65);
      const newHeight = Math.max(
        60,
        Math.min(initialHeightRef.current - delta.y, maxHeight),
      );
      onHeightChange?.(newHeight);
    },
    [onHeightChange],
  );

  const handleDragMove = isMobile
    ? handleDragMoveMobile
    : handleDragMoveDesktop;

  const handleDragEndDesktop = useCallback(
    (_: DragEndEvent) => {
      const finalHeight = Math.max(
        60,
        initialHeightRef.current - dragDeltaRef.current,
      );
      onHeightChange?.(finalHeight);
      dragDeltaRef.current = 0;
    },
    [onHeightChange],
  );

  const handleDragEndMobile = useCallback(
    (_: DragEndEvent) => {
      const maxHeight = Math.floor(window.innerHeight * 0.65);
      const finalHeight = Math.max(
        60,
        Math.min(initialHeightRef.current - dragDeltaRef.current, maxHeight),
      );
      onHeightChange?.(finalHeight);
      dragDeltaRef.current = 0;
    },
    [onHeightChange],
  );

  const handleDragEnd = isMobile ? handleDragEndMobile : handleDragEndDesktop;

  const toolbarButtonClass = cn(
    "flex h-8 w-8 items-center justify-center rounded-md transition-all duration-200",
    "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900",
    "dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    "[&>svg]:h-5 [&>svg]:w-5",
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <div className="relative">
        {/* Drag handle positioned above the toolbar */}
        <ResizeHandle />

        {/* File Upload Preview */}
        {uploadedFiles.length > 0 && (
          <FileUploadPreview className="border-b border-neutral-200 dark:border-neutral-800" />
        )}

        {/* Mobile More Menu */}
        {activeChatChannel && currentAgent && (
          <MobileMoreMenu
            isOpen={showMoreMenu}
            agent={currentAgent}
            onUpdateAgent={updateAgent}
            mcpInfo={currentMcpInfo}
            allMcpServers={mcpServers}
            onOpenSettings={() => openSettingsModal("mcp")}
            sessionKnowledgeSetId={currentChannel?.knowledge_set_id}
            onUpdateSessionKnowledge={handleKnowledgeSetChange}
          />
        )}

        <TooltipProvider>
          <div className="flex flex-wrap items-center justify-between bg-white px-2 py-1.5 dark:bg-black dark:border-t dark:border-neutral-800 gap-2">
            <div className="flex flex-wrap items-center gap-1">
              <ToolbarActions
                onNewChat={handleNewChat}
                isCreatingNewChat={isCreatingNewChat}
                isUploading={isUploading}
                buttonClassName={toolbarButtonClass}
              />

              {/* Tier Selector */}
              {activeChatChannel && currentAgent && (
                <TierSelector
                  currentTier={currentSessionTier}
                  onTierChange={handleTierChange}
                />
              )}

              {/* Desktop View: Expanded Items */}
              <div className="hidden md:flex items-center space-x-1">
                {/* Tool Selector - replaces SearchMethodSelector and KnowledgeSelector */}
                {activeChatChannel && currentAgent && (
                  <ToolSelector
                    agent={currentAgent}
                    onUpdateAgent={updateAgent}
                    hasKnowledgeSet={
                      !!currentAgent.knowledge_set_id ||
                      !!currentChannel?.knowledge_set_id
                    }
                    sessionKnowledgeSetId={currentChannel?.knowledge_set_id}
                    onUpdateSessionKnowledge={handleKnowledgeSetChange}
                  />
                )}

                {/* MCP Tool Button */}
                {currentAgent && (
                  <McpToolsButton
                    mcpInfo={
                      currentMcpInfo || { agent: currentAgent, servers: [] }
                    }
                    allMcpServers={mcpServers}
                    agent={currentAgent}
                    onUpdateAgent={updateAgent}
                    onOpenSettings={() => openSettingsModal("mcp")}
                    buttonClassName={cn(
                      toolbarButtonClass,
                      "w-auto px-2 gap-1.5",
                    )}
                  />
                )}
              </div>

              {/* Mobile View: More Button */}
              <div className="md:hidden relative">
                <button
                  onClick={() => setShowMoreMenu(!showMoreMenu)}
                  className={cn(
                    toolbarButtonClass,
                    showMoreMenu &&
                      "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100",
                  )}
                >
                  <EllipsisHorizontalIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-1">
              <HistorySheetButton
                isOpen={showHistory}
                onOpenChange={(open) => {
                  if (open) {
                    onShowHistory();
                  } else {
                    handleCloseHistory();
                  }
                }}
                onClose={handleCloseHistory}
                onSelectTopic={handleSelectTopic}
                buttonClassName={toolbarButtonClass}
              />
            </div>
          </div>
        </TooltipProvider>
      </div>
    </DndContext>
  );
}

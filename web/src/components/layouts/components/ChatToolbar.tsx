"use client";

import { TooltipProvider } from "@/components/animate-ui/components/animate/tooltip";
import { FileUploadPreview } from "@/components/features";
import { useAvailableModels, useMyProviders } from "@/hooks/queries";
import { cn } from "@/lib/utils";
import { useXyzen } from "@/store";
import type { ModelInfo } from "@/types/llmProvider";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
} from "@dnd-kit/core";
import { EllipsisHorizontalIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KnowledgeSelector } from "./KnowledgeSelector";
import { ModelSelector } from "./ModelSelector";
import {
  SearchMethodSelector,
  type SearchMethod,
} from "./SearchMethodSelector";
// Extracted components from ./ChatToolbar/ directory
import { useTranslation } from "react-i18next";
import {
  HistorySheetButton,
  McpToolsButton,
  MobileMoreMenu,
  ToolbarActions,
} from "./ChatToolbar/index";

interface ChatToolbarProps {
  onShowHistory: () => void;
  onHeightChange?: (height: number) => void;
  showHistory: boolean;
  handleCloseHistory: () => void;
  handleSelectTopic: (topic: string) => void;
}

// Draggable resize handle component
const ResizeHandle = () => {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: "resize-handle",
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="absolute -top-1 left-0 right-0 h-1 cursor-ns-resize transition-colors hover:bg-indigo-600"
      title={t("app.toolbar.resizeHint")}
    />
  );
};

export default function ChatToolbar({
  onShowHistory,
  onHeightChange,
  showHistory,
  handleCloseHistory,
  handleSelectTopic,
}: ChatToolbarProps) {
  const {
    createDefaultChannel,
    activeChatChannel,
    channels,
    agents,
    mcpServers,
    updateSessionProviderAndModel,
    updateSessionConfig,
    uploadedFiles,
    isUploading,
    builtinMcpServers,
    fetchBuiltinMcpServers,
    quickAddBuiltinServer,
    updateAgent,
  } = useXyzen();

  // Use TanStack Query hooks for provider data
  const { data: llmProviders = [] } = useMyProviders();
  const { data: availableModels = {} } = useAvailableModels();

  // All user agents for lookup
  const allAgents = useMemo(() => {
    return agents;
  }, [agents]);

  // State for managing input height
  const [inputHeight, setInputHeight] = useState(() => {
    const savedHeight = localStorage.getItem("chatInputHeight");
    return savedHeight ? parseInt(savedHeight, 10) : 80;
  });

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

  const isKnowledgeMcpConnected = useMemo(() => {
    return currentMcpInfo?.servers.some((s) => s.name.includes("Knowledge"));
  }, [currentMcpInfo]);

  const handleConnectKnowledge = async () => {
    if (!currentAgent) return;

    // If builtin search is enabled, switch to searxng first since MCP can't work with builtin search
    if (searchMethod === "builtin") {
      await handleSearchMethodChange("searxng");
    }

    // 1. Check if already connected (in user's MCP list)
    let knowledgeMcp = mcpServers.find((s) => s.name.includes("Knowledge"));

    // 2. If not, try to create from builtin
    if (!knowledgeMcp) {
      // Find in builtins
      const builtin = builtinMcpServers.find((s) =>
        s.name.includes("Knowledge"),
      );

      // If not loaded, try fetch
      if (!builtin) {
        await fetchBuiltinMcpServers();
        // Since we can't access updated state here immediately due to closure,
        // we can try to find it in the builtins we just fetched (if fetch returned it, but it doesn't).
        // However, fetching triggers a re-render.
        // For now, we will return and rely on the user clicking again or the re-render.
        // Ideally we should wait for the state update, but React state is async.
        // A simple workaround is to let the user know or just return.
        // Since the button remains "Connect", they can click again.
        return;
      }

      if (builtin) {
        knowledgeMcp = await quickAddBuiltinServer(builtin);
      }
    }

    if (!knowledgeMcp) return;

    // 3. Attach to Agent
    if (!currentAgent.mcp_servers?.some((ref) => ref.id === knowledgeMcp!.id)) {
      // Construct new list
      const currentIds = currentAgent.mcp_servers?.map((s) => s.id) || [];
      const newIds = [...currentIds, knowledgeMcp.id];

      try {
        await updateAgent({ ...currentAgent, mcp_server_ids: newIds });
      } catch (e) {
        console.error("Failed to attach knowledge base:", e);
      }
    }
  };

  const handleDisconnectKnowledge = async () => {
    if (!currentAgent) return;

    const knowledgeMcp = mcpServers.find((s) => s.name.includes("Knowledge"));
    if (!knowledgeMcp) return;

    const newIds =
      currentAgent.mcp_servers
        ?.map((s) => s.id)
        .filter((id) => id !== knowledgeMcp.id) || [];

    try {
      await updateAgent({ ...currentAgent, mcp_server_ids: newIds });
    } catch (e) {
      console.error("Failed to disconnect knowledge base:", e);
    }
  };

  // Get current agent
  const currentAgent = useMemo(() => {
    if (!activeChatChannel) return null;
    const channel = channels[activeChatChannel];
    if (!channel?.agentId) return null;
    return allAgents.find((a) => a.id === channel.agentId) || null;
  }, [activeChatChannel, channels, allAgents]);

  // Get current session's provider and model
  const currentSessionProvider = useMemo(() => {
    if (!activeChatChannel) return null;
    const channel = channels[activeChatChannel];
    return channel?.provider_id || null;
  }, [activeChatChannel, channels]);

  const currentSessionModel = useMemo(() => {
    if (!activeChatChannel) return null;
    const channel = channels[activeChatChannel];
    return channel?.model || null;
  }, [activeChatChannel, channels]);

  // State for search method: none, builtin, or searxng
  const [searchMethod, setSearchMethod] = useState<SearchMethod>("none");

  // State for new chat creation loading
  const [isCreatingNewChat, setIsCreatingNewChat] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Refs for drag handling
  const initialHeightRef = useRef(inputHeight);
  const dragDeltaRef = useRef(0);

  // Connect Web Search MCP
  const connectSearchMcp = useCallback(async () => {
    if (!currentAgent) return;

    // 1. Check if already connected (in user's MCP list)
    let searchMcp = mcpServers.find((s) => s.name.includes("Web Search"));

    // 2. If not, try to create from builtin
    if (!searchMcp) {
      // Find in builtins
      const builtin = builtinMcpServers.find((s) =>
        s.name.includes("Web Search"),
      );

      // If not loaded, try fetch
      if (!builtin) {
        await fetchBuiltinMcpServers();
        return;
      }

      if (builtin) {
        searchMcp = await quickAddBuiltinServer(builtin);
      }
    }

    if (!searchMcp) return;

    // 3. Attach to Agent
    if (!currentAgent.mcp_servers?.some((ref) => ref.id === searchMcp!.id)) {
      // Construct new list
      const currentIds = currentAgent.mcp_servers?.map((s) => s.id) || [];
      const newIds = [...currentIds, searchMcp.id];

      try {
        await updateAgent({ ...currentAgent, mcp_server_ids: newIds });
      } catch (e) {
        console.error("Failed to attach Web Search:", e);
      }
    }
  }, [
    currentAgent,
    mcpServers,
    builtinMcpServers,
    fetchBuiltinMcpServers,
    quickAddBuiltinServer,
    updateAgent,
  ]);

  // Disconnect Web Search MCP
  const disconnectSearchMcp = useCallback(async () => {
    if (!currentAgent) return;

    const searchMcp = mcpServers.find((s) => s.name.includes("Web Search"));
    if (!searchMcp) return;

    // Only remove if it is currently connected
    if (currentAgent.mcp_servers?.some((ref) => ref.id === searchMcp.id)) {
      const newIds =
        currentAgent.mcp_servers
          ?.map((s) => s.id)
          .filter((id) => id !== searchMcp.id) || [];

      try {
        await updateAgent({ ...currentAgent, mcp_server_ids: newIds });
      } catch (e) {
        console.error("Failed to disconnect Web Search:", e);
      }
    }
  }, [currentAgent, mcpServers, updateAgent]);

  // Fetch current session's built-in search enabled status
  useEffect(() => {
    if (!activeChatChannel) {
      return;
    }

    const channel = channels[activeChatChannel];
    if (!channel?.sessionId) {
      return;
    }

    // Fetch search method from session config
    if (channel.google_search_enabled) {
      setSearchMethod("builtin");
    } else {
      // Check if Search MCP is connected
      // We need to check the agent's MCP servers, which we can access via currentAgent
      // But currentAgent is derived from activeChatChannel, so it should be available/consistent
      // We need to look at currentAgent (from useMemo) instead of just mcpServers (which updates separately?)
      // Actually currentAgent is stable enough.
      // Let's us allAgents or currentAgent to be safe.

      const agent = agents.find((a) => a.id === channel.agentId);
      const hasSearchMcp = agent?.mcp_servers?.some((s) => {
        // We need to find the name of the server by ID, because mcp_servers on agent only has ID/name snapshot
        // The snapshot name might be enough.
        return s.name?.includes("Web Search");
      });

      if (hasSearchMcp) {
        setSearchMethod("searxng");
      } else {
        setSearchMethod("none");
      }
    }
  }, [activeChatChannel, channels, agents]);

  // Model change handler - updates session's provider and model
  const handleModelChange = useCallback(
    async (providerId: string, model: string) => {
      if (!activeChatChannel) return;

      const channel = channels[activeChatChannel];
      if (!channel?.sessionId) return;

      try {
        await updateSessionProviderAndModel(
          channel.sessionId,
          providerId,
          model,
        );
        console.log(
          `Updated session ${channel.sessionId} to provider ${providerId} and model ${model}`,
        );
      } catch (error) {
        console.error("Failed to update session provider/model:", error);
      }
    },
    [activeChatChannel, channels, updateSessionProviderAndModel],
  );

  // Search method change handler
  const handleSearchMethodChange = useCallback(
    async (method: SearchMethod) => {
      if (!activeChatChannel) return;

      const channel = channels[activeChatChannel];
      if (!channel?.sessionId) return;

      try {
        // Update google_search_enabled based on method
        const enabled = method === "builtin";

        // 1. Update session config for built-in search
        if (channel.google_search_enabled !== enabled) {
          await updateSessionConfig(channel.sessionId, {
            google_search_enabled: enabled,
          });
        }

        // 2. Handle MCP binding
        if (method === "searxng") {
          // Enable MCP
          await connectSearchMcp();
        } else {
          // Disable MCP (for both 'builtin' and 'none')
          // Only disconnect if we are switching FROM searxng or if it's currently connected.
          // The disconnectSearchMcp checks if connected, so it's safe to call.
          await disconnectSearchMcp();
        }

        setSearchMethod(method);
        console.log(
          `Updated session ${channel.sessionId} search method to ${method}`,
        );
      } catch (error) {
        console.error("Failed to update search method:", error);
      }
    },
    [
      activeChatChannel,
      channels,
      updateSessionConfig,
      connectSearchMcp,
      disconnectSearchMcp,
    ],
  );

  // Auto-switch from builtin search to searxng when non-search MCPs are added
  // This handles the case when MCPs are added via agent modals (AddAgentModal, EditAgentModal)
  useEffect(() => {
    if (!activeChatChannel || !currentMcpInfo) return;

    // Check if there are any non-search MCPs connected
    const hasNonSearchMcp = currentMcpInfo.servers.some(
      (s) => !s.name.includes("Web Search"),
    );

    // If builtin search is enabled and non-search MCPs are connected, auto-switch to searxng
    if (searchMethod === "builtin" && hasNonSearchMcp) {
      handleSearchMethodChange("searxng");
    }
  }, [
    activeChatChannel,
    currentMcpInfo,
    searchMethod,
    handleSearchMethodChange,
  ]);

  // Handle MCP conflict when switching to builtin search
  const handleMcpConflict = useCallback(() => {
    console.warn("MCP tools will be disabled when using builtin search");
    // TODO: Show toast notification about MCP being disabled
  }, []);

  // Check if current model supports web search
  const supportsWebSearch = useMemo(() => {
    if (!currentSessionModel || !currentSessionProvider) return false;

    // Find the model info from availableModels (it's a Record<string, ModelInfo[]>)
    const providerModels = Object.values(availableModels).flat();
    const modelInfo = providerModels.find(
      (m: ModelInfo) => m.key === currentSessionModel,
    );

    return modelInfo?.supports_web_search || false;
  }, [currentSessionModel, currentSessionProvider, availableModels]);

  // Setup dnd sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 0,
      },
    }),
  );

  const handleNewChat = async () => {
    if (isCreatingNewChat) return; // Prevent multiple clicks

    try {
      setIsCreatingNewChat(true);
      await createDefaultChannel(currentAgent?.id);
    } catch (error) {
      console.error("Failed to create new chat:", error);
    } finally {
      setIsCreatingNewChat(false);
    }
  };

  // const handleToggleToolCallConfirmation = async () => {
  //   if (!activeChatChannel) return;

  //   const channel = channels[activeChatChannel];
  //   if (!channel?.agentId) return;

  //   const agent = agents.find((a) => a.id === channel.agentId);
  //   if (!agent) return;

  //   try {
  //     // Update agent with new confirmation setting
  //     const updatedAgent = {
  //       ...agent,
  //       require_tool_confirmation: !agent.require_tool_confirmation,
  //     };

  //     await updateAgent(updatedAgent);
  //     console.log(
  //       `Tool call confirmation ${updatedAgent.require_tool_confirmation ? "enabled" : "disabled"} for agent ${agent.name}`,
  //     );
  //   } catch (error) {
  //     console.error("Failed to update tool call confirmation setting:", error);
  //   }
  // };

  // Handle drag start
  const handleDragStart = () => {
    initialHeightRef.current = inputHeight;
    dragDeltaRef.current = 0;
  };

  // Handle drag move
  const handleDragMove = (event: DragMoveEvent) => {
    const { delta } = event;
    dragDeltaRef.current = delta.y;
    const newHeight = Math.max(60, initialHeightRef.current - delta.y);
    setInputHeight(newHeight);

    // Save height and notify parent
    localStorage.setItem("chatInputHeight", newHeight.toString());
    onHeightChange?.(newHeight);
  };

  // Handle drag end
  const handleDragEnd = (_: DragEndEvent) => {
    const finalHeight = Math.max(
      60,
      initialHeightRef.current - dragDeltaRef.current,
    );
    setInputHeight(finalHeight);
    localStorage.setItem("chatInputHeight", finalHeight.toString());
    onHeightChange?.(finalHeight);
    dragDeltaRef.current = 0;
  };

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

        {/* File Upload Preview - Show above toolbar when files are present */}
        {uploadedFiles.length > 0 && (
          <FileUploadPreview className="border-b border-neutral-200 dark:border-neutral-800" />
        )}
        {/* Mobile More Menu */}
        {activeChatChannel && (
          <MobileMoreMenu
            isOpen={showMoreMenu}
            searchMethod={searchMethod}
            onSearchMethodChange={handleSearchMethodChange}
            supportsWebSearch={supportsWebSearch}
            mcpEnabled={!!currentMcpInfo?.servers.length}
            onMcpConflict={handleMcpConflict}
            isKnowledgeConnected={!!isKnowledgeMcpConnected}
            onConnectKnowledge={handleConnectKnowledge}
            onDisconnectKnowledge={handleDisconnectKnowledge}
            mcpInfo={currentMcpInfo}
            onClose={() => setShowMoreMenu(false)}
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

              {/* Tool Call Confirmation Toggle */}
              {/* {activeChatChannel && (
              <button
                onClick={handleToggleToolCallConfirmation}
                className={`flex items-center justify-center rounded-sm p-1.5 transition-colors ${
                  requireToolCallConfirmation
                    ? "bg-indigo-100 text-indigo-600 hover:bg-indigo-200/60 dark:bg-indigo-900/50 dark:text-indigo-400 dark:hover:bg-indigo-800/60"
                    : "text-neutral-500 hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-300"
                }`}
                title={
                  requireToolCallConfirmation
                    ? "工具调用需要确认（开启）"
                    : "工具调用需要确认（关闭）"
                }
              >
                <ShieldCheckIcon className="h-4 w-4" />
              </button>
            )} */}

              {/* Model Selector */}
              {activeChatChannel && currentAgent && (
                <ModelSelector
                  currentAgent={currentAgent}
                  currentSessionProvider={currentSessionProvider}
                  currentSessionModel={currentSessionModel}
                  llmProviders={llmProviders}
                  availableModels={availableModels}
                  onModelChange={handleModelChange}
                />
              )}

              {/* Desktop View: Expanded Items */}
              <div className="hidden md:flex items-center space-x-1">
                {/* Search Method Selector */}
                {activeChatChannel && (
                  <SearchMethodSelector
                    method={searchMethod}
                    onMethodChange={handleSearchMethodChange}
                    supportsBuiltinSearch={supportsWebSearch}
                    mcpEnabled={!!currentMcpInfo?.servers.length}
                    onMcpConflict={handleMcpConflict}
                  />
                )}

                {/* Knowledge Selector */}
                {activeChatChannel && (
                  <KnowledgeSelector
                    isConnected={!!isKnowledgeMcpConnected}
                    onConnect={handleConnectKnowledge}
                    onDisconnect={handleDisconnectKnowledge}
                  />
                )}

                {/* MCP Tool Button */}
                {currentMcpInfo && (
                  <McpToolsButton
                    mcpInfo={currentMcpInfo}
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

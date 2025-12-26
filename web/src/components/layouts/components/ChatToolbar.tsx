"use client";

import McpIcon from "@/assets/McpIcon";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/animate-ui/components/animate/tooltip";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/animate-ui/components/radix/sheet";
import { FileUploadButton, FileUploadPreview } from "@/components/features";
import { cn } from "@/lib/utils";
import { useXyzen } from "@/store";
import type { ModelInfo } from "@/types/llmProvider";
import {
  type DragEndEvent,
  type DragMoveEvent,
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  ArrowPathIcon,
  ClockIcon,
  EllipsisHorizontalIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KnowledgeSelector } from "./KnowledgeSelector";
import { ModelSelector } from "./ModelSelector";
import {
  SearchMethodSelector,
  type SearchMethod,
} from "./SearchMethodSelector";
import SessionHistory from "./SessionHistory";

interface ChatToolbarProps {
  onShowHistory: () => void;
  onHeightChange?: (height: number) => void;
  showHistory: boolean;
  handleCloseHistory: () => void;
  handleSelectTopic: (topic: string) => void;
}

// Draggable resize handle component
const ResizeHandle = () => {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: "resize-handle",
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="absolute -top-1 left-0 right-0 h-1 cursor-ns-resize transition-colors hover:bg-indigo-600"
      title="拖动调整输入框高度"
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
    llmProviders,
    availableModels,
    updateSessionProviderAndModel,
    updateSessionConfig,
    uploadedFiles,
    isUploading,
    builtinMcpServers,
    fetchBuiltinMcpServers,
    quickAddBuiltinServer,
    updateAgent,
  } = useXyzen();

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

        <AnimatePresence>
          {showMoreMenu && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-full left-0 right-0 mx-2 mb-2 z-50 rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-900 p-1.5"
            >
              <div className="flex flex-col gap-1">
                {/* Search Method Selector */}
                {activeChatChannel && (
                  <div className="w-full">
                    <SearchMethodSelector
                      method={searchMethod}
                      onMethodChange={(method) => {
                        handleSearchMethodChange(method);
                        setShowMoreMenu(false);
                      }}
                      supportsBuiltinSearch={supportsWebSearch}
                      mcpEnabled={!!currentMcpInfo?.servers.length}
                      onMcpConflict={handleMcpConflict}
                    />
                  </div>
                )}

                {/* Knowledge Selector */}
                {activeChatChannel && (
                  <div className="w-full">
                    <KnowledgeSelector
                      isConnected={!!isKnowledgeMcpConnected}
                      onConnect={() => {
                        handleConnectKnowledge();
                        setShowMoreMenu(false);
                      }}
                      onDisconnect={() => {
                        handleDisconnectKnowledge();
                        setShowMoreMenu(false);
                      }}
                    />
                  </div>
                )}

                {/* MCP Tool Info */}
                {currentMcpInfo && (
                  <div className="w-full px-2.5 py-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
                    <div className="flex items-center justify-between text-xs font-medium text-neutral-600 dark:text-neutral-400">
                      <div className="flex items-center gap-1.5">
                        <McpIcon className="h-3.5 w-3.5" />
                        <span>MCP 工具</span>
                      </div>
                      {currentMcpInfo.servers.length > 0 && (
                        <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">
                          {currentMcpInfo.servers.reduce(
                            (total, server) =>
                              total + (server.tools?.length || 0),
                            0,
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <TooltipProvider>
          <div className="flex flex-wrap items-center justify-between bg-white px-2 py-1.5 dark:bg-black dark:border-t dark:border-neutral-800 gap-2">
            <div className="flex flex-wrap items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleNewChat}
                    disabled={isCreatingNewChat}
                    className={toolbarButtonClass}
                  >
                    {isCreatingNewChat ? (
                      <ArrowPathIcon className="h-5 w-5 animate-spin" />
                    ) : (
                      <PlusIcon className="h-5 w-5" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isCreatingNewChat ? "创建中..." : "新对话"}</p>
                </TooltipContent>
              </Tooltip>

              {/* File Upload Button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="inline-flex">
                    <FileUploadButton
                      disabled={isUploading}
                      className={toolbarButtonClass}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>上传文件</p>
                </TooltipContent>
              </Tooltip>

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
                  <div className="relative group/mcp w-fit">
                    <button
                      className={cn(toolbarButtonClass, "w-auto px-2 gap-1.5")}
                      title="当前连接的MCP工具"
                    >
                      <McpIcon className="h-4 w-4" />
                      {currentMcpInfo.servers.length > 0 && (
                        <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">
                          {currentMcpInfo.servers.reduce(
                            (total, server) =>
                              total + (server.tools?.length || 0),
                            0,
                          )}
                        </span>
                      )}
                    </button>

                    {/* MCP Tooltip */}
                    <div
                      className=" transition-opacity
                  overflow-hidden hidden w-80
                  group-hover/mcp:block absolute bottom-full
                  left-0 mb-2 rounded-sm border
                 border-neutral-200 bg-white p-3 shadow-lg
                  dark:border-neutral-700 dark:bg-neutral-800 z-50"
                    >
                      <div className="mb-2">
                        <div className="flex items-center space-x-2">
                          <McpIcon className="h-4 w-4 text-indigo-500" />
                          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                            MCP 工具连接
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                          助手: {currentMcpInfo.agent.name}
                        </div>
                      </div>

                      <div className="space-y-2">
                        {currentMcpInfo.servers.map((server) => (
                          <div
                            key={server.id}
                            className="rounded-sm bg-neutral-50 p-2
                         dark:bg-neutral-700/50"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <div
                                  className={`h-2 w-2 rounded-full ${
                                    server.status === "online"
                                      ? "bg-green-500"
                                      : "bg-red-500"
                                  }`}
                                />
                                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                                  {server.name}
                                </span>
                              </div>
                              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                {server.tools?.length || 0} 工具
                              </span>
                            </div>

                            {server.tools && server.tools.length > 0 && (
                              <div className="mt-2">
                                <div className="flex flex-wrap gap-1">
                                  {server.tools
                                    .slice(0, 5)
                                    .map((tool, index) => (
                                      <span
                                        key={index}
                                        className="inline-block rounded bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                                      >
                                        {tool.name}
                                      </span>
                                    ))}
                                  {server.tools.length > 5 && (
                                    <span className="inline-block rounded bg-neutral-200 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-600 dark:text-neutral-300">
                                      +{server.tools.length - 5}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Arrow */}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-white dark:border-t-neutral-800"></div>
                    </div>
                  </div>
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
              <Sheet
                open={showHistory}
                onOpenChange={(open) => {
                  if (open) {
                    onShowHistory();
                  } else {
                    handleCloseHistory();
                  }
                }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SheetTrigger asChild>
                      <button className={toolbarButtonClass}>
                        <ClockIcon className="h-5 w-5" />
                      </button>
                    </SheetTrigger>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>历史记录</p>
                  </TooltipContent>
                </Tooltip>
                <SheetContent
                  showCloseButton={false}
                  side="right"
                  className="w-11/12 max-w-md p-0 h-full"
                >
                  <VisuallyHidden>
                    <SheetTitle>会话历史</SheetTitle>
                    <SheetDescription>当前会话的对话主题</SheetDescription>
                  </VisuallyHidden>
                  <SessionHistory
                    isOpen={showHistory}
                    onClose={handleCloseHistory}
                    onSelectTopic={handleSelectTopic}
                  />
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </TooltipProvider>
      </div>
    </DndContext>
  );
}

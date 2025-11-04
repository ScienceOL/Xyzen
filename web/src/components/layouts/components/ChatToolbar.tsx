"use client";

import McpIcon from "@/assets/McpIcon";
import { useXyzen } from "@/store";
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
  ClockIcon,
  PlusIcon,
  ShieldCheckIcon,
  CpuChipIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { getProviderColor } from "@/utils/providerColors";
import { getProviderSourceDescription } from "@/utils/providerPreferences";

interface ChatToolbarProps {
  onShowHistory: () => void;
  onHeightChange?: (height: number) => void;
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
}: ChatToolbarProps) {
  const {
    createDefaultChannel,
    activeChatChannel,
    channels,
    agents,
    mcpServers,
    updateAgent,
    updateAgentProvider,
    llmProviders,
    resolveProviderForAgent,
    userDefaultProviderId,
    setUserDefaultProvider,
  } = useXyzen();

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

    const agent = agents.find((a) => a.id === channel.agentId);
    if (!agent?.mcp_servers?.length) return null;

    const connectedServers = mcpServers.filter((server) =>
      agent.mcp_servers?.some((mcpRef) => mcpRef.id === server.id),
    );

    return {
      agent,
      servers: connectedServers,
    };
  }, [activeChatChannel, channels, agents, mcpServers]);

  // Get current agent's tool call confirmation setting
  const requireToolCallConfirmation = useMemo(() => {
    if (!activeChatChannel) return false;
    const channel = channels[activeChatChannel];
    if (!channel?.agentId) return false;
    const agent = agents.find((a) => a.id === channel.agentId);
    return agent?.require_tool_confirmation || false;
  }, [activeChatChannel, channels, agents]);

  // Get current agent
  const currentAgent = useMemo(() => {
    if (!activeChatChannel) return null;
    const channel = channels[activeChatChannel];
    if (!channel?.agentId) return null;
    return agents.find((a) => a.id === channel.agentId) || null;
  }, [activeChatChannel, channels, agents]);

  // Get current agent's provider using centralized resolution logic
  const currentProvider = useMemo(() => {
    return resolveProviderForAgent(currentAgent);
  }, [currentAgent, resolveProviderForAgent]);

  // Refs for drag handling
  const initialHeightRef = useRef(inputHeight);
  const dragDeltaRef = useRef(0);

  // Provider change handler
  const handleProviderChange = useCallback(
    async (providerId: string | null) => {
      if (!currentAgent) return;

      try {
        await updateAgentProvider(currentAgent.id, providerId);
        console.log(
          `Updated agent ${currentAgent.name} provider to ${providerId || "default"}`,
        );
      } catch (error) {
        console.error("Failed to update agent provider:", error);
      }
    },
    [currentAgent, updateAgentProvider],
  );

  // Auto-assign provider to agent if needed
  useEffect(() => {
    if (!currentAgent || currentAgent.provider_id) return;

    // Only auto-assign if agent has no provider and we have a clear resolution
    const resolvedProvider = resolveProviderForAgent(currentAgent);
    if (resolvedProvider) {
      // Only auto-assign system provider if no user providers exist
      if (resolvedProvider.is_system) {
        const userProviders = llmProviders.filter((p) => !p.is_system);
        if (userProviders.length === 0) {
          handleProviderChange(resolvedProvider.id);
        }
      }
      // Auto-assign user's local default if available
      else if (resolvedProvider.id === userDefaultProviderId) {
        handleProviderChange(resolvedProvider.id);
      }
    }
  }, [
    currentAgent,
    llmProviders,
    userDefaultProviderId,
    resolveProviderForAgent,
    handleProviderChange,
  ]);

  // Setup dnd sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 0,
      },
    }),
  );

  const handleNewChat = () => {
    createDefaultChannel();
  };

  const handleToggleToolCallConfirmation = async () => {
    if (!activeChatChannel) return;

    const channel = channels[activeChatChannel];
    if (!channel?.agentId) return;

    const agent = agents.find((a) => a.id === channel.agentId);
    if (!agent) return;

    try {
      // Update agent with new confirmation setting
      const updatedAgent = {
        ...agent,
        require_tool_confirmation: !agent.require_tool_confirmation,
      };

      await updateAgent(updatedAgent);
      console.log(
        `Tool call confirmation ${updatedAgent.require_tool_confirmation ? "enabled" : "disabled"} for agent ${agent.name}`,
      );
    } catch (error) {
      console.error("Failed to update tool call confirmation setting:", error);
    }
  };

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

        <div className="flex items-center justify-between bg-white px-2 py-1.5 dark:bg-black dark:border-t dark:border-neutral-800">
          <div className="flex items-center space-x-1">
            <button
              onClick={handleNewChat}
              className="flex items-center justify-center rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-300"
              title="新对话"
            >
              <PlusIcon className="h-4 w-4" />
            </button>

            {/* Tool Call Confirmation Toggle */}
            {activeChatChannel && (
              <button
                onClick={handleToggleToolCallConfirmation}
                className={`flex items-center justify-center rounded-md p-1.5 transition-colors ${
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
            )}

            {/* Provider Selector */}
            {activeChatChannel && currentAgent && (
              <div className="relative group/provider">
                {llmProviders.length > 0 ? (
                  <>
                    <button
                      className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                        currentProvider
                          ? `${getProviderColor(true).bg} ${getProviderColor(true).text}`
                          : `${getProviderColor(false).bg} ${getProviderColor(false).text}`
                      } hover:opacity-80`}
                      title={
                        currentProvider
                          ? `${currentProvider.name} (${currentProvider.model})`
                          : "选择提供商"
                      }
                    >
                      <CpuChipIcon
                        className={`h-4 w-4 ${currentProvider ? getProviderColor(true).icon : getProviderColor(false).icon}`}
                      />
                      <span>{currentProvider?.name || "选择提供商"}</span>
                      <span className="text-[10px] opacity-70">
                        (
                        {getProviderSourceDescription(
                          currentAgent,
                          currentProvider,
                          llmProviders,
                        )}
                        )
                      </span>
                    </button>

                    {/* Provider Dropdown */}
                    <div className="hidden group-hover/provider:block absolute bottom-full left-0 mb-2 w-64 rounded-lg border border-neutral-200 bg-white p-2 shadow-lg dark:border-neutral-700 dark:bg-neutral-800 z-50">
                      <div className="mb-2 px-2 py-1 border-b border-neutral-200 dark:border-neutral-700 pb-2">
                        <div className="text-xs font-medium text-neutral-900 dark:text-neutral-100">
                          选择LLM提供商
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">
                          当前助手: {currentAgent.name}
                        </div>
                      </div>

                      <div className="space-y-1 max-h-80 overflow-y-auto">
                        {/* Show all providers (system + user-added) */}
                        {llmProviders.map((provider) => {
                          const isSelected =
                            currentAgent.provider_id === provider.id;

                          return (
                            <button
                              key={provider.id}
                              onClick={() => handleProviderChange(provider.id)}
                              className={`w-full rounded-md px-2 py-2 text-left text-sm transition-colors relative ${
                                isSelected
                                  ? `${getProviderColor(true).bg} ${getProviderColor(true).text}`
                                  : `${getProviderColor(false).text} hover:bg-neutral-100 dark:hover:bg-neutral-700/50`
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="font-medium flex items-center gap-2">
                                    {provider.name}
                                    {provider.is_system && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400">
                                        系统
                                      </span>
                                    )}
                                    {userDefaultProviderId === provider.id &&
                                      !provider.is_system && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                                          全局默认
                                        </span>
                                      )}
                                  </div>
                                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                                    {provider.provider_type} • {provider.model}
                                  </div>
                                </div>
                                {isSelected && (
                                  <CheckIcon
                                    className={`h-4 w-4 ${getProviderColor(true).icon}`}
                                  />
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Global Default Management */}
                      <div className="border-t border-neutral-200 dark:border-neutral-700 pt-2 mt-2">
                        <div className="text-xs font-medium text-neutral-900 dark:text-neutral-100 mb-2 px-2">
                          全局默认提供商
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-2 px-2">
                          未指定提供商的助手将使用此设置
                        </div>
                        <div className="space-y-1">
                          <button
                            onClick={() => setUserDefaultProvider(null)}
                            className={`w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                              !userDefaultProviderId
                                ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400"
                                : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700/50"
                            }`}
                          >
                            自动选择 (系统提供商优先)
                          </button>
                          {llmProviders
                            .filter((p) => !p.is_system)
                            .map((provider) => (
                              <button
                                key={`default-${provider.id}`}
                                onClick={() =>
                                  setUserDefaultProvider(provider.id)
                                }
                                className={`w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                                  userDefaultProviderId === provider.id
                                    ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400"
                                    : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700/50"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span>{provider.name}</span>
                                  {userDefaultProviderId === provider.id && (
                                    <CheckIcon className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                                  )}
                                </div>
                              </button>
                            ))}
                        </div>
                      </div>

                      {/* Arrow */}
                      <div className="absolute top-full left-4 border-4 border-transparent border-t-white dark:border-t-neutral-800"></div>
                    </div>
                  </>
                ) : (
                  <button
                    className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-300"
                    title="请先添加LLM提供商"
                  >
                    <CpuChipIcon className="h-4 w-4" />
                    <span>未设置提供商</span>
                  </button>
                )}
              </div>
            )}

            {/* MCP Tool Button */}
            {currentMcpInfo && (
              <div className="relative group/mcp w-fit">
                <button
                  className="flex items-center w-fit justify-center rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-300"
                  title="当前连接的MCP工具"
                >
                  <McpIcon className="h-4 w-4" />
                  {currentMcpInfo.servers.length > 0 && (
                    <span className="ml-1 rounded-full bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">
                      {currentMcpInfo.servers.reduce(
                        (total, server) => total + (server.tools?.length || 0),
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
                  left-0 mb-2 rounded-lg border
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
                        className="rounded-md bg-neutral-50 p-2
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
                              {server.tools.slice(0, 5).map((tool, index) => (
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
          <button
            onClick={onShowHistory}
            className="flex items-center justify-center rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-300"
            title="历史记录"
          >
            <ClockIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </DndContext>
  );
}

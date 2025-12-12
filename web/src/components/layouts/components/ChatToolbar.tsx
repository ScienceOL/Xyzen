"use client";

import McpIcon from "@/assets/McpIcon";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/animate-ui/components/radix/sheet";
import { FileUploadButton, FileUploadPreview } from "@/components/features";
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
import { ClockIcon, PlusIcon } from "@heroicons/react/24/outline";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useCallback, useMemo, useRef, useState } from "react";
import SessionHistory from "./SessionHistory";
import { ModelSelector } from "./ModelSelector";

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
    systemAgents,
    mcpServers,
    llmProviders,
    availableModels,
    updateSessionProviderAndModel,
    uploadedFiles,
    isUploading,
  } = useXyzen();

  // Merge system and user agents for lookup (system + regular/graph)
  const allAgents = useMemo(() => {
    // Prefer unique by id; user agents shouldn't duplicate system ids, but guard anyway
    const map = new Map<string, (typeof agents)[number]>();
    systemAgents.forEach((a) => map.set(a.id, a));
    agents.forEach((a) => map.set(a.id, a));
    return Array.from(map.values());
  }, [agents, systemAgents]);

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

  // Refs for drag handling
  const initialHeightRef = useRef(inputHeight);
  const dragDeltaRef = useRef(0);

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

  // Setup dnd sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 0,
      },
    }),
  );

  const handleNewChat = () => {
    createDefaultChannel(currentAgent?.id);
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

        <div className="flex items-center justify-between bg-white px-2 py-1.5 dark:bg-black dark:border-t dark:border-neutral-800">
          <div className="flex items-center space-x-1">
            <button
              onClick={handleNewChat}
              className="flex items-center justify-center rounded-sm p-1.5 text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-300"
              title="新对话"
            >
              <PlusIcon className="h-4 w-4" />
            </button>

            {/* File Upload Button */}
            <FileUploadButton disabled={isUploading} className="rounded-sm" />

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

            {/* MCP Tool Button */}
            {currentMcpInfo && (
              <div className="relative group/mcp w-fit">
                <button
                  className="flex items-center w-fit justify-center rounded-sm p-1.5 text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-300"
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
              <SheetTrigger asChild>
                <button
                  className="flex items-center justify-center rounded-sm p-1.5 text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-300"
                  title="历史记录"
                >
                  <ClockIcon className="h-4 w-4" />
                </button>
              </SheetTrigger>
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
                  context="chat"
                  isOpen={showHistory}
                  onClose={handleCloseHistory}
                  onSelectTopic={handleSelectTopic}
                />
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </DndContext>
  );
}

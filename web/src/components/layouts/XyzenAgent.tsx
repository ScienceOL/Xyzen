"use client";
import McpIcon from "@/assets/McpIcon";
import { Badge } from "@/components/base/Badge";
import { PencilIcon, TrashIcon } from "@heroicons/react/24/outline";
import { motion, type Variants } from "framer-motion";
import React, { useEffect, useRef, useState } from "react";

import AddAgentModal from "@/components/modals/AddAgentModal";
import ConfirmationModal from "@/components/modals/ConfirmationModal";
import EditAgentModal from "@/components/modals/EditAgentModal";
import { useXyzen } from "@/store";

// Import types from separate file
import type { Agent } from "@/types/agents";

interface AgentCardProps {
  agent: Agent;
  onClick?: (agent: Agent) => void;
  onEdit?: (agent: Agent) => void;
  onDelete?: (agent: Agent) => void;
  hiddenGraphAgentIds?: string[];
}

// 定义动画变体
const itemVariants: Variants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 12,
    },
  },
};

// 右键菜单组件
interface ContextMenuProps {
  x: number;
  y: number;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
  isDefaultAgent?: boolean;
  agent?: Agent;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  onEdit,
  onDelete,
  onClose,
  isDefaultAgent = false,
  agent,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.1 }}
      className="fixed z-50 w-48 rounded-sm border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
      style={{ left: x, top: y }}
    >
      {isDefaultAgent ? (
        <div className="px-4 py-3 text-center">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            默认助手不可编辑
          </p>
        </div>
      ) : (
        <>
          <button
            onClick={() => {
              onEdit();
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-t-lg px-4 py-2.5 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            <PencilIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            编辑助手
          </button>
          <button
            onClick={() => {
              onDelete();
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-b-lg px-4 py-2.5 text-left text-sm text-neutral-700 transition-colors hover:bg-red-50 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            <TrashIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
            {agent?.agent_type === "graph" ? "移除助手" : "删除助手"}
          </button>
        </>
      )}
    </motion.div>
  );
};

// 详细版本-包括名字，描述，头像，标签以及GPT模型
const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  onClick,
  onEdit,
  onDelete,
  hiddenGraphAgentIds = [],
}) => {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Treat the two built-in system agents as non-editable defaults
  const isDefaultSystemAgent =
    agent.id === "00000000-0000-0000-0000-000000000001" ||
    agent.id === "00000000-0000-0000-0000-000000000002" ||
    agent.agent_type === "builtin" ||
    agent.agent_type === "system";

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
    });
  };

  return (
    <>
      <motion.div
        layout
        variants={itemVariants}
        whileHover={{ scale: 1.03, transition: { duration: 0.2 } }}
        whileTap={{ scale: 0.98 }}
        onClick={() => onClick?.(agent)}
        onContextMenu={handleContextMenu}
        className={`
        group relative flex cursor-pointer items-start gap-4 rounded-sm border p-3
        border-neutral-200 bg-white hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800/60
        ${agent.id === "default-chat" ? "select-none" : ""}
      `}
      >
        {/* 头像 */}
        <img
          src={
            agent.avatar ||
            (agent.agent_type === "builtin"
              ? agent.id === "00000000-0000-0000-0000-000000000001"
                ? "/defaults/agents/avatar1.png" // Chat agent fallback
                : "/defaults/agents/avatar4.png" // Workshop agent fallback
              : "/defaults/agents/avatar2.png") // Regular agent fallback
          }
          alt={agent.name}
          className="h-10 w-10 flex-shrink-0 rounded-full border border-neutral-200 object-cover dark:border-neutral-700"
        />

        {/* 内容 */}
        <div className="flex flex-1 flex-col min-w-0">
          <div className="flex items-center gap-2">
            <h3
              className="text-sm font-semibold text-neutral-800 dark:text-white truncate flex-shrink"
              title={agent.name}
            >
              {agent.name}
            </h3>

            {/* Agent type badge */}
            {/*{agent.agent_type === "graph" && (
              <Badge
                variant="blue"
                className="flex items-center gap-1 flex-shrink-0"
              >
                📊 {agent.node_count || 0} nodes
              </Badge>
            )}*/}

            {/* Graph agent sidebar status badge */}
            {agent.agent_type === "graph" &&
              !hiddenGraphAgentIds.includes(agent.id) && (
                <Badge
                  variant="green"
                  className="flex items-center gap-1 flex-shrink-0"
                >
                  ✓ Added
                </Badge>
              )}

            {/* MCP servers badge */}
            {agent.mcp_servers && agent.mcp_servers.length > 0 && (
              <Badge
                variant="blue"
                className="flex items-center gap-1 flex-shrink-0"
              >
                <McpIcon className="h-3 w-3" />
                {agent.mcp_servers.length}
              </Badge>
            )}
          </div>

          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2">
            {agent.description}
          </p>
        </div>
      </motion.div>

      {/* 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onEdit={() => onEdit?.(agent)}
          onDelete={() => onDelete?.(agent)}
          onClose={() => setContextMenu(null)}
          isDefaultAgent={isDefaultSystemAgent}
          agent={agent}
        />
      )}
    </>
  );
};

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

interface XyzenAgentProps {
  systemAgentType?: "chat" | "workshop" | "all";
}

export default function XyzenAgent({
  systemAgentType = "all",
}: XyzenAgentProps) {
  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [isConfirmModalOpen, setConfirmModalOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);
  const {
    agents,
    systemAgents,
    fetchAgents,
    fetchSystemAgents,
    createDefaultChannel,
    deleteAgent,
    removeGraphAgentFromSidebar,
    chatHistory,
    channels,
    activateChannel,
    hiddenGraphAgentIds,
    fetchMcpServers,
  } = useXyzen();

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Ensure MCP servers are loaded first, then fetch system agents
  useEffect(() => {
    const loadAgentsWithMcps = async () => {
      try {
        // First, load MCP servers
        await fetchMcpServers();
        // Then load system agents
        await fetchSystemAgents();
      } catch (error) {
        console.error("Failed to load agents with MCPs:", error);
      }
    };

    loadAgentsWithMcps();
  }, [fetchMcpServers, fetchSystemAgents]);

  const handleAgentClick = async (agent: Agent) => {
    // 使用实际的 agent ID（系统助手和普通助手都有真实的 ID）
    const agentId = agent.id;

    // Debug: Log agent MCP server info
    if (agent.agent_type === "builtin" || agent.agent_type === "system") {
      console.log(`System agent clicked: ${agent.name} (${agentId})`);
      console.log(
        `  - MCP servers attached: ${agent.mcp_servers?.length || 0}`,
      );
      if (agent.mcp_servers?.length) {
        console.log(
          `  - MCP server IDs:`,
          agent.mcp_servers.map((s) => s.id),
        );
      }
    }

    // 1. 从 chatHistory 中找到该 agent 的所有 topics
    const agentTopics = chatHistory.filter((topic) => {
      const channel = channels[topic.id];
      if (!channel) return false;

      // 严格匹配 agentId
      return channel.agentId === agentId;
    });

    // 2. 找到最近的空 topic（消息数 <= 1，只有系统消息或完全为空）
    const emptyTopic = agentTopics
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .find((topic) => {
        const channel = channels[topic.id];
        if (!channel) return false;

        // 检查消息数量：0条消息或只有1条系统消息算作"空对话"
        const userMessages = channel.messages.filter(
          (msg) => msg.role === "user" || msg.role === "assistant",
        );
        return userMessages.length === 0;
      });

    // 3. 如果有空 topic 就复用，否则创建新的
    if (emptyTopic) {
      console.log(`复用现有空对话: ${emptyTopic.id} for agent: ${agentId}`);
      await activateChannel(emptyTopic.id);
    } else {
      console.log(`创建新对话 for agent: ${agentId}`);
      await createDefaultChannel(agentId);
    }
  };

  const handleEditClick = (agent: Agent) => {
    setEditingAgent(agent);
    setEditModalOpen(true);
  };

  const handleDeleteClick = (agent: Agent) => {
    setAgentToDelete(agent);
    setConfirmModalOpen(true);
  };

  // 过滤系统助手基于当前面板类型
  const filteredSystemAgents = systemAgents.filter((agent) => {
    if (systemAgentType === "all") return true;
    if (systemAgentType === "chat") {
      return agent.id === "00000000-0000-0000-0000-000000000001"; // System Chat Agent
    }
    if (systemAgentType === "workshop") {
      return agent.id === "00000000-0000-0000-0000-000000000002"; // System Workshop Agent
    }
    return false;
  });

  // 合并过滤后的系统助手、用户助手和可见的图形助手
  const regularAgents = agents.filter(
    (agent) => agent.agent_type === "regular",
  );
  const visibleGraphAgents = agents.filter(
    (agent) =>
      agent.agent_type === "graph" && !hiddenGraphAgentIds.includes(agent.id),
  );
  const allAgents = [
    ...filteredSystemAgents,
    ...regularAgents,
    ...visibleGraphAgents,
  ];

  // Clean sidebar with auto-loaded MCPs for system agents

  return (
    <motion.div
      className="space-y-2 px-4 custom-scrollbar overflow-y-auto h-full"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {allAgents.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          onClick={handleAgentClick}
          onEdit={handleEditClick}
          onDelete={handleDeleteClick}
          hiddenGraphAgentIds={hiddenGraphAgentIds}
        />
      ))}
      <button
        className="w-full rounded-sm border-2 border-dashed border-neutral-300 bg-transparent py-3 text-sm font-semibold text-neutral-600 transition-colors hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/50"
        onClick={() => setAddModalOpen(true)}
      >
        + 添加助手
      </button>
      <AddAgentModal
        isOpen={isAddModalOpen}
        onClose={() => setAddModalOpen(false)}
      />
      <EditAgentModal
        isOpen={isEditModalOpen}
        onClose={() => setEditModalOpen(false)}
        agent={editingAgent}
      />
      {agentToDelete && (
        <ConfirmationModal
          isOpen={isConfirmModalOpen}
          onClose={() => setConfirmModalOpen(false)}
          onConfirm={() => {
            if (agentToDelete.agent_type === "graph") {
              // Remove graph agent from sidebar only
              removeGraphAgentFromSidebar(agentToDelete.id);
            } else {
              // Delete regular agent permanently
              deleteAgent(agentToDelete.id);
            }
            setConfirmModalOpen(false);
            setAgentToDelete(null);
          }}
          title={
            agentToDelete.agent_type === "graph"
              ? "Remove Graph Agent"
              : "Delete Agent"
          }
          message={
            agentToDelete.agent_type === "graph"
              ? `Are you sure you want to remove "${agentToDelete.name}" from the sidebar? The graph agent will still exist and can be added back later.`
              : `Are you sure you want to permanently delete the agent "${agentToDelete.name}"? This action cannot be undone.`
          }
        />
      )}
    </motion.div>
  );
}

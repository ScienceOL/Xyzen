"use client";
import McpIcon from "@/assets/McpIcon";
import { Badge } from "@/components/base/Badge";
import { PencilIcon, TrashIcon } from "@heroicons/react/24/outline";
import { motion, type Variants } from "framer-motion";
import React, { useEffect, useState } from "react";

import AddAgentModal from "@/components/modals/AddAgentModal";
import ConfirmationModal from "@/components/modals/ConfirmationModal";
import EditAgentModal from "@/components/modals/EditAgentModal";
import { useXyzen } from "@/store";

export type Agent = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  mcp_servers: { id: string }[];
  mcp_server_ids?: string[];
  user_id: string;
  require_tool_confirmation?: boolean;
  provider_id?: string | null;
};

interface AgentCardProps {
  agent: Agent;
  onClick?: (agent: Agent) => void;
  onEdit?: (agent: Agent) => void;
  onDelete?: (agent: Agent) => void;
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

// 详细版本-包括名字，描述，头像，标签以及GPT模型
const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  onClick,
  onEdit,
  onDelete,
}) => {
  return (
    <motion.div
      layout
      variants={itemVariants}
      whileHover={{ scale: 1.03, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onClick?.(agent)}
      className={`
        group relative flex cursor-pointer items-start gap-4 rounded-lg border p-3
        border-neutral-200 bg-white hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800/60
      `}
    >
      {/* 头像 */}
      <img
        src={
          agent.id === "default-chat"
            ? "https://avatars.githubusercontent.com/u/176685?v=4" // 使用一个友好的默认头像
            : "https://cdn1.deepmd.net/static/img/affb038eChatGPT Image 2025年8月6日 10_33_07.png"
        }
        alt={agent.name}
        className="h-10 w-10 rounded-full object-cover border border-neutral-200 dark:border-neutral-700"
      />

      {/* 内容 */}
      <div className="flex flex-1 flex-col">
        <div className="flex items-center">
          <h3 className="text-sm font-semibold text-neutral-800 dark:text-white">
            {agent.name}
          </h3>
          {agent.mcp_servers && agent.mcp_servers.length > 0 && (
            <Badge variant="blue" className="ml-2 flex items-center gap-1">
              <McpIcon className="h-3 w-3" />
              {agent.mcp_servers.length}
            </Badge>
          )}
        </div>

        <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2">
          {agent.description}
        </p>
      </div>

      {/* 编辑按钮 - 高度和整个条目相同，带动画效果 */}
      {agent.id !== "default-chat" && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.(agent);
            }}
            className="z-10 ml-3 flex items-center justify-center rounded-lg bg-transparent px-3 text-neutral-400 opacity-0 transition-all duration-300 ease-in-out hover:bg-neutral-100 hover:text-indigo-600 hover:shadow-md hover:scale-105 group-hover:opacity-100 group-hover:shadow-sm active:scale-95 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-indigo-400"
            style={{ alignSelf: "stretch", margin: "4px 0" }}
            title="编辑助手"
          >
            <PencilIcon className="h-5 w-5 transition-transform duration-200" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(agent);
            }}
            className="z-10 ml-1 flex items-center justify-center rounded-lg bg-transparent px-3 text-neutral-400 opacity-0 transition-all duration-300 ease-in-out hover:bg-neutral-100 hover:text-red-600 hover:shadow-md hover:scale-105 group-hover:opacity-100 group-hover:shadow-sm active:scale-95 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-red-400"
            style={{ alignSelf: "stretch", margin: "4px 0" }}
            title="删除助手"
          >
            <TrashIcon className="h-5 w-5 transition-transform duration-200" />
          </button>
        </>
      )}
    </motion.div>
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

export default function XyzenAgent() {
  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [isConfirmModalOpen, setConfirmModalOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);
  const { agents, fetchAgents, createDefaultChannel, deleteAgent } = useXyzen();

  // 默认的"随便聊聊"助手
  const defaultAgent: Agent = {
    id: "default-chat",
    name: "随便聊聊",
    description: "与AI助手自由对话，无需特定的设定或工具",
    prompt: "",
    mcp_servers: [],
    user_id: "system",
  };

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const handleAgentClick = (agent: Agent) => {
    // 如果是默认助手，不传agent_id，让后端创建一个普通的session
    if (agent.id === "default-chat") {
      createDefaultChannel();
    } else {
      createDefaultChannel(agent.id);
    }
  };

  const handleEditClick = (agent: Agent) => {
    // 默认助手不可编辑
    if (agent.id === "default-chat") {
      return;
    }
    setEditingAgent(agent);
    setEditModalOpen(true);
  };

  const handleDeleteClick = (agent: Agent) => {
    // 默认助手不可删除
    if (agent.id === "default-chat") {
      return;
    }
    setAgentToDelete(agent);
    setConfirmModalOpen(true);
  };

  // 合并默认助手和用户助手
  const allAgents = [defaultAgent, ...agents];

  return (
    <motion.div
      className="space-y-2 px-4"
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
        />
      ))}
      <button
        className="w-full rounded-lg border-2 border-dashed border-neutral-300 bg-transparent py-3 text-sm font-semibold text-neutral-600 transition-colors hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/50"
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
            deleteAgent(agentToDelete.id);
            setConfirmModalOpen(false);
            setAgentToDelete(null);
          }}
          title="Delete Agent"
          message={`Are you sure you want to delete the agent "${agentToDelete.name}"?`}
        />
      )}
    </motion.div>
  );
}

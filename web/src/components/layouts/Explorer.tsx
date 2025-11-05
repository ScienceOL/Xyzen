"use client";
import { Badge } from "@/components/base/Badge";
import { useXyzen } from "@/store";
import { PlusIcon, PlayIcon, StopIcon } from "@heroicons/react/24/outline";
import { motion, type Variants } from "framer-motion";
import React, { useEffect, useState } from "react";
import type { Agent } from "./XyzenAgent";
import type { BuiltinMcpServer } from "@/types/mcp";

// Animation variants
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

// Agent Card for Explorer
const ExplorerAgentCard: React.FC<{
  agent: Agent;
  onAddToSidebar: (agent: Agent) => void;
}> = ({ agent, onAddToSidebar }) => {
  const { hiddenGraphAgentIds } = useXyzen();
  const isInSidebar = !hiddenGraphAgentIds.includes(agent.id);

  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
      className="group relative rounded-lg border border-neutral-200 bg-white p-3 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800/60"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="text-sm font-semibold text-neutral-800 dark:text-white truncate">
              {agent.name}
            </h4>
            {agent.agent_type === "graph" && (
              <>
                {agent.is_active ? (
                  <Badge variant="green" className="flex items-center gap-1">
                    <PlayIcon className="h-3 w-3" />
                    Active
                  </Badge>
                ) : (
                  <Badge variant="yellow" className="flex items-center gap-1">
                    <StopIcon className="h-3 w-3" />
                    Building
                  </Badge>
                )}
              </>
            )}
            {agent.agent_type === "regular" && (
              <Badge variant="blue">Regular</Badge>
            )}
          </div>

          <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2 mb-2">
            {agent.description}
          </p>

          {agent.agent_type === "graph" && (
            <div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
              <span>📊 {agent.node_count || 0} nodes</span>
              <span>🔗 {agent.edge_count || 0} edges</span>
            </div>
          )}
        </div>

        {/* Add to sidebar button for graph agents */}
        {agent.agent_type === "graph" && !isInSidebar && (
          <button
            onClick={() => onAddToSidebar(agent)}
            className="opacity-0 group-hover:opacity-100 transition-opacity rounded-md p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:text-indigo-400 dark:hover:bg-indigo-900/20"
            title="Add to Sidebar"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </motion.div>
  );
};

// MCP Server Card for Explorer (display only)
const ExplorerMcpCard: React.FC<{ mcp: BuiltinMcpServer }> = ({ mcp }) => {
  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
      className="rounded-lg border border-neutral-200 bg-white p-3 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800/60"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="text-sm font-semibold text-neutral-800 dark:text-white truncate">
              {mcp.name}
            </h4>
            <Badge variant="blue" className="text-xs">
              MCP
            </Badge>
            {mcp.requires_auth && (
              <Badge variant="yellow" className="text-xs">
                Auth
              </Badge>
            )}
          </div>

          <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2 mb-2">
            {mcp.description}
          </p>

          <div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
            <span>📦 {mcp.module_name}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default function Explorer() {
  const {
    agents,
    fetchAgents,
    addGraphAgentToSidebar,
    setActivePanel,
    createDefaultChannel,
    user,
    backendUrl,
    builtinMcpServers,
    fetchBuiltinMcpServers,
  } = useXyzen();

  const [activeTab, setActiveTab] = useState<"agents" | "mcp">("agents");

  useEffect(() => {
    if (user && backendUrl) {
      fetchAgents();
      fetchBuiltinMcpServers();
    }
  }, [fetchAgents, fetchBuiltinMcpServers, user, backendUrl]);

  const handleAddToChat = async (agent: Agent) => {
    // Add graph agent to sidebar
    addGraphAgentToSidebar(agent.id);

    // Switch to Chat panel
    setActivePanel("chat");

    // Create a chat channel with this agent
    await createDefaultChannel(agent.id);
  };

  // Filter to only show graph agents
  const graphAgents = agents.filter((agent) => agent.agent_type === "graph");

  return (
    <div className="h-full flex flex-col">
      {/* Header with Tabs */}
      <div className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white mb-3">
            Explorer
          </h2>

          {/* Tab Navigation */}
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab("agents")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === "agents"
                  ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              }`}
            >
              Graph Agents ({graphAgents.length})
            </button>
            <button
              onClick={() => setActiveTab("mcp")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === "mcp"
                  ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              }`}
            >
              MCP Market ({builtinMcpServers.length})
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "agents" ? (
          <motion.div
            className="space-y-3 p-4"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {graphAgents.length > 0 ? (
              graphAgents.map((agent) => (
                <ExplorerAgentCard
                  key={agent.id}
                  agent={agent}
                  onAddToSidebar={handleAddToChat}
                />
              ))
            ) : (
              <div className="text-center py-8">
                <div className="text-4xl mb-4">📊</div>
                <h3 className="text-lg font-semibold text-neutral-800 dark:text-white mb-2">
                  No Graph Agents Found
                </h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Graph agents will appear here when available
                </p>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            className="space-y-3 p-4"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {builtinMcpServers.length > 0 ? (
              builtinMcpServers.map((mcp, _index) => (
                <ExplorerMcpCard key={mcp.module_name} mcp={mcp} />
              ))
            ) : (
              <div className="text-center py-8">
                <div className="text-4xl mb-4">📦</div>
                <h3 className="text-lg font-semibold text-neutral-800 dark:text-white mb-2">
                  MCP Market
                </h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Discover available MCP servers and their capabilities
                </p>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}

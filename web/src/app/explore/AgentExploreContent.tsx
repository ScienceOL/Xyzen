"use client";
import { Badge } from "@/components/base/Badge";
import { cardHover, containerVariants, itemVariants } from "@/lib/animations";
import { useXyzen } from "@/store";
import { PlayIcon, PlusIcon, StopIcon } from "@heroicons/react/24/outline";
import { motion } from "framer-motion";
import React, { useEffect, useMemo } from "react";
import type { Agent } from "../../components/layouts/XyzenAgent";

const ExplorerAgentCard: React.FC<{
  agent: Agent;
  onAddToSidebar: (agent: Agent) => void;
}> = ({ agent, onAddToSidebar }) => {
  const { hiddenGraphAgentIds } = useXyzen();
  const isInSidebar = !hiddenGraphAgentIds.includes(agent.id);

  return (
    <motion.div
      variants={itemVariants}
      whileHover={cardHover}
      className="group relative rounded-sm border border-neutral-200 bg-white p-3 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800/60"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <h4 className="text-sm font-semibold text-neutral-800 dark:text-white truncate">
              {agent.name}
            </h4>
            {agent.is_official && (
              <Badge variant="blue" className="flex items-center gap-1">
                ✓ Official
              </Badge>
            )}
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
            className="opacity-0 group-hover:opacity-100 transition-opacity rounded-sm p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:text-indigo-400 dark:hover:bg-indigo-900/20"
            title="Add to Sidebar"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </motion.div>
  );
};

const AgentExploreContent: React.FC = () => {
  const {
    agents,
    publishedAgents,
    officialAgents,
    fetchAgents,
    fetchPublishedGraphAgents,
    fetchOfficialGraphAgents,
    addGraphAgentToSidebar,
    setActivePanel,
    createDefaultChannel,
    user,
    backendUrl,
  } = useXyzen();

  // Combine published and official agents (official agents are published by default)
  const graphAgents = useMemo(() => {
    const agentMap = new Map<string, Agent>();
    [...agents, ...publishedAgents, ...officialAgents].forEach((agent) => {
      if (agent.agent_type === "graph") {
        agentMap.set(agent.id, agent);
      }
    });
    return Array.from(agentMap.values());
  }, [agents, publishedAgents, officialAgents]);

  useEffect(() => {
    if (user && backendUrl) {
      fetchAgents();
      fetchPublishedGraphAgents();
      fetchOfficialGraphAgents();
    }
  }, [
    fetchAgents,
    fetchPublishedGraphAgents,
    fetchOfficialGraphAgents,
    user,
    backendUrl,
  ]);

  const handleAddToChat = async (agent: Agent) => {
    addGraphAgentToSidebar(agent.id);
    setActivePanel("chat");
    await createDefaultChannel(agent.id);
  };

  return (
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
          <div className="text-4xl mb-4">🔍</div>
          <h3 className="text-lg font-semibold text-neutral-800 dark:text-white mb-2">
            No Published Graph Agents
          </h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Published graph agents from the community and official agents will
            appear here
          </p>
        </div>
      )}
    </motion.div>
  );
};

export default AgentExploreContent;

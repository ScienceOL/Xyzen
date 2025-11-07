"use client";
import { Badge } from "@/components/base/Badge";
import { cardHover, containerVariants, itemVariants } from "@/lib/animations";
import { useXyzen } from "@/store";
import { PlayIcon, PlusIcon, StopIcon } from "@heroicons/react/24/outline";
import { motion } from "framer-motion";
import React, { useEffect, useMemo } from "react";
import type { Agent } from "@/types/agents";

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

  // Separate official and community published agents
  const { officialGraphAgents, communityGraphAgents } = useMemo(() => {
    const agentMap = new Map<string, Agent>();

    // Add published agents (community)
    publishedAgents.forEach((agent) => {
      if (agent.agent_type === "graph") {
        agentMap.set(agent.id, agent);
      }
    });

    // Add official agents
    officialAgents.forEach((agent) => {
      if (agent.agent_type === "graph") {
        agentMap.set(agent.id, agent);
      }
    });

    const allAgents = Array.from(agentMap.values());
    const official = allAgents.filter((agent) => agent.is_official);
    const community = allAgents.filter(
      (agent) => agent.is_published && !agent.is_official,
    );

    return {
      officialGraphAgents: official,
      communityGraphAgents: community,
    };
  }, [publishedAgents, officialAgents]);

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

  const totalAgents = officialGraphAgents.length + communityGraphAgents.length;

  return (
    <motion.div
      className="p-4"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {totalAgents > 0 ? (
        <>
          {/* Official Agents Section */}
          {officialGraphAgents.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-blue-500">⭐</span>
                  <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                    Official Agents
                  </h3>
                  <div className="bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full text-xs font-medium">
                    {officialGraphAgents.length}
                  </div>
                </div>
                <div className="flex-1 ml-4 h-px bg-gradient-to-r from-blue-300 to-transparent dark:from-blue-700"></div>
              </div>
              <div className="space-y-3">
                {officialGraphAgents.map((agent) => (
                  <ExplorerAgentCard
                    key={agent.id}
                    agent={agent}
                    onAddToSidebar={handleAddToChat}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Divider between sections */}
          {officialGraphAgents.length > 0 &&
            communityGraphAgents.length > 0 && (
              <div className="relative mb-6">
                <hr className="border-neutral-200 dark:border-neutral-700" />
                <div className="absolute inset-0 flex justify-center">
                  <div className="bg-white dark:bg-black px-3 text-xs text-neutral-500 dark:text-neutral-400">
                    • • •
                  </div>
                </div>
              </div>
            )}

          {/* Community Published Agents Section */}
          {communityGraphAgents.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-green-500">🌐</span>
                  <h3 className="text-sm font-semibold text-green-700 dark:text-green-300">
                    Community Agents
                  </h3>
                  <div className="bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full text-xs font-medium">
                    {communityGraphAgents.length}
                  </div>
                </div>
                <div className="flex-1 ml-4 h-px bg-gradient-to-r from-green-300 to-transparent dark:from-green-700"></div>
              </div>
              <div className="space-y-3">
                {communityGraphAgents.map((agent) => (
                  <ExplorerAgentCard
                    key={agent.id}
                    agent={agent}
                    onAddToSidebar={handleAddToChat}
                  />
                ))}
              </div>
            </div>
          )}
        </>
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

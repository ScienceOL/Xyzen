"use client";
import { Badge } from "@/components/base/Badge";
import { useXyzen } from "@/store";
import {
  EyeIcon,
  EyeSlashIcon,
  PlayIcon,
  StopIcon,
} from "@heroicons/react/24/outline";
import { motion } from "framer-motion";
import { useEffect } from "react";

// Import the types we need
import type { Agent } from "@/types/agents";
import { isGraphAgent } from "@/types/agents";

// Agent card component for workshop - moved outside the main component
function GraphAgentCard({
  agent,
  onTogglePublish,
}: {
  agent: Agent;
  onTogglePublish: (agentId: string) => void;
}) {
  // Only render if it's a graph agent
  if (!isGraphAgent(agent)) {
    return null;
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative rounded-sm border border-neutral-200 bg-white p-3 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-neutral-800 dark:text-white truncate mb-1">
            {agent.name}
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            {agent.is_published ? (
              <Badge variant="green" className="text-xs">
                <EyeIcon className="h-3 w-3 mr-1" />
                Published
              </Badge>
            ) : (
              <Badge variant="gray" className="text-xs">
                <EyeSlashIcon className="h-3 w-3 mr-1" />
                Private
              </Badge>
            )}
            {agent.is_active ? (
              <Badge
                variant="green"
                className="flex items-center gap-1 text-xs"
              >
                <PlayIcon className="h-3 w-3" />
                Ready
              </Badge>
            ) : (
              <Badge
                variant="yellow"
                className="flex items-center gap-1 text-xs"
              >
                <StopIcon className="h-3 w-3" />
                Building
              </Badge>
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2 mb-2">
        {agent.description}
      </p>

      <div className="flex items-center justify-between">
        {/*<div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
          <span>📊 {agent.node_count || 0} nodes</span>
          <span>🔗 {agent.edge_count || 0} edges</span>
        </div>*/}

        <button
          onClick={() => onTogglePublish(agent.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity rounded-sm p-1.5 text-neutral-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:text-purple-400 dark:hover:bg-purple-900/20"
          title={agent.is_published ? "Make Private" : "Publish to Community"}
        >
          {agent.is_published ? (
            <EyeSlashIcon className="h-4 w-4" />
          ) : (
            <EyeIcon className="h-4 w-4" />
          )}
        </button>
      </div>
    </motion.div>
  );
}

export default function Workshop() {
  const {
    agents,
    fetchAgents,
    toggleGraphAgentPublish,
    user,
    backendUrl,
    fetchWorkshopHistory,
  } = useXyzen();

  // Filter to show only user's graph agents (both published and unpublished)
  // Note: Since /graph-agents/ endpoint returns user's own agents, we show all graph agents
  const userGraphAgents = agents.filter((agent) => isGraphAgent(agent));

  // Removed debug logging

  useEffect(() => {
    if (backendUrl) {
      fetchAgents();
    }
  }, [fetchAgents, backendUrl]);

  // Fetch workshop history when component mounts
  useEffect(() => {
    if (user && backendUrl) {
      fetchWorkshopHistory();
    }
  }, [fetchWorkshopHistory, user, backendUrl]);

  const handleTogglePublish = async (agentId: string) => {
    try {
      const agent = userGraphAgents.find((a) => a.id === agentId);
      if (!agent) return;

      // Show some feedback
      const action = agent.is_published ? "unpublishing" : "publishing";
      console.log(`${action} agent: ${agent.name}`);

      await toggleGraphAgentPublish(agentId);

      // Success feedback
      console.log(
        `Successfully ${agent.is_published ? "unpublished" : "published"} agent: ${agent.name}`,
      );
    } catch (error) {
      console.error("Failed to toggle publish status:", error);
      // Could add toast notification here
      alert("Failed to update publish status. Please try again.");
    }
  };

  // Always show Workshop content regardless of layout style
  // Users want to see their graph agents in both sidebar and fullscreen modes

  // Workshop view - clean and simple
  return (
    <div className="h-full flex">
      {/* Left: User Graph Agents */}
      <div className="w-80 flex-shrink-0 border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950 flex flex-col">
        {/* User Graph Agents List */}
        <div className="flex-1 overflow-y-auto p-4">
          {userGraphAgents.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="text-4xl mb-3">📊</div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                  No graph agents yet
                </p>
                <p className="text-xs text-neutral-400 dark:text-neutral-500">
                  Create graph agents using MCP tools
                </p>
              </div>
            </div>
          ) : (
            <div>
              {/* Quick Stats */}
              <div className="mb-4 p-3 rounded-sm bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700">
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div>
                    <div className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                      {userGraphAgents.filter((a) => a.is_published).length}
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">
                      Published
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                      {userGraphAgents.filter((a) => !a.is_published).length}
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">
                      Private
                    </div>
                  </div>
                </div>
              </div>

              {/* Published Agents */}
              {userGraphAgents.filter((a) => a.is_published).length > 0 && (
                <div className="mb-4">
                  <h3 className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-2 flex items-center gap-2">
                    <span className="text-green-500">🌐</span>
                    Published (
                    {userGraphAgents.filter((a) => a.is_published).length})
                  </h3>
                  <div className="space-y-2">
                    {userGraphAgents
                      .filter((a) => a.is_published)
                      .map((agent) => (
                        <GraphAgentCard
                          key={agent.id}
                          agent={agent}
                          onTogglePublish={handleTogglePublish}
                        />
                      ))}
                  </div>
                </div>
              )}

              {/* Private Agents */}
              {userGraphAgents.filter((a) => !a.is_published).length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-2 flex items-center gap-2">
                    <span className="text-gray-500">🔒</span>
                    Private (
                    {userGraphAgents.filter((a) => !a.is_published).length})
                  </h3>
                  <div className="space-y-2">
                    {userGraphAgents
                      .filter((a) => !a.is_published)
                      .map((agent) => (
                        <GraphAgentCard
                          key={agent.id}
                          agent={agent}
                          onTogglePublish={handleTogglePublish}
                        />
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: Empty space for tools view */}
      <div className="flex-1 bg-white dark:bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🎨</div>
          <h3 className="text-lg font-semibold text-neutral-800 dark:text-white mb-2">
            Agent Designer
          </h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Design area
          </p>
        </div>
      </div>
    </div>
  );
}

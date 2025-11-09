"use client";
import { Badge } from "@/components/base/Badge";
import { useXyzen } from "@/store";
import { PlayIcon, PlusIcon, StopIcon } from "@heroicons/react/24/outline";
import { motion, type Variants } from "framer-motion";
import React, { useEffect, useRef, useState } from "react";
import type { Agent } from "@/types/agents";
import { isGraphAgent } from "@/types/agents";

interface GraphAgentCardProps {
  agent: Agent;
  onAddToSidebar?: (agent: Agent) => void;
}

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

// Context menu for graph agent cards
interface ContextMenuProps {
  x: number;
  y: number;
  onAddToSidebar: () => void;
  onClose: () => void;
  isAlreadyInSidebar: boolean;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  onAddToSidebar,
  onClose,
  isAlreadyInSidebar,
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
      <button
        onClick={() => {
          if (!isAlreadyInSidebar) {
            onAddToSidebar();
          }
          onClose();
        }}
        disabled={isAlreadyInSidebar}
        className={`flex w-full items-center gap-2 rounded-sm px-4 py-2.5 text-left text-sm transition-colors ${
          isAlreadyInSidebar
            ? "text-neutral-400 cursor-not-allowed dark:text-neutral-500"
            : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
        }`}
      >
        <PlusIcon className="h-4 w-4" />
        {isAlreadyInSidebar ? "Already in Sidebar" : "Add to Sidebar"}
      </button>
    </motion.div>
  );
};

// Graph Agent Card Component
const GraphAgentCard: React.FC<GraphAgentCardProps> = ({
  agent,
  onAddToSidebar,
}) => {
  const { hiddenGraphAgentIds, user } = useXyzen();
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Only render if it's a graph agent
  if (!isGraphAgent(agent)) {
    return null;
  }

  const isInSidebar = !hiddenGraphAgentIds.includes(agent.id);
  const isUserOwned = agent.user_id === user?.id;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleAddToSidebar = () => {
    if (!isInSidebar && onAddToSidebar) {
      onAddToSidebar(agent);
    }
  };

  return (
    <>
      <motion.div
        layout
        variants={itemVariants}
        whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
        onContextMenu={handleContextMenu}
        className="group relative rounded-sm border border-neutral-200 bg-white p-4 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800/60"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <h3 className="text-sm font-semibold text-neutral-800 dark:text-white truncate">
                {agent.name}
              </h3>

              {/* Status badges */}
              {agent.is_official && (
                <Badge variant="blue" className="flex items-center gap-1">
                  ⭐ Official
                </Badge>
              )}
              {agent.is_published && !agent.is_official && (
                <Badge variant="green" className="flex items-center gap-1">
                  🌐 Published
                </Badge>
              )}
              {isUserOwned && !agent.is_published && (
                <Badge variant="gray" className="flex items-center gap-1">
                  👤 Mine
                </Badge>
              )}

              {/* Activity status */}
              {agent.is_active ? (
                <Badge variant="green" className="flex items-center gap-1">
                  <PlayIcon className="h-3 w-3" />
                  Ready
                </Badge>
              ) : (
                <Badge variant="yellow" className="flex items-center gap-1">
                  <StopIcon className="h-3 w-3" />
                  Building
                </Badge>
              )}
            </div>

            <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2 mb-3">
              {agent.description}
            </p>

            {/*<div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
              <span className="flex items-center gap-1">
                📊 {agent.node_count || 0} nodes
              </span>
              <span className="flex items-center gap-1">
                🔗 {agent.edge_count || 0} edges
              </span>
            </div>*/}

            {isInSidebar && (
              <div className="mt-2">
                <Badge variant="blue" className="text-xs">
                  ✓ In Sidebar
                </Badge>
              </div>
            )}
          </div>
        </div>

        {/* Add to sidebar button */}
        {!isInSidebar && (
          <button
            onClick={handleAddToSidebar}
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-sm p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:text-indigo-400 dark:hover:bg-indigo-900/20"
            title="Add to Sidebar"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        )}
      </motion.div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onAddToSidebar={handleAddToSidebar}
          onClose={() => setContextMenu(null)}
          isAlreadyInSidebar={isInSidebar}
        />
      )}
    </>
  );
};

export default function AgentExplorer() {
  const {
    publishedAgents,
    officialAgents,
    fetchPublishedGraphAgents,
    fetchOfficialGraphAgents,
    addGraphAgentToSidebar,
    backendUrl,
  } = useXyzen();

  // Combine ONLY official + published graph agents (exclude user's private agents)
  const graphAgents = React.useMemo(() => {
    const agentMap = new Map<string, Agent>();

    // Add published graph agents (from all users, including user's published ones)
    publishedAgents.forEach((agent) => {
      if (agent.agent_type === "graph") {
        agentMap.set(agent.id, agent);
      }
    });

    // Add official graph agents
    officialAgents.forEach((agent) => {
      if (agent.agent_type === "graph") {
        agentMap.set(agent.id, agent);
      }
    });

    // DO NOT add user's private agents (unpublished ones from agents array)

    return Array.from(agentMap.values()).sort((a, b) => {
      // Sort by: official first, then published
      if (a.is_official && !b.is_official) return -1;
      if (!a.is_official && b.is_official) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [publishedAgents, officialAgents]);

  useEffect(() => {
    if (backendUrl) {
      fetchPublishedGraphAgents();
      fetchOfficialGraphAgents();
    }
  }, [fetchPublishedGraphAgents, fetchOfficialGraphAgents, backendUrl]);

  const handleAddToSidebar = (agent: Agent) => {
    addGraphAgentToSidebar(agent.id);
  };

  // Organize agents by categories: Official and Community Published
  const { officialAgentsSection, communityAgentsSection } =
    React.useMemo(() => {
      const official = graphAgents.filter((agent) => agent.is_official);
      const community = graphAgents.filter(
        (agent) => agent.is_published && !agent.is_official,
      );

      return {
        officialAgentsSection: official,
        communityAgentsSection: community,
      };
    }, [graphAgents]);

  if (graphAgents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <div className="text-center">
          <div className="text-4xl mb-4">🔍</div>
          <h3 className="text-lg font-semibold text-neutral-800 dark:text-white mb-2">
            No Graph Agents Available
          </h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
            Official and community published graph agents will appear here.
          </p>
          <p className="text-xs text-neutral-400 dark:text-neutral-500">
            Create and publish your own graph agents in the Workshop to share
            with the community.
          </p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="px-4 pb-4"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Official Agents Section */}
      {officialAgentsSection.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center mb-4">
            <div className="flex items-center gap-2">
              <span className="text-blue-500">⭐</span>
              <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                Official Agents
              </h3>
              <div className="bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full text-xs font-medium">
                {officialAgentsSection.length}
              </div>
            </div>
            <div className="flex-1 ml-4 h-px bg-gradient-to-r from-blue-300 to-transparent dark:from-blue-700"></div>
          </div>
          <p className="text-xs text-blue-600 dark:text-blue-400 mb-4 ml-6">
            Verified agents from the Xyzen team
          </p>
          <div className="space-y-3">
            {officialAgentsSection.map((agent) => (
              <GraphAgentCard
                key={agent.id}
                agent={agent}
                onAddToSidebar={handleAddToSidebar}
              />
            ))}
          </div>
        </div>
      )}

      {/* Divider between sections */}
      {officialAgentsSection.length > 0 &&
        communityAgentsSection.length > 0 && (
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
      {communityAgentsSection.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center mb-4">
            <div className="flex items-center gap-2">
              <span className="text-green-500">🌐</span>
              <h3 className="text-sm font-semibold text-green-700 dark:text-green-300">
                Community Agents
              </h3>
              <div className="bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full text-xs font-medium">
                {communityAgentsSection.length}
              </div>
            </div>
            <div className="flex-1 ml-4 h-px bg-gradient-to-r from-green-300 to-transparent dark:from-green-700"></div>
          </div>
          <p className="text-xs text-green-600 dark:text-green-400 mb-4 ml-6">
            Published by community members
          </p>
          <div className="space-y-3">
            {communityAgentsSection.map((agent) => (
              <GraphAgentCard
                key={agent.id}
                agent={agent}
                onAddToSidebar={handleAddToSidebar}
              />
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

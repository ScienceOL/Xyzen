"use client";
import { Badge } from "@/components/base/Badge";
import { useXyzen } from "@/store";
import { PlusIcon, PlayIcon, StopIcon } from "@heroicons/react/24/outline";
import { motion, type Variants } from "framer-motion";
import React, { useEffect, useState, useRef } from "react";
import type { Agent } from "./XyzenAgent";

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
      className="fixed z-50 w-48 rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
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
        className={`flex w-full items-center gap-2 rounded-lg px-4 py-2.5 text-left text-sm transition-colors ${
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
  const { hiddenGraphAgentIds } = useXyzen();
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const isInSidebar = !hiddenGraphAgentIds.includes(agent.id);

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
        className="group relative rounded-lg border border-neutral-200 bg-white p-4 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800/60"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-sm font-semibold text-neutral-800 dark:text-white truncate">
                {agent.name}
              </h3>
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
            </div>

            <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2 mb-3">
              {agent.description}
            </p>

            <div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
              <span className="flex items-center gap-1">
                📊 {agent.node_count || 0} nodes
              </span>
              <span className="flex items-center gap-1">
                🔗 {agent.edge_count || 0} edges
              </span>
            </div>

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
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-md p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:text-indigo-400 dark:hover:bg-indigo-900/20"
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
  const { agents, fetchAgents, addGraphAgentToSidebar, user, backendUrl } =
    useXyzen();

  // Filter to show only graph agents
  const graphAgents = agents.filter((agent) => agent.agent_type === "graph");

  useEffect(() => {
    if (user && backendUrl) {
      fetchAgents();
    }
  }, [fetchAgents, user, backendUrl]);

  const handleAddToSidebar = (agent: Agent) => {
    addGraphAgentToSidebar(agent.id);
  };

  if (graphAgents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <div className="text-center">
          <div className="text-4xl mb-4">🔍</div>
          <h3 className="text-lg font-semibold text-neutral-800 dark:text-white mb-2">
            No Graph Agents
          </h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
            Graph agents are created using MCP tools with complex workflows
            involving nodes and edges.
          </p>
          <p className="text-xs text-neutral-400 dark:text-neutral-500">
            Create graph agents through the chat interface with appropriate MCP
            tools.
          </p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-3 px-4"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {graphAgents.map((agent) => (
        <GraphAgentCard
          key={agent.id}
          agent={agent}
          onAddToSidebar={handleAddToSidebar}
        />
      ))}
    </motion.div>
  );
}

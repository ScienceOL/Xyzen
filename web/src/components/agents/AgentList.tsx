"use client";

import type { Agent } from "@/types/agents";
import { motion, type Variants } from "framer-motion";
import React from "react";
import { AgentListItem } from "./AgentListItem";

// Container animation variants for detailed variant
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

// Base props for both variants
interface AgentListBaseProps {
  agents: Agent[];
  onAgentClick?: (agent: Agent) => void;
}

// Props for detailed variant
interface DetailedAgentListProps extends AgentListBaseProps {
  variant: "detailed";
  publishedAgentIds?: Set<string>;
  lastConversationTimeByAgent?: Record<string, string>;
  onEdit?: (agent: Agent) => void;
  onDelete?: (agent: Agent) => void;
  // Compact variant props not used
  selectedAgentId?: never;
  getAgentStatus?: never;
  getAgentRole?: never;
}

// Props for compact variant
interface CompactAgentListProps extends AgentListBaseProps {
  variant: "compact";
  selectedAgentId?: string;
  getAgentStatus?: (agent: Agent) => "idle" | "busy";
  getAgentRole?: (agent: Agent) => string | undefined;
  // Right-click menu support (shared with detailed)
  publishedAgentIds?: Set<string>;
  onEdit?: (agent: Agent) => void;
  onDelete?: (agent: Agent) => void;
  // Detailed variant props not used
  lastConversationTimeByAgent?: never;
}

export type AgentListProps = DetailedAgentListProps | CompactAgentListProps;

export const AgentList: React.FC<AgentListProps> = (props) => {
  const { agents, variant, onAgentClick } = props;

  if (variant === "detailed") {
    const { publishedAgentIds, lastConversationTimeByAgent, onEdit, onDelete } =
      props as DetailedAgentListProps;

    return (
      <motion.div
        className="space-y-2"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {agents.map((agent) => (
          <AgentListItem
            key={agent.id}
            agent={agent}
            variant="detailed"
            isMarketplacePublished={publishedAgentIds?.has(agent.id)}
            lastConversationTime={lastConversationTimeByAgent?.[agent.id]}
            onClick={onAgentClick}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </motion.div>
    );
  }

  // Compact variant
  const {
    selectedAgentId,
    getAgentStatus,
    getAgentRole,
    publishedAgentIds,
    onEdit,
    onDelete,
  } = props as CompactAgentListProps;

  return (
    <div className="space-y-1">
      {agents.map((agent) => (
        <AgentListItem
          key={agent.id}
          agent={agent}
          variant="compact"
          isSelected={agent.id === selectedAgentId}
          status={getAgentStatus?.(agent) ?? "idle"}
          role={getAgentRole?.(agent)}
          isMarketplacePublished={publishedAgentIds?.has(agent.id)}
          onClick={onAgentClick}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
};

export default AgentList;

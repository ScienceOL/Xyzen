"use client";

import ChatStatusBadge from "@/components/base/ChatStatusBadge";
import type { Agent } from "@/types/agents";
import { Crown } from "lucide-react";
import { motion } from "framer-motion";
import React from "react";
import { useTranslation } from "react-i18next";

interface CeoAgentCardProps {
  agent: Agent;
  isLoading?: boolean;
  activeTopicCount?: number;
  onClick?: (agent: Agent) => void;
}

const CeoAgentCard: React.FC<CeoAgentCardProps> = ({
  agent,
  isLoading = false,
  activeTopicCount = 0,
  onClick,
}) => {
  const { t } = useTranslation();

  return (
    <motion.div
      whileHover={{ scale: 1.01, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onClick?.(agent)}
      className={`
        flex cursor-pointer items-center gap-3 rounded-lg p-3
        bg-gradient-to-r from-amber-50 to-orange-50
        dark:from-amber-950/30 dark:to-orange-950/30
        border border-amber-200/60 dark:border-amber-800/40
        shadow-sm hover:shadow-md transition-shadow
        ${isLoading ? "animate-pulse" : ""}
      `}
    >
      {/* Avatar */}
      <div className="relative h-10 w-10 shrink-0">
        <img
          src={
            agent.avatar ||
            "https://api.dicebear.com/7.x/avataaars/svg?seed=ceo"
          }
          alt={agent.name}
          className="h-10 w-10 rounded-full border border-amber-200 dark:border-amber-700 object-cover"
        />
        <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 dark:bg-amber-600">
          <Crown className="h-2.5 w-2.5 text-white" />
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100 truncate">
            {agent.name}
          </h3>
          <span className="shrink-0 rounded-full bg-amber-200/60 dark:bg-amber-800/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
            {t("agents.rootAgent.badge", { defaultValue: "Root" })}
          </span>
          {activeTopicCount > 0 && (
            <ChatStatusBadge status="running" size="xs" className="shrink-0" />
          )}
        </div>
        <p className="mt-0.5 text-xs text-amber-700/70 dark:text-amber-300/60 line-clamp-1">
          {agent.description ||
            t("agents.rootAgent.description", {
              defaultValue: "Orchestrates and delegates to your other agents",
            })}
        </p>
      </div>
    </motion.div>
  );
};

export default React.memo(CeoAgentCard);

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
      whileTap={{ scale: 0.98 }}
      onClick={() => onClick?.(agent)}
      className={`
        relative cursor-pointer overflow-hidden rounded-2xl
        bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500
        dark:from-amber-600 dark:via-amber-700 dark:to-orange-700
        p-4 shadow-lg shadow-amber-200/40 dark:shadow-amber-900/30
        ${isLoading ? "animate-pulse" : ""}
      `}
    >
      {/* Decorative circles */}
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
      <div className="absolute -bottom-4 -left-4 h-16 w-16 rounded-full bg-white/10" />

      <div className="relative flex items-center gap-3.5">
        {/* Avatar */}
        <div className="relative shrink-0">
          <div className="h-14 w-14 overflow-hidden rounded-full border-2 border-white/50 shadow-md">
            <img
              src={
                agent.avatar ||
                "https://api.dicebear.com/7.x/avataaars/svg?seed=ceo"
              }
              alt={agent.name}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm">
            <Crown className="h-3 w-3 text-amber-500" />
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white truncate">
              {agent.name}
            </h3>
            {activeTopicCount > 0 && (
              <ChatStatusBadge
                status="running"
                size="xs"
                className="shrink-0"
              />
            )}
          </div>
          <p className="mt-0.5 text-xs text-white/75 line-clamp-1">
            {agent.description ||
              t("agents.rootAgent.description", {
                defaultValue: "Orchestrates and delegates to your other agents",
              })}
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default React.memo(CeoAgentCard);

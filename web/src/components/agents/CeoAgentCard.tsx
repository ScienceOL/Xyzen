"use client";

import ChatStatusBadge from "@/components/base/ChatStatusBadge";
import type { Agent } from "@/types/agents";
import { Crown, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import React from "react";
import { useTranslation } from "react-i18next";

interface CeoAgentCardProps {
  agent: Agent;
  isLoading?: boolean;
  activeTopicCount?: number;
  onClick?: (agent: Agent) => void;
}

/**
 * Inline SVG pattern — Art Deco fan motif rendered at very low opacity
 * as a luxury background texture. Encoded as a data URI so no extra
 * network request is needed.
 */
const patternUrl = `url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cpath d='M30 0c0 16.569-13.431 30-30 30C16.569 30 30 16.569 30 0z' fill='%23fff' fill-opacity='.04'/%3E%3Cpath d='M60 0c0 16.569-13.431 30-30 30 16.569 0 30-13.431 30-30z' fill='%23fff' fill-opacity='.04'/%3E%3Cpath d='M30 30c0 16.569-13.431 30-30 30 16.569 0 30-13.431 30-30z' fill='%23fff' fill-opacity='.04'/%3E%3Cpath d='M60 30c0 16.569-13.431 30-30 30 16.569 0 30-13.431 30-30z' fill='%23fff' fill-opacity='.04'/%3E%3C/g%3E%3C/svg%3E")`;

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
        bg-white/60 dark:bg-neutral-900/60
        backdrop-blur-2xl
        shadow-[0_2px_16px_rgba(0,0,0,0.08)]
        dark:shadow-[0_2px_16px_rgba(0,0,0,0.3)]
        p-4
        ${isLoading ? "animate-pulse" : ""}
      `}
      style={{
        border: "1px solid transparent",
        backgroundClip: "padding-box",
        backgroundOrigin: "border-box",
      }}
    >
      {/* Amber gradient border — rendered as an inset ring so it works with backdrop-blur */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-amber-400/25 dark:ring-amber-500/20" />
      <div className="pointer-events-none absolute inset-0 rounded-2xl border border-amber-300/30 dark:border-amber-500/15" />
      {/* Decorative pattern overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30 dark:opacity-100"
        style={{ backgroundImage: patternUrl, backgroundSize: "60px 60px" }}
      />
      {/* Subtle top-right radial glow */}
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-amber-400/[0.06] dark:bg-amber-400/[0.04]" />
      {/* Thin gold accent line at top */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />

      <div className="relative flex items-center gap-3.5">
        {/* Avatar */}
        <div className="relative shrink-0">
          <div className="h-11 w-11 overflow-hidden rounded-full ring-1 ring-amber-300/30 dark:ring-amber-500/20">
            <img
              src={
                agent.avatar ||
                "https://api.dicebear.com/7.x/avataaars/svg?seed=ceo"
              }
              alt={agent.name}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-amber-500 ring-[1.5px] ring-white/80 dark:ring-neutral-900/80">
            <Crown className="h-2.5 w-2.5 text-white" />
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100 truncate">
              {agent.name}
            </span>
            <span className="shrink-0 rounded-sm bg-amber-500/10 px-1.5 py-px text-[9px] font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
              {t("agents.rootAgent.badge", { defaultValue: "CEO" })}
            </span>
            {activeTopicCount > 0 && (
              <ChatStatusBadge
                status="running"
                size="xs"
                className="shrink-0"
              />
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-1">
            {agent.description ||
              t("agents.rootAgent.description", {
                defaultValue: "Orchestrates and delegates to your other agents",
              })}
          </p>
        </div>

        {/* Arrow */}
        <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400 dark:text-neutral-500" />
      </div>
    </motion.div>
  );
};

export default React.memo(CeoAgentCard);

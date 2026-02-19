import type { Agent } from "@/types/agents";
import React from "react";

interface AgentSlotCarouselProps {
  agents: Agent[];
  onAgentClick: (agent: Agent) => void;
}

const AgentSlotCarousel: React.FC<AgentSlotCarouselProps> = ({
  agents,
  onAgentClick,
}) => {
  if (agents.length === 0) return null;

  return (
    <div
      className="flex gap-3 overflow-x-auto px-1 pb-2 [&::-webkit-scrollbar]:hidden"
      style={{ scrollbarWidth: "none" }}
    >
      {agents.map((agent) => (
        <button
          key={agent.id}
          onClick={() => onAgentClick(agent)}
          className="flex shrink-0 flex-col items-center gap-1.5 rounded-xl px-3 py-2.5 transition-colors active:bg-amber-50 dark:active:bg-amber-950/30"
          style={{ width: "72px" }}
        >
          <div className="h-11 w-11 overflow-hidden rounded-full border border-neutral-200 dark:border-neutral-700">
            <img
              src={
                agent.avatar ||
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${agent.id}`
              }
              alt={agent.name}
              className="h-full w-full object-cover"
            />
          </div>
          <span className="w-full truncate text-center text-[11px] text-neutral-600 dark:text-neutral-400">
            {agent.name}
          </span>
        </button>
      ))}
    </div>
  );
};

export default React.memo(AgentSlotCarousel);

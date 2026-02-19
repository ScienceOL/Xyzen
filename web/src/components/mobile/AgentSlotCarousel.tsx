import type { Agent } from "@/types/agents";
import { AnimatePresence, motion } from "framer-motion";
import React, { useCallback, useEffect, useRef, useState } from "react";

interface AgentSlotCarouselProps {
  agents: Agent[];
  onAgentClick: (agent: Agent) => void;
}

const INTERVAL = 3000;

const AgentSlotCarousel: React.FC<AgentSlotCarouselProps> = ({
  agents,
  onAgentClick,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const touchStartY = useRef<number | null>(null);

  const count = agents.length;

  // Auto-advance
  useEffect(() => {
    if (count <= 1) return;
    timerRef.current = setInterval(() => {
      setCurrentIndex((i) => (i + 1) % count);
    }, INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [count]);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (count > 1) {
      timerRef.current = setInterval(() => {
        setCurrentIndex((i) => (i + 1) % count);
      }, INTERVAL);
    }
  }, [count]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartY.current === null || count <= 1) return;
      const dy = e.changedTouches[0].clientY - touchStartY.current;
      touchStartY.current = null;
      if (Math.abs(dy) < 30) return;
      if (dy < 0) {
        setCurrentIndex((i) => (i + 1) % count);
      } else {
        setCurrentIndex((i) => (i - 1 + count) % count);
      }
      resetTimer();
    },
    [count, resetTimer],
  );

  if (count === 0) return null;

  // Show prev, current, next
  const getOffset = (slot: -1 | 0 | 1) => {
    const idx = (((currentIndex + slot) % count) + count) % count;
    return agents[idx];
  };

  const slots: { slot: -1 | 0 | 1; agent: Agent }[] = [
    { slot: -1, agent: getOffset(-1) },
    { slot: 0, agent: getOffset(0) },
    { slot: 1, agent: getOffset(1) },
  ];

  return (
    <div
      className="relative mx-auto h-36 w-full max-w-xs overflow-hidden"
      style={{ perspective: "600px" }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <AnimatePresence mode="popLayout">
        {slots.map(({ slot, agent }) => {
          const y = slot * 44;
          const scale = slot === 0 ? 1 : 0.88;
          const rotateX = slot * 12;
          const opacity = slot === 0 ? 1 : 0.5;
          const zIndex = slot === 0 ? 10 : 5;

          return (
            <motion.div
              key={`${agent.id}-${slot}`}
              initial={false}
              animate={{
                y,
                scale,
                rotateX,
                opacity,
                zIndex,
              }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="absolute inset-x-0 top-1/2 -translate-y-1/2 cursor-pointer"
              onClick={slot === 0 ? () => onAgentClick(agent) : undefined}
              style={{ transformStyle: "preserve-3d" }}
            >
              <div className="mx-auto flex max-w-[280px] items-center gap-3 rounded-xl border border-neutral-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-800/90">
                <img
                  src={
                    agent.avatar ||
                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${agent.id}`
                  }
                  alt={agent.name}
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {agent.name}
                  </p>
                  <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                    {agent.description || ""}
                  </p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default React.memo(AgentSlotCarousel);

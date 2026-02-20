import { formatTime } from "@/lib/formatDate";
import { cn } from "@/lib/utils";
import { ShoppingBagIcon } from "@heroicons/react/24/outline";
import { motion } from "framer-motion";
import type { AgentFlowNodeProps } from "./types";

import {
  NodeSettingsModal,
  SettingsGearButton,
  StatsDisplay,
  useAgentNode,
} from "./agentNodeShared";

export function AgentNode({ id, data, selected }: AgentFlowNodeProps) {
  const node = useAgentNode({ id, data });
  const { currentW, currentH, style, setIsSettingsOpen } = node;

  return (
    <>
      <NodeSettingsModal id={id} data={data} {...node} />

      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{
          scale: 1,
          opacity: 1,
          width: style.width,
          height: style.height,
        }}
        whileHover={{ scale: 1.02 }}
        transition={{
          scale: { type: "spring", stiffness: 400, damping: 25 },
          opacity: { duration: 0.2 },
          width: { type: "spring", stiffness: 300, damping: 30 },
          height: { type: "spring", stiffness: 300, damping: 30 },
        }}
        onClick={(e) => {
          e.stopPropagation();
          data.onFocus(id);
        }}
        className={cn(
          "relative group rounded-3xl shadow-2xl",
          data.isFocused ? "z-50" : "z-0",
        )}
      >
        {/* Newly Created Glow */}
        {data.isNewlyCreated && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
              opacity: [0, 0.6, 0.3, 0.6, 0.3, 0],
              scale: [0.95, 1.05, 1.02, 1.05, 1.02, 1],
            }}
            transition={{ duration: 2.5, ease: "easeInOut" }}
            className="absolute -inset-3 -z-30 rounded-[40px] bg-linear-to-r from-emerald-400 via-cyan-400 to-blue-500 blur-xl pointer-events-none"
          />
        )}

        {/* IsFocused Glow */}
        {data.isFocused && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute -inset-2 -z-20 rounded-[35px] bg-linear-to-r from-blue-500 via-indigo-500 to-purple-500 opacity-30 blur-xl pointer-events-none"
          />
        )}

        {/* Running Border */}
        {data.isRunning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute -inset-0.5 -z-15 rounded-[26px] overflow-hidden pointer-events-none"
          >
            <div className="agent-running-border absolute inset-0" />
            <div className="absolute inset-0.5 rounded-3xl bg-[#fdfcf8] dark:bg-neutral-900" />
          </motion.div>
        )}

        {/* Card Background */}
        <div
          className={cn(
            "absolute inset-0 rounded-3xl bg-[#fdfcf8] dark:bg-neutral-900/80 backdrop-blur-xl transition-all border border-white/50 dark:border-white/10 -z-10",
            selected
              ? "ring-2 ring-[#5a6e8c]/20 dark:ring-0 dark:border-indigo-400/50 dark:shadow-[0_0_15px_rgba(99,102,241,0.5),0_0_30px_rgba(168,85,247,0.3)] shadow-2xl"
              : "hover:shadow-2xl",
            data.isRunning &&
              "shadow-[0_0_20px_rgba(99,102,241,0.25),0_0_40px_rgba(168,85,247,0.15)] dark:shadow-[0_0_15px_rgba(99,102,241,0.5),0_0_30px_rgba(168,85,247,0.3)]",
            data.isFocused &&
              "ring-0 border-white/20! dark:border-white/10! shadow-none! bg-white/90 dark:bg-black/80",
          )}
        />

        {/* Content */}
        <div className="relative z-10 w-full h-full p-4 flex flex-col">
          <SettingsGearButton
            onClick={(e) => {
              e.stopPropagation();
              setIsSettingsOpen(true);
            }}
          />

          <div className="flex items-center gap-3 mb-2">
            <div
              className={cn(
                "relative shrink-0 avatar-glow",
                data.isFocused && "is-focused",
              )}
            >
              <img
                src={data.avatar}
                className="w-10 h-10 rounded-full bg-gray-200 border-2 border-white dark:border-white/20 shadow-sm"
                alt="avatar"
                draggable={false}
              />
              {/* Marketplace badge */}
              {data.isMarketplacePublished && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center border-2 border-white dark:border-neutral-900 shadow-sm"
                  title="Published to Marketplace"
                >
                  <ShoppingBagIcon className="w-3 h-3 text-white" />
                </motion.div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-base leading-tight text-neutral-800 dark:text-neutral-100 truncate">
                {data.name}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium truncate">
                  {data.role}
                </span>
                {data.lastConversationTime && (
                  <span className="text-[10px] text-neutral-400 dark:text-neutral-500 shrink-0">
                    · {formatTime(data.lastConversationTime)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 bg-[#f4f1ea] dark:bg-white/5 rounded-sm relative overflow-hidden group-hover:bg-[#efece5] dark:group-hover:bg-white/10 transition-colors">
            <div className="absolute inset-0 opacity-30 bg-linear-to-br from-transparent to-black/5 dark:to-black/30 pointer-events-none" />
            <StatsDisplay
              stats={data.stats}
              gridW={currentW}
              gridH={currentH}
              dailyActivity={data.dailyActivity}
              yesterdaySummary={data.yesterdaySummary}
            />
          </div>
        </div>
      </motion.div>
    </>
  );
}

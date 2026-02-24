/**
 * RootAgentNode — CEO agent canvas node.
 *
 * Same dynamic effects (focus glow, running border, selected ring) as AgentNode.
 * Static differences: warm background, amber border, Art Deco pattern, crown badge, CEO label.
 */
import { formatTime } from "@/lib/formatDate";
import { cn } from "@/lib/utils";
import { Crown } from "lucide-react";
import { motion } from "framer-motion";
import type { AgentFlowNodeProps } from "./types";

import {
  NodeSettingsModal,
  SettingsGearButton,
  StatsDisplay,
  useAgentNode,
} from "./agentNodeShared";

/** Art Deco fan motif — very low opacity background texture. */
const patternUrl = `url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cpath d='M30 0c0 16.569-13.431 30-30 30C16.569 30 30 16.569 30 0z' fill='%23fff' fill-opacity='.04'/%3E%3Cpath d='M60 0c0 16.569-13.431 30-30 30 16.569 0 30-13.431 30-30z' fill='%23fff' fill-opacity='.04'/%3E%3Cpath d='M30 30c0 16.569-13.431 30-30 30 16.569 0 30-13.431 30-30z' fill='%23fff' fill-opacity='.04'/%3E%3Cpath d='M60 30c0 16.569-13.431 30-30 30 16.569 0 30-13.431 30-30z' fill='%23fff' fill-opacity='.04'/%3E%3C/g%3E%3C/svg%3E")`;

export function RootAgentNode({ id, data, selected }: AgentFlowNodeProps) {
  const hasSubordinates =
    data.subordinateAvatars && data.subordinateAvatars.length > 0;
  const node = useAgentNode({
    id,
    data,
    extraHeight: hasSubordinates ? 24 : 0,
  });
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
        {/* ── Dynamic effects — identical to AgentNode ── */}

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
            <div className="absolute inset-0.5 rounded-3xl bg-[#fffbf0] dark:bg-neutral-900" />
          </motion.div>
        )}

        {/* ── Static decorations — CEO only ── */}

        {/* Thin gold accent line at top */}
        {!data.isFocused && (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-3xl bg-gradient-to-r from-transparent via-amber-400/60 to-transparent z-10" />
        )}

        {/* Card Background — warm tinted with amber border */}
        <div
          className={cn(
            "absolute inset-0 rounded-3xl backdrop-blur-xl transition-all -z-10",
            "bg-[#fffbf0] dark:bg-neutral-900/80 border border-amber-300/40 dark:border-amber-500/25",
            selected
              ? "ring-2 ring-[#5a6e8c]/20 dark:ring-0 dark:border-indigo-400/50 dark:shadow-[0_0_15px_rgba(99,102,241,0.5),0_0_30px_rgba(168,85,247,0.3)] shadow-2xl"
              : "hover:shadow-2xl",
            data.isRunning &&
              "shadow-[0_0_20px_rgba(99,102,241,0.25),0_0_40px_rgba(168,85,247,0.15)] dark:shadow-[0_0_15px_rgba(99,102,241,0.5),0_0_30px_rgba(168,85,247,0.3)]",
            data.isFocused &&
              "ring-0 border-white/20! dark:border-white/10! shadow-none! bg-white/90 dark:bg-black/80",
          )}
        />

        {/* Art Deco pattern overlay */}
        <div
          className="pointer-events-none absolute inset-0 rounded-3xl overflow-hidden opacity-30 dark:opacity-100 -z-5"
          style={{ backgroundImage: patternUrl, backgroundSize: "60px 60px" }}
        />

        {/* ── Content ── */}
        <div className="relative z-10 w-full h-full p-4 flex flex-col overflow-hidden rounded-3xl">
          {/* Warm diagonal gradient across content */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-100/40 via-transparent to-amber-200/20 dark:from-amber-900/15 dark:via-transparent dark:to-amber-800/10" />

          {/* Sunlight beams — diagonal streaks */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-10 -left-10 w-[120%] h-16 rotate-[25deg] bg-gradient-to-r from-transparent via-amber-200/20 to-transparent dark:via-amber-500/[0.07]" />
            <div className="absolute top-8 -left-10 w-[120%] h-10 rotate-[25deg] bg-gradient-to-r from-transparent via-amber-100/15 to-transparent dark:via-amber-500/[0.04]" />
            <div className="absolute top-24 -left-10 w-[120%] h-6 rotate-[25deg] bg-gradient-to-r from-transparent via-amber-200/10 to-transparent dark:via-amber-400/[0.03]" />
          </div>

          <SettingsGearButton
            onClick={(e) => {
              e.stopPropagation();
              setIsSettingsOpen(true);
            }}
          />

          <div className="relative flex items-center gap-3.5 mb-2">
            {/* Large avatar with golden ring + Crown emblem */}
            <div
              className={cn(
                "relative shrink-0 avatar-glow",
                data.isFocused && "is-focused",
              )}
            >
              <div className="rounded-full p-[2.5px] bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 dark:from-amber-500 dark:via-yellow-500 dark:to-amber-600 shadow-md shadow-amber-300/30 dark:shadow-amber-600/20">
                <img
                  src={data.avatar}
                  className="w-12 h-12 rounded-full bg-gray-200 border-[2.5px] border-white dark:border-neutral-900"
                  alt="avatar"
                  draggable={false}
                />
              </div>
              {/* Crown emblem — larger, gradient, with ring */}
              <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 via-yellow-500 to-amber-600 border-[2.5px] border-white dark:border-neutral-900 shadow-md shadow-amber-400/30">
                <Crown className="h-3 w-3 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.15)]" />
              </div>
            </div>

            {/* Name with golden shimmer + CEO shield badge */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-[17px] leading-tight bg-gradient-to-r from-amber-800 via-amber-600 to-amber-800 dark:from-amber-200 dark:via-yellow-300 dark:to-amber-200 bg-clip-text text-transparent truncate">
                  {data.name}
                </span>
                {/* Shield-style CEO badge */}
                <span className="shrink-0 flex items-center gap-0.5 rounded-md bg-gradient-to-b from-amber-400 to-amber-500 dark:from-amber-500 dark:to-amber-600 px-1.5 py-0.5 shadow-sm shadow-amber-400/20">
                  <Crown className="h-2.5 w-2.5 text-white/90" />
                  <span className="text-[8px] font-bold uppercase tracking-widest text-white">
                    CEO
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-amber-800/60 dark:text-amber-300/50 font-medium truncate">
                  {data.role}
                </span>
                {data.lastConversationTime && (
                  <span className="text-[10px] text-amber-700/40 dark:text-amber-400/40 shrink-0">
                    · {formatTime(data.lastConversationTime)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Subordinate agents — shows who the CEO commands */}
          {data.subordinateAvatars && data.subordinateAvatars.length > 0 && (
            <div className="relative flex items-center gap-1.5 mb-2 px-0.5">
              {/* Connecting line */}
              <div className="absolute top-1/2 left-3 right-3 h-px bg-gradient-to-r from-amber-300/50 via-amber-200/30 to-amber-300/50 dark:from-amber-600/30 dark:via-amber-500/15 dark:to-amber-600/30" />
              {/* "Orchestrates" label */}
              <span className="relative z-10 shrink-0 text-[9px] font-medium text-amber-600/70 dark:text-amber-400/50 bg-[#fffbf0] dark:bg-neutral-900 px-1.5 rounded">
                Agents
              </span>
              {/* Avatar stack */}
              <div className="relative z-10 flex items-center -space-x-1.5">
                {data.subordinateAvatars.slice(0, 6).map((avatar, i) => (
                  <img
                    key={i}
                    src={avatar}
                    className="w-5 h-5 rounded-full border-[1.5px] border-white dark:border-neutral-800 bg-gray-200 shadow-sm"
                    alt=""
                    draggable={false}
                  />
                ))}
                {data.subordinateAvatars.length > 6 && (
                  <div className="w-5 h-5 rounded-full border-[1.5px] border-white dark:border-neutral-800 bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shadow-sm">
                    <span className="text-[7px] font-bold text-amber-700 dark:text-amber-300">
                      +{data.subordinateAvatars.length - 6}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Stats area with pattern + gradient */}
          <div className="relative flex-1 min-h-0 rounded-lg overflow-hidden transition-colors border border-amber-200/40 dark:border-amber-700/20">
            {/* Stats background gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-amber-50/80 via-amber-100/30 to-orange-50/60 dark:from-amber-950/30 dark:via-neutral-900/50 dark:to-amber-950/20" />
            {/* Repeating pattern inside stats */}
            <div
              className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-60"
              style={{
                backgroundImage: patternUrl,
                backgroundSize: "40px 40px",
              }}
            />
            {/* Diagonal sunbeam through stats */}
            <div className="pointer-events-none absolute -top-4 -left-4 w-[120%] h-8 rotate-[25deg] bg-gradient-to-r from-transparent via-amber-200/15 to-transparent dark:via-amber-500/[0.06]" />
            <div className="relative">
              <StatsDisplay
                stats={data.stats}
                gridW={currentW}
                gridH={currentH}
                dailyActivity={data.dailyActivity}
                yesterdaySummary={data.yesterdaySummary}
              />
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}

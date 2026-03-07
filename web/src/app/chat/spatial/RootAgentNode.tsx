/**
 * RootAgentNode — CEO agent canvas node.
 *
 * Same dynamic effects (focus glow, running border, selected ring) as AgentNode.
 * Static differences: blue-gold gradient border, gold Art Deco pattern, crown badge, CEO label.
 */
import { formatTime } from "@/lib/formatDate";
import { cn } from "@/lib/utils";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";
import { Crown, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import type { AgentFlowNodeProps } from "./types";

import {
  NodeSettingsModal,
  StatsDisplay,
  useAgentNode,
} from "./agentNodeShared";

/** Art Deco fan motif — white for dark mode. */
const patternUrl = `url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cpath d='M30 0c0 16.569-13.431 30-30 30C16.569 30 30 16.569 30 0z' fill='%23fff' fill-opacity='.04'/%3E%3Cpath d='M60 0c0 16.569-13.431 30-30 30 16.569 0 30-13.431 30-30z' fill='%23fff' fill-opacity='.04'/%3E%3Cpath d='M30 30c0 16.569-13.431 30-30 30 16.569 0 30-13.431 30-30z' fill='%23fff' fill-opacity='.04'/%3E%3Cpath d='M60 30c0 16.569-13.431 30-30 30 16.569 0 30-13.431 30-30z' fill='%23fff' fill-opacity='.04'/%3E%3C/g%3E%3C/svg%3E")`;

/** Art Deco fan motif — refined gold for light mode. */
const patternUrlLight = `url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cpath d='M30 0c0 16.569-13.431 30-30 30C16.569 30 30 16.569 30 0z' fill='%23c9a84c' fill-opacity='.12'/%3E%3Cpath d='M60 0c0 16.569-13.431 30-30 30 16.569 0 30-13.431 30-30z' fill='%23c9a84c' fill-opacity='.12'/%3E%3Cpath d='M30 30c0 16.569-13.431 30-30 30 16.569 0 30-13.431 30-30z' fill='%23c9a84c' fill-opacity='.12'/%3E%3Cpath d='M60 30c0 16.569-13.431 30-30 30 16.569 0 30-13.431 30-30z' fill='%23c9a84c' fill-opacity='.12'/%3E%3C/g%3E%3C/svg%3E")`;

export function RootAgentNode({ id, data, selected }: AgentFlowNodeProps) {
  const { t } = useTranslation();
  const hasSubordinates =
    data.subordinateAvatars && data.subordinateAvatars.length > 0;
  const node = useAgentNode({
    id,
    data,
    extraHeight: hasSubordinates ? 24 : 0,
  });
  const { currentW, currentH, style, setIsSettingsOpen } = node;
  const autoExploreEnabled = data.agent?.auto_explore_enabled ?? false;

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
            <div className="absolute inset-0.5 rounded-3xl bg-white dark:bg-neutral-900" />
          </motion.div>
        )}

        {/* ── Static decorations — CEO only ── */}

        {/* Card Background — pure white to stand out from warm canvas */}
        <div
          className={cn(
            "absolute inset-0 rounded-3xl backdrop-blur-xl transition-colors -z-10",
            "bg-white dark:bg-neutral-900/80 border border-white/80 dark:border-amber-500/25 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.06)] dark:shadow-none",
            selected
              ? "ring-2 ring-[#5a6e8c]/20 dark:ring-0 dark:border-indigo-400/50 dark:shadow-[0_0_15px_rgba(99,102,241,0.5),0_0_30px_rgba(168,85,247,0.3)] shadow-2xl"
              : "hover:shadow-2xl",
            data.isRunning &&
              "shadow-[0_0_20px_rgba(99,102,241,0.25),0_0_40px_rgba(168,85,247,0.15)] dark:shadow-[0_0_15px_rgba(99,102,241,0.5),0_0_30px_rgba(168,85,247,0.3)]",
            data.isFocused &&
              "ring-0 border-white/20! dark:border-white/10! shadow-none! bg-white/95 dark:bg-black/80",
          )}
        />

        {/* Art Deco pattern overlay */}
        <div className="pointer-events-none absolute inset-0 rounded-3xl overflow-hidden -z-5">
          {/* Light: gold Art Deco */}
          <div
            className="absolute inset-0 dark:hidden"
            style={{
              backgroundImage: patternUrlLight,
              backgroundSize: "60px 60px",
            }}
          />
          {/* Dark: white Art Deco */}
          <div
            className="absolute inset-0 hidden dark:block"
            style={{ backgroundImage: patternUrl, backgroundSize: "60px 60px" }}
          />
        </div>

        {/* ── Content ── */}
        <div className="relative z-10 w-full h-full p-4 flex flex-col overflow-hidden rounded-3xl">
          {/* Warm gold wash across content — visible tint */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#c9a84c]/[0.04] via-transparent to-blue-200/[0.03] dark:from-amber-900/15 dark:via-transparent dark:to-amber-800/10" />

          {/* Gold light beams */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-10 -left-10 w-[120%] h-16 rotate-[25deg] bg-gradient-to-r from-transparent via-[#c9a84c]/[0.07] to-transparent dark:via-amber-500/[0.07]" />
            <div className="absolute top-8 -left-10 w-[120%] h-10 rotate-[25deg] bg-gradient-to-r from-transparent via-[#c9a84c]/[0.05] to-transparent dark:via-amber-500/[0.04]" />
          </div>

          {/* Top-right actions */}
          <div className="absolute right-3 top-3 z-50 flex items-center gap-1">
            <button
              className="rounded-full bg-white/50 p-1.5 text-neutral-500 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white hover:text-indigo-600 dark:bg-black/20 dark:text-neutral-400 dark:hover:bg-black/40 dark:hover:text-indigo-400"
              onClick={(e) => {
                e.stopPropagation();
                setIsSettingsOpen(true);
              }}
            >
              <Cog6ToothIcon className="h-4 w-4" />
            </button>
            {data.onAutoExploreToggle && (
              <button
                title={t("agents.rootAgent.autoExploreHint")}
                className={cn(
                  "rounded-full p-1.5 transition-all duration-300",
                  data.autoExploreLoading && "cursor-not-allowed opacity-40",
                  autoExploreEnabled
                    ? "bg-amber-400/20 text-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.25)] hover:bg-amber-400/30 dark:bg-amber-500/15 dark:text-amber-400 dark:shadow-[0_0_8px_rgba(245,158,11,0.15)]"
                    : "bg-white/40 text-stone-300 hover:bg-white/60 hover:text-stone-400 dark:bg-black/20 dark:text-neutral-600 dark:hover:bg-black/30 dark:hover:text-neutral-500",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!data.autoExploreLoading) {
                    data.onAutoExploreToggle!(!autoExploreEnabled);
                  }
                }}
                disabled={data.autoExploreLoading}
              >
                <Sparkles className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="relative flex items-center gap-3.5 mb-2">
            {/* Avatar with blue-gold ring + Crown emblem */}
            <div
              className={cn(
                "relative shrink-0 avatar-glow",
                data.isFocused && "is-focused",
              )}
            >
              <div className="rounded-full p-[2.5px] bg-gradient-to-br from-[#c9a84c] via-blue-400 to-[#c9a84c] dark:from-amber-500 dark:via-yellow-500 dark:to-amber-600 shadow-md shadow-[#c9a84c]/20 dark:shadow-amber-600/20">
                <img
                  src={data.avatar}
                  className="w-12 h-12 rounded-full bg-gray-200 border-[2.5px] border-white dark:border-neutral-900"
                  alt="avatar"
                  draggable={false}
                />
              </div>
              {/* Crown emblem — gold-to-blue */}
              <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#c9a84c] via-blue-500 to-[#c9a84c] border-[2.5px] border-white dark:border-neutral-900 shadow-md shadow-[#c9a84c]/20 dark:shadow-amber-400/30">
                <Crown className="h-3 w-3 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.15)]" />
              </div>
            </div>

            {/* Name + CEO badge */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-[17px] leading-tight bg-gradient-to-r from-[#8a7235] via-[#c9a84c] to-[#8a7235] dark:from-amber-200 dark:via-yellow-300 dark:to-amber-200 bg-clip-text text-transparent truncate">
                  {data.name}
                </span>
                {/* CEO badge — blue */}
                <span className="shrink-0 flex items-center gap-0.5 rounded-md bg-gradient-to-b from-blue-500 to-indigo-600 dark:from-amber-500 dark:to-amber-600 px-1.5 py-0.5 shadow-sm shadow-blue-400/15">
                  <Crown className="h-2.5 w-2.5 text-white/90" />
                  <span className="text-[8px] font-bold uppercase tracking-widest text-white">
                    CEO
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-stone-500 dark:text-amber-300/50 font-medium truncate">
                  {data.role}
                </span>
                {data.lastConversationTime && (
                  <span className="text-[10px] text-stone-400 dark:text-amber-400/40 shrink-0">
                    · {formatTime(data.lastConversationTime)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Subordinate agents */}
          {data.subordinateAvatars && data.subordinateAvatars.length > 0 && (
            <div className="relative flex items-center gap-1.5 mb-2 px-0.5">
              <div className="absolute top-1/2 left-3 right-3 h-px bg-gradient-to-r from-[#c9a84c]/25 via-blue-300/20 to-[#c9a84c]/25 dark:from-amber-600/30 dark:via-amber-500/15 dark:to-amber-600/30" />
              <span className="relative z-10 shrink-0 text-[9px] font-medium text-stone-400 dark:text-amber-400/50 bg-white dark:bg-neutral-900 px-1.5 rounded">
                Agents
              </span>
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
                  <div className="w-5 h-5 rounded-full border-[1.5px] border-white dark:border-neutral-800 bg-stone-100 dark:bg-amber-900/40 flex items-center justify-center shadow-sm">
                    <span className="text-[7px] font-bold text-stone-500 dark:text-amber-300">
                      +{data.subordinateAvatars.length - 6}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Stats area */}
          <div className="relative flex-1 min-h-0 rounded-lg overflow-hidden transition-colors border border-[#c9a84c]/15 dark:border-amber-700/20">
            <div className="absolute inset-0 bg-gradient-to-br from-[#c9a84c]/[0.04] via-slate-50/20 to-blue-50/[0.04] dark:from-amber-950/30 dark:via-neutral-900/50 dark:to-amber-950/20" />
            <div
              className="pointer-events-none absolute inset-0 dark:hidden"
              style={{
                backgroundImage: patternUrlLight,
                backgroundSize: "40px 40px",
              }}
            />
            <div
              className="pointer-events-none absolute inset-0 hidden dark:block opacity-60"
              style={{
                backgroundImage: patternUrl,
                backgroundSize: "40px 40px",
              }}
            />
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

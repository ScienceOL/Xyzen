import SessionSettingsModal from "@/components/modals/SessionSettingsModal";
import { cn } from "@/lib/utils";
import {
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import { useReactFlow } from "@xyflow/react";
import { motion } from "framer-motion";
import { useState } from "react";
import type {
  AgentFlowNodeProps,
  AgentStatsDisplay,
  DailyActivityData,
  YesterdaySummaryData,
} from "./types";

// Helper to calc size
// Base unit: 1x1 = 200x160. Gap = 16.
const BASE_W = 200;
const BASE_H = 160;
const GAP = 16;

const getSizeStyle = (w?: number, h?: number, sizeStr?: string) => {
  if (w && h) {
    return {
      width: w * BASE_W + (w - 1) * GAP,
      height: h * BASE_H + (h - 1) * GAP,
    };
  }
  // Fallback map
  if (sizeStr === "large") return { width: 400, height: 320 }; // ~2x2
  if (sizeStr === "medium") return { width: 300, height: 220 }; // ~1.5? old values
  if (sizeStr === "small") return { width: 200, height: 160 }; // 1x1
  return { width: 200, height: 160 };
};

// Format token count for display
const formatTokenCount = (count: number): string => {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
};

// Mini activity chart component for 7-day visualization
function ActivityChart({
  data,
  className,
}: {
  data: DailyActivityData[];
  className?: string;
}) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className={cn("flex gap-1 items-end h-10", className)}>
      {data.map((day, i) => {
        const heightPercent = (day.count / maxCount) * 100;
        const isToday = i === data.length - 1;
        return (
          <div
            key={day.date}
            className={cn(
              "flex-1 rounded-t transition-all",
              isToday
                ? "bg-indigo-500 dark:bg-indigo-400"
                : "bg-indigo-300/60 dark:bg-indigo-600/50",
            )}
            style={{ height: `${Math.max(heightPercent, 8)}%` }}
            title={`${day.date}: ${day.count} messages`}
          />
        );
      })}
    </div>
  );
}

// Yesterday summary bubble
function YesterdayBubble({
  summary,
  className,
}: {
  summary?: YesterdaySummaryData;
  className?: string;
}) {
  if (!summary) return null;

  const hasActivity = summary.messageCount > 0;

  return (
    <div
      className={cn(
        "rounded-xl px-3 py-2 text-xs",
        hasActivity
          ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
          : "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300",
        className,
      )}
    >
      {hasActivity ? (
        <>
          <span className="font-medium">
            昨日聊了 {summary.messageCount} 条
          </span>
          {summary.lastMessagePreview && (
            <p className="mt-1 text-[10px] opacity-80 line-clamp-2">
              "{summary.lastMessagePreview}"
            </p>
          )}
        </>
      ) : (
        <span className="font-medium">你昨天没有和我聊天哟 😢</span>
      )}
    </div>
  );
}

// Stats display component with responsive layout
function StatsDisplay({
  stats,
  gridW,
  gridH,
  dailyActivity,
  yesterdaySummary,
}: {
  stats?: AgentStatsDisplay;
  gridW: number;
  gridH: number;
  dailyActivity?: DailyActivityData[];
  yesterdaySummary?: YesterdaySummaryData;
}) {
  if (!stats) return null;

  const totalTokens = stats.inputTokens + stats.outputTokens;
  const area = gridW * gridH;

  // 1x1: Compact stats with all key metrics
  if (area === 1) {
    return (
      <div className="h-full flex flex-col justify-center px-3 py-2">
        {/* Main stats row */}
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1 text-neutral-600 dark:text-neutral-400">
            <ChatBubbleLeftRightIcon className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
            <span className="font-semibold">{stats.messageCount}</span>
          </div>
          <div className="flex items-center gap-1 text-neutral-600 dark:text-neutral-400">
            <DocumentTextIcon className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
            <span className="font-semibold">{stats.topicCount}</span>
          </div>
        </div>
        {/* Token mini bar */}
        {totalTokens > 0 && (
          <div className="mt-2">
            <div className="h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-blue-500/70 dark:bg-blue-400/70"
                style={{ width: `${(stats.inputTokens / totalTokens) * 100}%` }}
              />
              <div
                className="h-full bg-purple-500/70 dark:bg-purple-400/70"
                style={{
                  width: `${(stats.outputTokens / totalTokens) * 100}%`,
                }}
              />
            </div>
            <div className="text-center text-[9px] text-neutral-500 mt-1 font-mono">
              {formatTokenCount(totalTokens)}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 2x1 horizontal or 1x2 vertical: Full stats with token bar (same layout as 2x2 but compact)
  if (area === 2) {
    const isHorizontal = gridW >= 2;
    return (
      <div
        className={cn(
          "h-full flex p-2.5",
          isHorizontal
            ? "flex-row items-center gap-4"
            : "flex-col justify-center gap-2",
        )}
      >
        {/* Stats */}
        <div
          className={cn(
            "flex gap-3",
            isHorizontal ? "items-center" : "items-center justify-between",
          )}
        >
          <div className="flex items-center gap-1.5">
            <ChatBubbleLeftRightIcon className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
            <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              {stats.messageCount}
            </span>
            <span className="text-[10px] text-neutral-500">msgs</span>
          </div>
          <div className="flex items-center gap-1.5">
            <DocumentTextIcon className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
            <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              {stats.topicCount}
            </span>
            <span className="text-[10px] text-neutral-500">topics</span>
          </div>
        </div>
        {/* Token bar */}
        {totalTokens > 0 && (
          <div className={cn(isHorizontal ? "flex-1 min-w-0" : "w-full")}>
            <div className="h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-blue-500 dark:bg-blue-400"
                style={{ width: `${(stats.inputTokens / totalTokens) * 100}%` }}
              />
              <div
                className="h-full bg-purple-500 dark:bg-purple-400"
                style={{
                  width: `${(stats.outputTokens / totalTokens) * 100}%`,
                }}
              />
            </div>
            <div
              className={cn(
                "text-[9px] text-neutral-500 mt-0.5",
                isHorizontal ? "text-right font-mono" : "flex justify-between",
              )}
            >
              {isHorizontal ? (
                formatTokenCount(totalTokens)
              ) : (
                <>
                  <span>↓{formatTokenCount(stats.inputTokens)}</span>
                  <span>↑{formatTokenCount(stats.outputTokens)}</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 2x2 or larger: Full stats grid with visual bars
  return (
    <div className="p-3 h-full flex flex-col">
      {/* Stats row */}
      <div className="flex items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-1.5">
          <ChatBubbleLeftRightIcon className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
          <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            {stats.messageCount}
          </div>
          <span className="text-[10px] text-neutral-500">msgs</span>
        </div>
        <div className="flex items-center gap-1.5">
          <DocumentTextIcon className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
          <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            {stats.topicCount}
          </div>
          <span className="text-[10px] text-neutral-500">topics</span>
        </div>
      </div>

      {/* Yesterday summary bubble (for 2x2+) */}
      {area >= 4 && (
        <YesterdayBubble summary={yesterdaySummary} className="mb-2" />
      )}

      {/* Daily activity chart (for 2x2+) */}
      {area >= 4 && dailyActivity && dailyActivity.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] text-neutral-500 mb-1">
            7 Day Activity
          </div>
          <ActivityChart data={dailyActivity} />
        </div>
      )}

      {/* Token usage bar */}
      {totalTokens > 0 && (
        <div className="mt-auto">
          <div className="flex items-center justify-between text-[10px] text-neutral-500 mb-1">
            <span>Token Usage</span>
            <span className="font-mono">{formatTokenCount(totalTokens)}</span>
          </div>
          <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-blue-500 dark:bg-blue-400"
              style={{
                width: `${(stats.inputTokens / totalTokens) * 100}%`,
              }}
              title={`Input: ${formatTokenCount(stats.inputTokens)}`}
            />
            <div
              className="h-full bg-purple-500 dark:bg-purple-400"
              style={{
                width: `${(stats.outputTokens / totalTokens) * 100}%`,
              }}
              title={`Output: ${formatTokenCount(stats.outputTokens)}`}
            />
          </div>
          <div className="flex justify-between text-[9px] text-neutral-400 mt-0.5">
            <span>↓ {formatTokenCount(stats.inputTokens)}</span>
            <span>↑ {formatTokenCount(stats.outputTokens)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function AgentNode({ id, data, selected }: AgentFlowNodeProps) {
  const { updateNodeData } = useReactFlow();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // Determine current dim
  const currentW = data.gridSize?.w || (data.size === "large" ? 2 : 1);
  const currentH = data.gridSize?.h || (data.size === "large" ? 2 : 1);

  const style = getSizeStyle(data.gridSize?.w, data.gridSize?.h, data.size);

  const handleResize = (w: number, h: number) => {
    const newSize = w * h > 3 ? "large" : w * h > 1 ? "medium" : "small";

    // Update ReactFlow node data
    updateNodeData(id, {
      gridSize: { w, h },
      size: newSize,
    });

    // Notify parent to persist the layout change
    if (data.onLayoutChange) {
      data.onLayoutChange(id, {
        position: data.position,
        gridSize: { w, h },
        size: newSize,
      });
    }
  };

  const handleAvatarChange = (avatarUrl: string) => {
    // Update local node data
    updateNodeData(id, { avatar: avatarUrl });

    // Notify parent to persist avatar change
    if (data.onAvatarChange) {
      data.onAvatarChange(id, avatarUrl);
    }
  };

  const handleOpenAgentSettings = () => {
    setIsSettingsOpen(false);
    if (data.onOpenAgentSettings && data.agentId) {
      data.onOpenAgentSettings(data.agentId);
    }
  };

  return (
    <>
      <SessionSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        sessionId={data.sessionId || id}
        agentId={data.agentId || id}
        agentName={data.name}
        currentAvatar={data.avatar}
        currentGridSize={data.gridSize || { w: currentW, h: currentH }}
        onAvatarChange={handleAvatarChange}
        onGridSizeChange={handleResize}
        onOpenAgentSettings={
          data.onOpenAgentSettings ? handleOpenAgentSettings : undefined
        }
      />

      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{
          scale: 1,
          opacity: 1,
          width: style.width,
          height: style.height,
        }}
        whileHover={{ scale: 1.02 }} // Increased size slightly reduced to avoid popover issues
        transition={{
          scale: { type: "spring", stiffness: 400, damping: 25 },
          opacity: { duration: 0.2 },
          width: { type: "spring", stiffness: 300, damping: 30 },
          height: { type: "spring", stiffness: 300, damping: 30 },
        }}
        onClick={(e) => {
          // Only trigger focus if we are NOT clicking inside the settings menu interactions
          e.stopPropagation();
          data.onFocus(id);
        }}
        className={cn(
          "relative group rounded-3xl", // Removed bg/border from here
          data.isFocused ? "z-50" : "z-0", // focused node higher z-index
        )}
      >
        {/* IsFocused Glow - BEHIND CARD */}
        {data.isFocused && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute -inset-2 -z-20 rounded-[35px] bg-linear-to-r from-blue-500 via-indigo-500 to-purple-500 opacity-30 blur-xl pointer-events-none"
          />
        )}

        {/* Card Background Layer - Acts as the solid surface */}
        <div
          className={cn(
            "absolute inset-0 rounded-3xl bg-[#fdfcf8] dark:bg-neutral-900/80 backdrop-blur-xl transition-all border border-white/50 dark:border-white/10 -z-10",
            selected
              ? "ring-2 ring-[#5a6e8c]/20 dark:ring-0 dark:border-indigo-400/50 dark:shadow-[0_0_15px_rgba(99,102,241,0.5),0_0_30px_rgba(168,85,247,0.3)] shadow-2xl"
              : "hover:shadow-2xl",
            data.isFocused &&
              "ring-0 border-white/20! dark:border-white/10! shadow-none! bg-white/90 dark:bg-black/80", // Cleaner look when focused
          )}
        />

        {/* Content Container - On Top */}
        <div className="relative z-10 w-full h-full p-4 flex flex-col">
          <div className="absolute right-3 top-3 z-50 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              className="rounded-full bg-white/50 p-1.5 text-neutral-500 hover:bg-white hover:text-indigo-600 dark:bg-black/20 dark:text-neutral-400 dark:hover:bg-black/40 dark:hover:text-indigo-400"
              onClick={(e) => {
                e.stopPropagation();
                setIsSettingsOpen(true);
              }}
            >
              <Cog6ToothIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-3 mb-2">
            <img
              src={data.avatar}
              className="w-10 h-10 rounded-full bg-gray-200 border-2 border-white dark:border-white/20 shadow-sm shrink-0"
              alt="avatar"
              draggable={false}
            />
            <div className="min-w-0">
              <div className="font-bold text-base leading-tight text-neutral-800 dark:text-neutral-100 truncate">
                {data.name}
              </div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400 font-medium truncate">
                {data.role}
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 bg-[#f4f1ea] dark:bg-white/5 rounded-xl relative overflow-hidden group-hover:bg-[#efece5] dark:group-hover:bg-white/10 transition-colors">
            {data.status === "busy" && (
              <div className="absolute top-2 right-2 flex items-center gap-1 bg-white/90 dark:bg-black/60 px-2 py-1 rounded-full text-[10px] font-medium text-amber-600 dark:text-amber-400 shadow-sm z-10 transition-colors">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Processing
              </div>
            )}

            <div className="absolute inset-0 opacity-30 bg-linear-to-br from-transparent to-black/5 dark:to-black/30 pointer-events-none" />

            {/* Stats Display - Responsive to grid size */}
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

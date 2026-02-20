/**
 * Shared utilities, sub-components, and hooks used by AgentNode and RootAgentNode.
 */
import AgentSettingsModal from "@/components/modals/AgentSettingsModal";
import { cn } from "@/lib/utils";
import {
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import { useReactFlow } from "@xyflow/react";
import { useState } from "react";
import type {
  AgentFlowNodeProps,
  AgentStatsDisplay,
  DailyActivityData,
  YesterdaySummaryData,
} from "./types";

// ── Size helpers ──────────────────────────────────────────────

const BASE_W = 200;
const BASE_H = 160;
const GAP = 16;

export const getSizeStyle = (w?: number, h?: number, sizeStr?: string) => {
  if (w && h) {
    return {
      width: w * BASE_W + (w - 1) * GAP,
      height: h * BASE_H + (h - 1) * GAP,
    };
  }
  if (sizeStr === "large") return { width: 400, height: 320 };
  if (sizeStr === "medium") return { width: 300, height: 220 };
  if (sizeStr === "small") return { width: 200, height: 160 };
  return { width: 200, height: 160 };
};

// ── Format helpers ────────────────────────────────────────────

export const formatTokenCount = (count: number): string => {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
};

// ── Sub-components ────────────────────────────────────────────

export function ActivityChart({
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

export function YesterdayBubble({
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
        "rounded-sm px-3 py-2 text-xs",
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

export function StatsDisplay({
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

  // 1x1: Compact stats
  if (area === 1) {
    return (
      <div className="h-full flex flex-col justify-center px-3 py-2">
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

  // 2x1 / 1x2
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

  // 2x2+
  return (
    <div className="p-3 h-full flex flex-col">
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

      {area >= 4 && (
        <YesterdayBubble summary={yesterdaySummary} className="mb-2" />
      )}

      {area >= 4 && dailyActivity && dailyActivity.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] text-neutral-500 mb-1">
            7 Day Activity
          </div>
          <ActivityChart data={dailyActivity} />
        </div>
      )}

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

// ── Settings gear button ──────────────────────────────────────

export function SettingsGearButton({
  onClick,
  className,
}: {
  onClick: (e: React.MouseEvent) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "absolute right-3 top-3 z-50 opacity-0 transition-opacity group-hover:opacity-100",
        className,
      )}
    >
      <button
        className="rounded-full bg-white/50 p-1.5 text-neutral-500 hover:bg-white hover:text-indigo-600 dark:bg-black/20 dark:text-neutral-400 dark:hover:bg-black/40 dark:hover:text-indigo-400"
        onClick={onClick}
      >
        <Cog6ToothIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Hook: shared node logic ───────────────────────────────────

export function useAgentNode({
  id,
  data,
}: Pick<AgentFlowNodeProps, "id" | "data">) {
  const { updateNodeData } = useReactFlow();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const currentW = data.gridSize?.w || (data.size === "large" ? 2 : 1);
  const currentH = data.gridSize?.h || (data.size === "large" ? 2 : 1);
  const style = getSizeStyle(data.gridSize?.w, data.gridSize?.h, data.size);

  const handleResize = (w: number, h: number) => {
    const newSize = w * h > 3 ? "large" : w * h > 1 ? "medium" : "small";
    updateNodeData(id, { gridSize: { w, h }, size: newSize });
    if (data.onLayoutChange) {
      data.onLayoutChange(id, {
        position: data.position,
        gridSize: { w, h },
        size: newSize,
      });
    }
  };

  const handleAvatarChange = (avatarUrl: string) => {
    updateNodeData(id, { avatar: avatarUrl });
    if (data.onAvatarChange) {
      data.onAvatarChange(id, avatarUrl);
    }
  };

  const handleDelete = () => {
    if (data.onDelete && data.agentId) {
      data.onDelete(data.agentId);
    }
  };

  return {
    isSettingsOpen,
    setIsSettingsOpen,
    currentW,
    currentH,
    style,
    handleResize,
    handleAvatarChange,
    handleDelete,
  };
}

// ── Settings modal wrapper ────────────────────────────────────

export function NodeSettingsModal({
  id,
  data,
  isSettingsOpen,
  setIsSettingsOpen,
  currentW,
  currentH,
  handleAvatarChange,
  handleResize,
  handleDelete,
}: ReturnType<typeof useAgentNode> & {
  id: string;
  data: AgentFlowNodeProps["data"];
}) {
  return (
    <AgentSettingsModal
      isOpen={isSettingsOpen}
      onClose={() => setIsSettingsOpen(false)}
      sessionId={data.sessionId || id}
      agentId={data.agentId || id}
      agentName={data.name}
      agent={data.agent}
      currentAvatar={data.avatar}
      currentGridSize={data.gridSize || { w: currentW, h: currentH }}
      onAvatarChange={handleAvatarChange}
      onGridSizeChange={handleResize}
      onDelete={
        data.onDelete && !data.isMarketplacePublished ? handleDelete : undefined
      }
    />
  );
}

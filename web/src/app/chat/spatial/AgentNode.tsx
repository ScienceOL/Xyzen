import { Modal } from "@/components/animate-ui/components/animate/modal";
import { cn } from "@/lib/utils";
import {
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import { useReactFlow } from "@xyflow/react";
import { motion } from "framer-motion";
import { useState } from "react";
import type { AgentFlowNodeProps, AgentStatsDisplay } from "./types";

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

// Stats display component with responsive layout
function StatsDisplay({
  stats,
  gridW,
  gridH,
}: {
  stats?: AgentStatsDisplay;
  gridW: number;
  gridH: number;
}) {
  if (!stats) return null;

  const totalTokens = stats.inputTokens + stats.outputTokens;
  const hasActivity = stats.messageCount > 0 || stats.topicCount > 0;
  const area = gridW * gridH;

  // Compact 1x1: Only show message count as badge
  if (area === 1) {
    if (!hasActivity) return null;
    return (
      <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-white/80 dark:bg-black/60 px-2 py-1 rounded-full text-[10px] font-medium text-neutral-600 dark:text-neutral-300 shadow-sm">
        <ChatBubbleLeftRightIcon className="w-3 h-3" />
        {stats.messageCount}
      </div>
    );
  }

  // 2x1 horizontal: Compact inline stats
  if (gridW >= 2 && gridH === 1) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 text-[11px]">
        <div className="flex items-center gap-1 text-neutral-600 dark:text-neutral-400">
          <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" />
          <span className="font-medium">{stats.messageCount}</span>
        </div>
        <div className="flex items-center gap-1 text-neutral-600 dark:text-neutral-400">
          <DocumentTextIcon className="w-3.5 h-3.5" />
          <span className="font-medium">{stats.topicCount}</span>
        </div>
        {totalTokens > 0 && (
          <div className="ml-auto text-neutral-500 dark:text-neutral-500 font-mono">
            {formatTokenCount(totalTokens)} tokens
          </div>
        )}
      </div>
    );
  }

  // 1x2 vertical: Stacked stats
  if (gridW === 1 && gridH >= 2) {
    return (
      <div className="flex flex-col gap-2 p-3 text-[11px]">
        <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
          <ChatBubbleLeftRightIcon className="w-4 h-4" />
          <span className="font-medium">{stats.messageCount} messages</span>
        </div>
        <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
          <DocumentTextIcon className="w-4 h-4" />
          <span className="font-medium">{stats.topicCount} topics</span>
        </div>
        {totalTokens > 0 && (
          <div className="text-neutral-500 dark:text-neutral-500 font-mono mt-1 text-[10px]">
            {formatTokenCount(totalTokens)} tokens
          </div>
        )}
      </div>
    );
  }

  // 2x2 or larger: Full stats grid with visual bars
  return (
    <div className="p-3 h-full flex flex-col">
      {/* Stats row */}
      <div className="flex items-center justify-between gap-4 mb-3">
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

      {/* Activity visualization for larger sizes */}
      {area >= 6 && hasActivity && (
        <div className="mt-3 flex gap-1.5 items-end h-12 justify-around opacity-70">
          {Array.from({ length: Math.min(stats.topicCount + 2, 8) }).map(
            (_, i) => (
              <div
                key={i}
                className="w-4 bg-indigo-400/60 dark:bg-indigo-500/50 rounded-t-sm"
                style={{
                  height: `${Math.min(30 + Math.random() * 70, 100)}%`,
                  opacity: 0.4 + i * 0.08,
                }}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function GridResizer({
  currentW = 1,
  currentH = 1,
  onResize,
}: {
  currentW?: number;
  currentH?: number;
  onResize: (w: number, h: number) => void;
}) {
  const [hover, setHover] = useState<{ w: number; h: number } | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-neutral-600 dark:text-neutral-400">
        Adjust the grid size of this agent widget.
      </div>
      <div className="flex justify-center">
        <div
          className="grid grid-cols-3 gap-2"
          onMouseLeave={() => setHover(null)}
        >
          {Array.from({ length: 9 }).map((_, i) => {
            const x = (i % 3) + 1;
            const y = Math.floor(i / 3) + 1;
            const isHovered = hover && x <= hover.w && y <= hover.h;
            const isSelected = !hover && x <= currentW && y <= currentH;

            return (
              <div
                key={i}
                className={cn(
                  "h-12 w-12 cursor-pointer rounded-md border-2 transition-all duration-200",
                  isHovered || isSelected
                    ? "border-indigo-500 bg-indigo-500/20 dark:border-indigo-400 dark:bg-indigo-400/20"
                    : "border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800",
                )}
                onMouseEnter={() => setHover({ w: x, h: y })}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onResize(x, y);
                }}
              />
            );
          })}
        </div>
      </div>
      <div className="text-center text-sm font-medium text-neutral-900 dark:text-neutral-100 h-5">
        {hover ? `${hover.w} x ${hover.h}` : `${currentW} x ${currentH}`}
      </div>
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

  return (
    <>
      <Modal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        title="Widget Settings"
        maxWidth="max-w-xs"
      >
        <GridResizer
          currentW={currentW}
          currentH={currentH}
          onResize={(w, h) => {
            updateNodeData(id, {
              gridSize: { w, h },
              size: w * h > 3 ? "large" : w * h > 1 ? "medium" : "small",
            });
            // Optional: Close modal after selection if desired, or keep open
            // setIsSettingsOpen(false);
          }}
        />
      </Modal>

      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.02 }} // Increased size slightly reduced to avoid popover issues
        style={style}
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
              <div className="font-bold text-lg leading-tight text-neutral-800 dark:text-neutral-100 truncate">
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
            />
          </div>
        </div>
      </motion.div>
    </>
  );
}

import { Modal } from "@/components/animate-ui/components/animate/modal";
import { cn } from "@/lib/utils";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";
import type { Node } from "@xyflow/react";
import { NodeProps, useReactFlow } from "@xyflow/react";
import { motion } from "framer-motion";
import { useState } from "react";
import type { FlowAgentNodeData } from "./types";

type AgentFlowNode = Node<FlowAgentNodeData, "agent">;

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

export function AgentNode({ id, data, selected }: NodeProps<AgentFlowNode>) {
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
            className="absolute -inset-4 -z-20 rounded-[35px] bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 opacity-30 blur-xl pointer-events-none"
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
              "ring-0 !border-white/20 dark:!border-white/10 !shadow-none bg-white/90 dark:bg-black/80", // Cleaner look when focused
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

          <div className="flex items-center gap-3 mb-4">
            <img
              src={data.avatar}
              className="w-10 h-10 rounded-full bg-gray-200 border-2 border-white dark:border-white/20 shadow-sm"
              alt="avatar"
              draggable={false}
            />
            <div>
              <div className="font-bold text-lg leading-tight text-neutral-800 dark:text-neutral-100">
                {data.name}
              </div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
                {data.role}
              </div>
            </div>
          </div>

          <div className="flex-1 h-full bg-[#f4f1ea] dark:bg-white/5 rounded-xl relative overflow-hidden group-hover:bg-[#efece5] dark:group-hover:bg-white/10 transition-colors">
            {data.status === "busy" && (
              <div className="absolute top-2 right-2 flex items-center gap-1 bg-white/90 dark:bg-black/60 px-2 py-1 rounded-full text-[10px] font-medium text-amber-600 dark:text-amber-400 shadow-sm z-10 transition-colors">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Processing
              </div>
            )}

            <div className="absolute inset-0 opacity-30 bg-linear-to-br from-transparent to-black/5 dark:to-black/30 pointer-events-none" />

            {/* Dynamic Abstract Viz based on size */}
            {((data.gridSize && data.gridSize.w * data.gridSize.h >= 2) ||
              data.size === "large" ||
              data.size === "medium") && (
              <div className="p-4 pt-6 h-full flex flex-col justify-end pb-0">
                <div className="flex gap-2 items-end h-20 w-full justify-around opacity-80">
                  {[40, 70, 55, 90, 60, 80]
                    .slice(0, currentW * currentH + 2)
                    .map((h, i) => (
                      <div
                        key={i}
                        className="w-6 bg-[#5a6e8c] dark:bg-indigo-400 rounded-t-sm"
                        style={{ height: `${h}%`, opacity: 0.5 + i * 0.1 }}
                      />
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}

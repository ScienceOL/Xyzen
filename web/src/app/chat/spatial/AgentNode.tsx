import { cn } from "@/lib/utils";
import type { Node } from "@xyflow/react";
import { NodeProps } from "@xyflow/react";
import { motion } from "framer-motion";
import type { FlowAgentNodeData } from "./types";

type AgentFlowNode = Node<FlowAgentNodeData, "agent">;

export function AgentNode({ id, data, selected }: NodeProps<AgentFlowNode>) {
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.05 }}
      onClick={(e) => {
        e.stopPropagation();
        data.onFocus(id);
      }}
      className={cn(
        "relative rounded-3xl bg-[#fdfcf8] dark:bg-neutral-900/60 shadow-xl transition-all border border-white/50 dark:border-white/10 backdrop-blur-md group",
        selected
          ? "ring-2 ring-[#5a6e8c]/20 dark:ring-0 dark:border-indigo-400/50 dark:shadow-[0_0_15px_rgba(99,102,241,0.5),0_0_30px_rgba(168,85,247,0.3)] shadow-2xl"
          : "hover:shadow-2xl",
        data.size === "large"
          ? "w-100 h-80 p-6"
          : data.size === "medium"
            ? "w-75 h-55 p-6"
            : "w-50 h-40 p-4",
      )}
    >
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

      {/* Content Placeholder */}
      <div className="flex-1 h-[calc(100%-60px)] bg-[#f4f1ea] dark:bg-white/5 rounded-xl relative overflow-hidden group-hover:bg-[#efece5] dark:group-hover:bg-white/10 transition-colors">
        {data.status === "busy" && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-white/90 dark:bg-black/60 px-2 py-1 rounded-full text-[10px] font-medium text-amber-600 dark:text-amber-400 shadow-sm z-10 transition-colors">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Processing
          </div>
        )}

        <div className="absolute inset-0 opacity-30 bg-linear-to-br from-transparent to-black/5 dark:to-black/30 pointer-events-none" />

        {/* Abstract Data Viz for large cards */}
        {data.size === "large" && (
          <div className="p-4 pt-6 h-full flex flex-col justify-end pb-0">
            <div className="flex gap-2 items-end h-20 w-full justify-around opacity-80">
              {[40, 70, 55, 90, 60, 80].map((h, i) => (
                <div
                  key={i}
                  className="w-6 bg-[#5a6e8c] dark:bg-indigo-400 rounded-t-sm"
                  style={{ height: `${h}%`, opacity: 0.5 + i * 0.1 }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Abstract Text for medium cards */}
        {data.size === "medium" && (
          <div className="p-4 space-y-2">
            <div className="h-2 w-3/4 bg-neutral-300/50 dark:bg-white/20 rounded" />
            <div className="h-2 w-1/2 bg-neutral-300/50 dark:bg-white/20 rounded" />
            <div className="h-2 w-full bg-neutral-300/50 dark:bg-white/20 rounded" />
          </div>
        )}
      </div>
    </motion.div>
  );
}

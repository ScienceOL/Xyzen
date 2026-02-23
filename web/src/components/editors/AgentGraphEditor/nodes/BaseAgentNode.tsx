import type { LLMNodeConfig, ToolNodeConfig } from "@/types/graphConfig";
import { getNodeTypeInfo } from "@/types/graphConfig";
import {
  ArrowPathIcon,
  PuzzlePieceIcon,
  SparklesIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { FunnelIcon } from "@heroicons/react/16/solid";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import type { AgentNode } from "../useGraphConfig";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  sparkles: SparklesIcon,
  wrench: WrenchScrewdriverIcon,
  "arrows-exchange": ArrowPathIcon,
  puzzle: PuzzlePieceIcon,
};

/**
 * Base agent node component for the visual graph editor.
 * Displays node type, name, reads/writes indicators, and connection handles.
 */
function BaseAgentNode({ data, selected }: NodeProps<AgentNode>) {
  const nodeData = data;
  const typeInfo = getNodeTypeInfo(nodeData.nodeType);
  const IconComponent = iconMap[typeInfo.icon] || SparklesIcon;

  const { reads, writes } = nodeData.config;
  const hasReadsWrites =
    (reads && reads.length > 0) || (writes && writes.length > 0);

  // Check for tool_filter on LLM / Tool nodes
  const toolFilter =
    (nodeData.nodeType === "llm" || nodeData.nodeType === "tool") &&
    nodeData.config.config
      ? ((nodeData.config.config as LLMNodeConfig | ToolNodeConfig)
          .tool_filter ?? null)
      : null;

  return (
    <div
      className={`
        min-w-35 rounded-lg border-2 bg-white shadow-md
        transition-all duration-200
        dark:bg-neutral-800
        ${selected ? "ring-2 ring-offset-2 ring-indigo-500 dark:ring-offset-neutral-900" : ""}
      `}
      style={{ borderColor: typeInfo.color }}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3! h-3! bg-neutral-400! border-2! border-white! dark:border-neutral-800!"
      />

      {/* Header with type badge */}
      <div
        className="flex items-center gap-1.5 rounded-t-md px-3 py-1.5 text-xs font-medium text-white"
        style={{ backgroundColor: typeInfo.color }}
      >
        <IconComponent className="h-3.5 w-3.5" />
        <span className="flex-1">{typeInfo.label}</span>
        {/* Tool filter badge */}
        {toolFilter && toolFilter.length > 0 && (
          <span className="flex items-center gap-0.5 rounded-full bg-white/20 px-1 py-0.5 text-[9px]">
            <FunnelIcon className="h-2.5 w-2.5" />
            {toolFilter.length}
          </span>
        )}
      </div>

      {/* Node name */}
      <div className="px-3 py-2">
        <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-200">
          {nodeData.label}
        </p>
        {nodeData.config.description && (
          <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
            {nodeData.config.description}
          </p>
        )}
      </div>

      {/* Reads / Writes indicators */}
      {hasReadsWrites && (
        <>
          <div className="mx-3 border-t border-neutral-100 dark:border-neutral-700" />
          <div className="space-y-0.5 px-3 py-1.5">
            {reads && reads.length > 0 && (
              <p className="truncate text-[10px] text-neutral-400 dark:text-neutral-500">
                <span className="font-medium">R:</span> {reads.join(", ")}
              </p>
            )}
            {writes && writes.length > 0 && (
              <p className="truncate text-[10px] text-neutral-400 dark:text-neutral-500">
                <span className="font-medium">W:</span> {writes.join(", ")}
              </p>
            )}
          </div>
        </>
      )}

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-3! h-3! bg-neutral-400! border-2! border-white! dark:border-neutral-800!"
      />
    </div>
  );
}

export default memo(BaseAgentNode);

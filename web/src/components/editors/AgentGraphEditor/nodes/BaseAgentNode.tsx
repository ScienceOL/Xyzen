import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AgentNode } from "../useGraphConfig";
import { getNodeTypeInfo } from "@/types/graphConfig";
import {
  SparklesIcon,
  WrenchScrewdriverIcon,
  ArrowsRightLeftIcon,
  UserGroupIcon,
  ArrowPathIcon,
  Squares2X2Icon,
  UserIcon,
} from "@heroicons/react/24/outline";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  sparkles: SparklesIcon,
  wrench: WrenchScrewdriverIcon,
  "arrows-split": ArrowsRightLeftIcon,
  "user-group": UserGroupIcon,
  "arrows-exchange": ArrowPathIcon,
  "arrows-parallel": Squares2X2Icon,
  user: UserIcon,
};

/**
 * Base agent node component for the visual graph editor.
 * Displays node type, name, and connection handles.
 */
function BaseAgentNode({ data, selected }: NodeProps<AgentNode>) {
  const nodeData = data;
  const typeInfo = getNodeTypeInfo(nodeData.nodeType);
  const IconComponent = iconMap[typeInfo.icon] || SparklesIcon;

  return (
    <div
      className={`
        min-w-[140px] rounded-lg border-2 bg-white shadow-md
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
        className="!w-3 !h-3 !bg-neutral-400 !border-2 !border-white dark:!border-neutral-800"
      />

      {/* Header with type badge */}
      <div
        className="px-3 py-1.5 rounded-t-md text-white text-xs font-medium flex items-center gap-1.5"
        style={{ backgroundColor: typeInfo.color }}
      >
        <IconComponent className="w-3.5 h-3.5" />
        <span>{typeInfo.label}</span>
      </div>

      {/* Node name */}
      <div className="px-3 py-2">
        <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">
          {nodeData.label}
        </p>
        {nodeData.config.description && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
            {nodeData.config.description}
          </p>
        )}
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-neutral-400 !border-2 !border-white dark:!border-neutral-800"
      />
    </div>
  );
}

export default memo(BaseAgentNode);

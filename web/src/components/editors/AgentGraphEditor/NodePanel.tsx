import { memo, type DragEvent } from "react";
import type { NodeType } from "@/types/graphConfig";
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

interface IconProps {
  className?: string;
  style?: React.CSSProperties;
}

const iconMap: Record<string, React.ComponentType<IconProps>> = {
  sparkles: SparklesIcon,
  wrench: WrenchScrewdriverIcon,
  "arrows-split": ArrowsRightLeftIcon,
  "user-group": UserGroupIcon,
  "arrows-exchange": ArrowPathIcon,
  "arrows-parallel": Squares2X2Icon,
  user: UserIcon,
};

const nodeTypes: NodeType[] = [
  "llm",
  "tool",
  "router",
  "subagent",
  "transform",
  // "parallel", // Placeholder - not fully implemented
  // "human",    // Future feature
];

interface NodePanelItemProps {
  type: NodeType;
}

function NodePanelItem({ type }: NodePanelItemProps) {
  const info = getNodeTypeInfo(type);
  const IconComponent = iconMap[info.icon] || SparklesIcon;

  const onDragStart = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData("application/agentnode", type);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="
        flex items-center gap-2 px-3 py-2 rounded-md cursor-grab
        bg-white border border-neutral-200 shadow-sm
        hover:shadow-md hover:border-neutral-300
        active:cursor-grabbing active:shadow-lg
        transition-all duration-150
        dark:bg-neutral-800 dark:border-neutral-700 dark:hover:border-neutral-600
      "
      title={info.description}
    >
      <div
        className="w-6 h-6 rounded flex items-center justify-center"
        style={{ backgroundColor: `${info.color}20` }}
      >
        <IconComponent className="w-4 h-4" style={{ color: info.color }} />
      </div>
      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {info.label}
      </span>
    </div>
  );
}

interface NodePanelProps {
  className?: string;
}

/**
 * Panel showing available node types that can be dragged onto the canvas.
 */
function NodePanel({ className = "" }: NodePanelProps) {
  return (
    <div
      className={`
        p-3 rounded-lg bg-neutral-50 border border-neutral-200
        dark:bg-neutral-900 dark:border-neutral-700
        ${className}
      `}
    >
      <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">
        Add Nodes
      </h3>
      <p className="text-xs text-neutral-400 dark:text-neutral-500 mb-3">
        Drag to canvas
      </p>
      <div className="flex flex-wrap gap-2">
        {nodeTypes.map((type) => (
          <NodePanelItem key={type} type={type} />
        ))}
      </div>
    </div>
  );
}

export default memo(NodePanel);

import type { NodeType } from "@/types/graphConfig";
import { getNodeTypeInfo } from "@/types/graphConfig";
import {
  Popover,
  PopoverButton,
  PopoverPanel,
  Transition,
} from "@headlessui/react";
import {
  ArrowPathIcon,
  ArrowsRightLeftIcon,
  PlusIcon,
  SparklesIcon,
  Squares2X2Icon,
  UserGroupIcon,
  UserIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { Fragment, memo, type DragEvent } from "react";

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
        bg-white border border-neutral-200
        hover:bg-neutral-50 hover:border-neutral-300
        active:cursor-grabbing active:bg-neutral-100
        transition-all duration-150
        dark:bg-neutral-800 dark:border-neutral-700
        dark:hover:bg-neutral-700 dark:hover:border-neutral-500
        dark:active:bg-neutral-600
      "
      title={info.description}
    >
      <div
        className="w-5 h-5 rounded flex items-center justify-center"
        style={{ backgroundColor: `${info.color}20` }}
      >
        <IconComponent className="w-3.5 h-3.5" style={{ color: info.color }} />
      </div>
      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
        {info.label}
      </span>
    </div>
  );
}

interface NodePanelProps {
  className?: string;
}

/**
 * Compact toolbar with popover for adding nodes.
 * Nodes can be dragged from the popover onto the canvas.
 */
function NodePanel({ className = "" }: NodePanelProps) {
  return (
    <div className={`flex items-center ${className}`}>
      <Popover className="relative">
        <PopoverButton
          className="
            flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
            bg-white border border-neutral-200 text-neutral-700
            hover:bg-neutral-50 hover:border-neutral-300
            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1
            dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-300
            dark:hover:bg-neutral-700 dark:hover:border-neutral-500
            dark:focus:ring-offset-neutral-900
            transition-colors
          "
        >
          <PlusIcon className="w-4 h-4" />
          <span>Add Node</span>
        </PopoverButton>

        <Transition
          as={Fragment}
          enter="transition ease-out duration-200"
          enterFrom="opacity-0 translate-y-1"
          enterTo="opacity-100 translate-y-0"
          leave="transition ease-in duration-150"
          leaveFrom="opacity-100 translate-y-0"
          leaveTo="opacity-0 translate-y-1"
        >
          <PopoverPanel
            className="
              absolute left-0 z-50 mt-2 w-48
              bg-white rounded-lg shadow-lg border border-neutral-200
              dark:bg-neutral-800 dark:border-neutral-700
            "
          >
            <div className="p-2">
              <p className="text-[10px] text-neutral-400 dark:text-neutral-500 mb-2 px-1">
                Drag to canvas
              </p>
              <div className="flex flex-col gap-1">
                {nodeTypes.map((type) => (
                  <NodePanelItem key={type} type={type} />
                ))}
              </div>
            </div>
          </PopoverPanel>
        </Transition>
      </Popover>
    </div>
  );
}

export default memo(NodePanel);

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { PlayIcon } from "@heroicons/react/24/solid";
import type { AgentNode } from "../useGraphConfig";

/**
 * START node - the entry point of the graph.
 * Only has an output handle.
 */
function StartNode({ selected }: NodeProps<AgentNode>) {
  return (
    <div
      className={`
        w-16 h-16 rounded-full bg-emerald-500
        flex items-center justify-center
        shadow-lg shadow-emerald-500/30
        transition-all duration-200
        ${selected ? "ring-4 ring-offset-2 ring-emerald-400 dark:ring-offset-neutral-900" : ""}
      `}
    >
      <PlayIcon className="w-6 h-6 text-white ml-0.5" />

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-emerald-300 !border-2 !border-white"
      />
    </div>
  );
}

export default memo(StartNode);

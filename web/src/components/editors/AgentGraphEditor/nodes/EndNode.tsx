import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { StopIcon } from "@heroicons/react/24/solid";
import type { AgentNode } from "../useGraphConfig";

/**
 * END node - the exit point of the graph.
 * Only has an input handle.
 */
function EndNode({ selected }: NodeProps<AgentNode>) {
  return (
    <div
      className={`
        w-16 h-16 rounded-full bg-rose-500
        flex items-center justify-center
        shadow-lg shadow-rose-500/30
        transition-all duration-200
        ${selected ? "ring-4 ring-offset-2 ring-rose-400 dark:ring-offset-neutral-900" : ""}
      `}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-rose-300 !border-2 !border-white"
      />

      <StopIcon className="w-6 h-6 text-white" />
    </div>
  );
}

export default memo(EndNode);

import { XMarkIcon } from "@heroicons/react/16/solid";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import { memo, useState } from "react";
import type { AgentEdge } from "../useGraphConfig";

/**
 * Default edge with hover-reveal delete button at midpoint.
 * Uses smooth step path for clean grid-aligned routing.
 */
function DefaultEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
}: EdgeProps<AgentEdge>) {
  const [hovered, setHovered] = useState(false);
  const { deleteElements } = useReactFlow();

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      {/* Invisible wider hit area for hover */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: hovered ? 3 : 2,
          stroke: hovered ? "rgb(115, 115, 115)" : "rgb(163, 163, 163)",
          transition: "stroke-width 0.15s, stroke 0.15s",
        }}
      />
      {hovered && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="nodrag nopan pointer-events-auto absolute flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white shadow-sm transition-transform hover:scale-110"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            onClick={(e) => {
              e.stopPropagation();
              deleteElements({ edges: [{ id }] });
            }}
          >
            <XMarkIcon className="h-3 w-3" />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(DefaultEdge);

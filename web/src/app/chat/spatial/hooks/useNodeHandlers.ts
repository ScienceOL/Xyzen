import type { AgentSpatialLayout } from "@/types/agents";
import { useCallback } from "react";
import type { AgentFlowNode, FlowAgentNodeData } from "../types";
import { calculateNodeSize } from "../utils/nodeUtils";
import {
  resolveAllOverlaps,
  resolveDraggedNodeOverlaps,
} from "../utils/overlapUtils";

interface UseNodeHandlersOptions {
  getNode: (id: string) => AgentFlowNode | undefined;
  setNodes: React.Dispatch<React.SetStateAction<AgentFlowNode[]>>;
  scheduleSave: (agentId: string, layout: AgentSpatialLayout) => void;
  updateAgentAvatar: (agentId: string, avatarUrl: string) => Promise<void>;
  deleteAgent: (agentId: string) => Promise<void>;
}

/**
 * Hook to manage node interaction handlers (layout change, drag, delete, avatar)
 */
export function useNodeHandlers({
  getNode,
  setNodes,
  scheduleSave,
  updateAgentAvatar,
  deleteAgent,
}: UseNodeHandlersOptions) {
  const handleLayoutChange = useCallback(
    (id: string, layout: AgentSpatialLayout) => {
      const getNodeSize = (nodeId: string, newLayout?: AgentSpatialLayout) => {
        if (newLayout && nodeId === id) {
          return calculateNodeSize(newLayout.gridSize, newLayout.size);
        }
        const node = getNode(nodeId);
        const measuredW = node?.measured?.width;
        const measuredH = node?.measured?.height;
        if (measuredW && measuredH) return { w: measuredW, h: measuredH };

        const d = node?.data as FlowAgentNodeData | undefined;
        return calculateNodeSize(d?.gridSize, d?.size);
      };

      setNodes((prev) => {
        const nodeRects = prev.map((n) => ({
          id: n.id,
          position: { ...n.position },
          size: getNodeSize(n.id, n.id === id ? layout : undefined),
        }));

        const changes = resolveAllOverlaps(nodeRects, id);

        if (changes.size === 0) return prev;

        const next = prev.map((n) => {
          const newPos = changes.get(n.id);
          if (!newPos) return n;

          const updatedNode = {
            ...n,
            position: newPos,
            data: {
              ...(n.data as FlowAgentNodeData),
              position: newPos,
            },
          };

          scheduleSave(n.id, {
            position: newPos,
            gridSize: (n.data as FlowAgentNodeData).gridSize,
            size: (n.data as FlowAgentNodeData).size,
          });

          return updatedNode;
        });

        return next;
      });

      scheduleSave(id, layout);
    },
    [getNode, setNodes, scheduleSave],
  );

  const handleNodeDragStop = useCallback(
    (_: unknown, draggedNode: AgentFlowNode) => {
      const getNodeSize = (nodeId: string) => {
        const node = getNode(nodeId);
        const measuredW = node?.measured?.width;
        const measuredH = node?.measured?.height;
        if (measuredW && measuredH) return { w: measuredW, h: measuredH };

        const d = node?.data as FlowAgentNodeData | undefined;
        return calculateNodeSize(d?.gridSize, d?.size);
      };

      setNodes((prev) => {
        const draggedSize = getNodeSize(draggedNode.id);

        const obstacles = prev
          .filter((n) => n.id !== draggedNode.id)
          .map((n) => ({
            position: { ...n.position },
            size: getNodeSize(n.id),
          }));

        const finalPos = resolveDraggedNodeOverlaps(
          { position: draggedNode.position, size: draggedSize },
          obstacles,
        );

        const next = prev.map((n) => {
          if (n.id !== draggedNode.id) return n;

          return {
            ...n,
            position: finalPos,
            data: {
              ...(n.data as FlowAgentNodeData),
              position: finalPos,
            },
          };
        });

        const draggedData = draggedNode.data as FlowAgentNodeData;
        scheduleSave(draggedNode.id, {
          position: finalPos,
          gridSize: draggedData.gridSize,
          size: draggedData.size,
        });

        return next;
      });
    },
    [getNode, setNodes, scheduleSave],
  );

  const handleAvatarChange = useCallback(
    (id: string, avatarUrl: string) => {
      updateAgentAvatar(id, avatarUrl).catch((err) =>
        console.error("Failed to update avatar:", err),
      );
    },
    [updateAgentAvatar],
  );

  const handleDeleteAgent = useCallback(
    async (agentId: string) => {
      try {
        await deleteAgent(agentId);
        setNodes((prev) => prev.filter((n) => n.id !== agentId));
      } catch (error) {
        console.error("Failed to delete agent:", error);
      }
    },
    [deleteAgent, setNodes],
  );

  return {
    handleLayoutChange,
    handleNodeDragStop,
    handleAvatarChange,
    handleDeleteAgent,
  };
}

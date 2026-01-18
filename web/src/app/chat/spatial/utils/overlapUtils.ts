import { MAX_OVERLAP_ITERATIONS, OVERLAP_PADDING } from "../constants";

interface NodeRect {
  id: string;
  position: { x: number; y: number };
  size: { w: number; h: number };
}

/**
 * Check if two rectangles overlap (with padding)
 */
export const checkOverlap = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  padding: number = OVERLAP_PADDING,
): { overlapX: number; overlapY: number } | null => {
  const ax1 = a.x - padding;
  const ay1 = a.y - padding;
  const ax2 = a.x + a.w + padding;
  const ay2 = a.y + a.h + padding;

  const bx1 = b.x;
  const by1 = b.y;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;

  const overlapX = Math.min(ax2, bx2) - Math.max(ax1, bx1);
  const overlapY = Math.min(ay2, by2) - Math.max(ay1, by1);

  if (overlapX > 0 && overlapY > 0) {
    return { overlapX, overlapY };
  }
  return null;
};

/**
 * Resolve all overlaps in the node array using iterative relaxation.
 * Returns a map of node IDs to their new positions (only changed nodes).
 */
export const resolveAllOverlaps = (
  nodes: NodeRect[],
  fixedNodeId?: string,
): Map<string, { x: number; y: number }> => {
  const positions = new Map(nodes.map((n) => [n.id, { ...n.position }]));
  const sizes = new Map(nodes.map((n) => [n.id, n.size]));
  const changedNodes = new Set<string>();

  for (let iter = 0; iter < MAX_OVERLAP_ITERATIONS; iter++) {
    let hasOverlap = false;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeA = nodes[i];
        const nodeB = nodes[j];

        const posA = positions.get(nodeA.id)!;
        const posB = positions.get(nodeB.id)!;
        const sizeA = sizes.get(nodeA.id)!;
        const sizeB = sizes.get(nodeB.id)!;

        const overlap = checkOverlap(
          { ...posA, ...sizeA },
          { ...posB, ...sizeB },
        );

        if (overlap) {
          hasOverlap = true;

          const aFixed = nodeA.id === fixedNodeId;
          const bFixed = nodeB.id === fixedNodeId;

          const aCenterX = posA.x + sizeA.w / 2;
          const bCenterX = posB.x + sizeB.w / 2;
          const aCenterY = posA.y + sizeA.h / 2;
          const bCenterY = posB.y + sizeB.h / 2;

          const pushX = overlap.overlapX <= overlap.overlapY;
          const pushAmount = pushX ? overlap.overlapX : overlap.overlapY;

          if (aFixed && !bFixed) {
            if (pushX) {
              posB.x += (bCenterX > aCenterX ? 1 : -1) * pushAmount;
            } else {
              posB.y += (bCenterY > aCenterY ? 1 : -1) * pushAmount;
            }
            changedNodes.add(nodeB.id);
          } else if (bFixed && !aFixed) {
            if (pushX) {
              posA.x += (aCenterX > bCenterX ? 1 : -1) * pushAmount;
            } else {
              posA.y += (aCenterY > bCenterY ? 1 : -1) * pushAmount;
            }
            changedNodes.add(nodeA.id);
          } else {
            const halfPush = pushAmount / 2;
            if (pushX) {
              const dirA = aCenterX < bCenterX ? -1 : 1;
              posA.x += dirA * halfPush;
              posB.x -= dirA * halfPush;
            } else {
              const dirA = aCenterY < bCenterY ? -1 : 1;
              posA.y += dirA * halfPush;
              posB.y -= dirA * halfPush;
            }
            changedNodes.add(nodeA.id);
            changedNodes.add(nodeB.id);
          }
        }
      }
    }

    if (!hasOverlap) break;
  }

  const result = new Map<string, { x: number; y: number }>();
  for (const id of changedNodes) {
    result.set(id, positions.get(id)!);
  }
  return result;
};

/**
 * Resolve overlaps for a single dragged node against fixed obstacles.
 * Returns the final position for the dragged node.
 */
export const resolveDraggedNodeOverlaps = (
  draggedNode: {
    position: { x: number; y: number };
    size: { w: number; h: number };
  },
  obstacles: Array<{
    position: { x: number; y: number };
    size: { w: number; h: number };
  }>,
): { x: number; y: number } => {
  const finalPos = { ...draggedNode.position };

  for (let iter = 0; iter < MAX_OVERLAP_ITERATIONS; iter++) {
    let hasOverlap = false;

    for (const obstacle of obstacles) {
      const overlap = checkOverlap(
        { ...finalPos, ...draggedNode.size },
        { ...obstacle.position, ...obstacle.size },
      );

      if (overlap) {
        hasOverlap = true;

        const draggedCenterX = finalPos.x + draggedNode.size.w / 2;
        const draggedCenterY = finalPos.y + draggedNode.size.h / 2;
        const obstacleCenterX = obstacle.position.x + obstacle.size.w / 2;
        const obstacleCenterY = obstacle.position.y + obstacle.size.h / 2;

        if (overlap.overlapX <= overlap.overlapY) {
          finalPos.x +=
            (draggedCenterX > obstacleCenterX ? 1 : -1) * overlap.overlapX;
        } else {
          finalPos.y +=
            (draggedCenterY > obstacleCenterY ? 1 : -1) * overlap.overlapY;
        }
      }
    }

    if (!hasOverlap) break;
  }

  return finalPos;
};

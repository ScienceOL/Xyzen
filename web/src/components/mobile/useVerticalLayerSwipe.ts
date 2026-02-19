import {
  type MotionValue,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { useCallback, useRef, useState } from "react";

type Layer = "loft" | "ground";

interface UseVerticalLayerSwipeReturn {
  layer: Layer;
  springY: MotionValue<number>;
  dragProgress: MotionValue<number>;
  dragDirection: "up" | "down" | null;
  panHandlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: (e: React.TouchEvent) => void;
  };
  goToLayer: (layer: Layer) => void;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

const SPRING_CONFIG = { stiffness: 400, damping: 35 };
const THRESHOLD_FRACTION = 0.3;
const VELOCITY_THRESHOLD = 0.5; // px/ms

export function useVerticalLayerSwipe(): UseVerticalLayerSwipeReturn {
  const [layer, setLayer] = useState<Layer>("loft");
  const layerRef = useRef<Layer>("loft");
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const rawY = useMotionValue(0);
  const springY = useSpring(rawY, SPRING_CONFIG);

  // Drag state tracked in ref to avoid re-renders during gesture
  const gesture = useRef({
    active: false,
    startY: 0,
    startTime: 0,
    locked: false,
    vertical: false,
  });

  const [dragDirection, setDragDirection] = useState<"up" | "down" | null>(
    null,
  );

  // Progress: 0..1 based on how far dragged toward threshold
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const dragProgress = useTransform(rawY, (y) => {
    const currentLayer = layerRef.current;
    if (currentLayer === "loft") {
      // Dragging up from loft: progress = abs(y) / threshold
      return Math.min(Math.abs(Math.min(y, 0)) / (vh * THRESHOLD_FRACTION), 1);
    }
    // Dragging down from ground: progress = (y - (-vh)) / threshold
    const offset = y - -vh;
    return Math.min(Math.max(offset, 0) / (vh * THRESHOLD_FRACTION), 1);
  });

  const goToLayer = useCallback(
    (target: Layer) => {
      layerRef.current = target;
      setLayer(target);
      rawY.set(target === "loft" ? 0 : -vh);
    },
    [rawY, vh],
  );

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const t = e.touches[0];
      gesture.current = {
        active: true,
        startY: t.clientY,
        startTime: Date.now(),
        locked: false,
        vertical: false,
      };

      // Snap spring to current position to avoid lag
      const currentTarget = layerRef.current === "loft" ? 0 : -vh;
      rawY.set(currentTarget);
    },
    [rawY, vh],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const g = gesture.current;
      if (!g.active) return;

      const t = e.touches[0];
      const dy = t.clientY - g.startY;
      const dx =
        e.touches.length > 0 ? Math.abs(t.clientX - (t.clientX - 0)) : 0; // no horizontal tracking needed

      // Direction lock
      if (!g.locked) {
        if (Math.abs(dy) > 10 || dx > 10) {
          g.locked = true;
          g.vertical = Math.abs(dy) > dx;
          if (!g.vertical) {
            g.active = false;
            return;
          }
        } else {
          return;
        }
      }
      if (!g.vertical) return;

      const currentLayer = layerRef.current;
      const base = currentLayer === "loft" ? 0 : -vh;

      if (currentLayer === "ground" && dy > 0) {
        // Only allow pull-down on ground when scrolled to top
        const el = scrollContainerRef.current;
        if (el && el.scrollTop > 0) {
          g.active = false;
          return;
        }
      }

      // Rubber-band at boundaries
      let offset = base + dy;
      if (currentLayer === "loft" && dy > 0) {
        // Pulling down from loft — rubber band
        offset = base + dy * 0.25;
      } else if (currentLayer === "ground" && dy < 0) {
        // Pulling up past ground — rubber band
        offset = base + dy * 0.25;
      }

      rawY.set(offset);
      setDragDirection(dy < 0 ? "up" : dy > 0 ? "down" : null);
    },
    [rawY, vh],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const g = gesture.current;
      if (!g.active) {
        setDragDirection(null);
        return;
      }
      g.active = false;

      if (!g.locked || !g.vertical) {
        setDragDirection(null);
        return;
      }

      const dy = e.changedTouches[0].clientY - g.startY;
      const dt = Math.max(Date.now() - g.startTime, 1);
      const velocity = Math.abs(dy / dt);
      const fraction = Math.abs(dy) / vh;
      const shouldSwitch =
        velocity > VELOCITY_THRESHOLD || fraction > THRESHOLD_FRACTION;

      const currentLayer = layerRef.current;

      if (shouldSwitch) {
        if (currentLayer === "loft" && dy < 0) {
          goToLayer("ground");
        } else if (currentLayer === "ground" && dy > 0) {
          goToLayer("loft");
        } else {
          // Snap back
          goToLayer(currentLayer);
        }
      } else {
        // Snap back
        goToLayer(currentLayer);
      }

      setDragDirection(null);
    },
    [goToLayer, vh],
  );

  return {
    layer,
    springY,
    dragProgress,
    dragDirection,
    panHandlers: { onTouchStart, onTouchMove, onTouchEnd },
    goToLayer,
    scrollContainerRef,
  };
}

import { useReactFlow, type Viewport } from "@xyflow/react";
import { useCallback, useRef } from "react";
import {
  DEFAULT_VIEWPORT,
  FOCUS_ZOOM,
  STORAGE_KEY_FOCUSED_AGENT,
  STORAGE_KEY_VIEWPORT,
} from "../constants";

interface UseViewportPersistenceOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  focusedAgentIdRef: React.RefObject<string | null>;
  prevViewportRef: React.RefObject<Viewport | null>;
  setPrevViewport: (vp: Viewport | null) => void;
  setFocusedAgentId: (id: string | null) => void;
}

/**
 * Hook to manage viewport persistence and focus/unfocus animations
 */
export function useViewportPersistence({
  containerRef,
  focusedAgentIdRef,
  prevViewportRef,
  setPrevViewport,
  setFocusedAgentId,
}: UseViewportPersistenceOptions) {
  const { setViewport, getViewport, getNode, fitView } = useReactFlow();
  const viewportSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const handleFocus = useCallback(
    (id: string) => {
      if (!prevViewportRef.current) {
        setPrevViewport(getViewport());
      }
      setFocusedAgentId(id);

      try {
        localStorage.setItem(STORAGE_KEY_FOCUSED_AGENT, id);
      } catch {
        // Ignore storage errors
      }

      const node = getNode(id);
      if (!node) return;

      const rect = containerRef.current?.getBoundingClientRect();
      const containerW = rect?.width ?? window.innerWidth;
      const containerH = rect?.height ?? window.innerHeight;

      const leftPadding = Math.max(20, Math.min(56, containerW * 0.06));
      const topPadding = Math.max(20, Math.min(64, containerH * 0.05));

      const x = -node.position.x * FOCUS_ZOOM + leftPadding;
      const y = -node.position.y * FOCUS_ZOOM + topPadding;

      setViewport({ x, y, zoom: FOCUS_ZOOM }, { duration: 900 });
    },
    [
      getNode,
      getViewport,
      setViewport,
      containerRef,
      prevViewportRef,
      setPrevViewport,
      setFocusedAgentId,
    ],
  );

  const handleCloseFocus = useCallback(() => {
    setFocusedAgentId(null);

    try {
      localStorage.removeItem(STORAGE_KEY_FOCUSED_AGENT);
    } catch {
      // Ignore storage errors
    }

    const savedPrevViewport = prevViewportRef.current;
    if (savedPrevViewport) {
      setViewport(savedPrevViewport, { duration: 900 });
      setPrevViewport(null);
    } else {
      fitView({ padding: 0.22, duration: 900 });
    }

    setTimeout(() => {
      try {
        const vp = getViewport();
        localStorage.setItem(STORAGE_KEY_VIEWPORT, JSON.stringify(vp));
      } catch {
        // Ignore storage errors
      }
    }, 1000);
  }, [
    setViewport,
    getViewport,
    fitView,
    prevViewportRef,
    setPrevViewport,
    setFocusedAgentId,
  ]);

  const handleViewportChange = useCallback(
    (_: unknown, viewport: Viewport) => {
      if (focusedAgentIdRef.current) return;

      if (viewportSaveTimerRef.current) {
        clearTimeout(viewportSaveTimerRef.current);
      }

      viewportSaveTimerRef.current = setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY_VIEWPORT, JSON.stringify(viewport));
        } catch {
          // Ignore storage errors
        }
      }, 1000);
    },
    [focusedAgentIdRef],
  );

  const restoreViewport = useCallback(() => {
    try {
      const savedViewport = localStorage.getItem(STORAGE_KEY_VIEWPORT);
      if (savedViewport) {
        const vp = JSON.parse(savedViewport) as Viewport;
        setViewport(vp, { duration: 0 });
        return true;
      }
    } catch {
      // Ignore errors
    }
    return false;
  }, [setViewport]);

  const getSavedPrevViewport = useCallback((): Viewport => {
    try {
      const savedViewport = localStorage.getItem(STORAGE_KEY_VIEWPORT);
      if (savedViewport) {
        return JSON.parse(savedViewport) as Viewport;
      }
    } catch {
      // Ignore errors
    }
    return DEFAULT_VIEWPORT;
  }, []);

  return {
    handleFocus,
    handleCloseFocus,
    handleViewportChange,
    restoreViewport,
    getSavedPrevViewport,
    getNode,
    setViewport,
    getViewport,
    fitView,
  };
}

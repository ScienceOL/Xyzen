import { useCallback, useEffect, useRef, useState } from "react";

interface SwipeOptions {
  /** Total number of pages */
  pageCount: number;
  /** Called after snap animation completes */
  onSnap?: (page: number) => void;
  /** Minimum velocity (px/ms) to trigger page change */
  velocityThreshold?: number;
  /** Minimum drag fraction of container width to trigger page change */
  distanceThreshold?: number;
  /** Damping factor for overscroll rubber-band (0–1) */
  rubberBand?: number;
  /** Width in px from each screen edge that activates the swipe gesture */
  edgeWidth?: number;
  /** When true, swipe activates from anywhere (bypasses edge detection) */
  bypassEdge?: boolean;
}

/**
 * iOS-style gesture-driven horizontal page swipe.
 *
 * Content follows the finger 1:1 during drag, rubber-bands at
 * boundaries, and snaps to the nearest page based on velocity
 * and distance on release.
 *
 * Touch listeners are attached with `{ passive: false }` on
 * touchmove so we can `preventDefault()` to suppress vertical
 * scroll during a horizontal swipe.
 */
export function useMobileSwipe({
  pageCount,
  onSnap,
  velocityThreshold = 0.3,
  distanceThreshold = 0.25,
  rubberBand = 0.25,
  edgeWidth = 24,
  bypassEdge = false,
}: SwipeOptions) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // Authoritative page stored in ref (no render lag during gestures)
  const pageRef = useRef(0);
  const [currentPage, setCurrentPage] = useState(0);

  // Keep latest callback in a ref so the touch‑listener effect
  // closure never goes stale.
  const onSnapRef = useRef(onSnap);
  onSnapRef.current = onSnap;

  const gesture = useRef({
    active: false,
    startX: 0,
    startY: 0,
    startTime: 0,
    locked: false, // direction determined
    horizontal: false, // was it horizontal?
  });

  // Tracks whether a CSS snap animation is in progress.
  // Only when animating do we need to freeze the track on touchstart.
  const animatingRef = useRef(false);

  // Monotonic counter to invalidate stale snap callbacks.
  // Each snapTo() call bumps this; pending transitionend / timeout
  // callbacks compare their captured epoch to the current value and
  // bail out if a newer snap has started since.
  const snapEpochRef = useRef(0);

  const getWidth = useCallback(
    () => wrapperRef.current?.offsetWidth ?? window.innerWidth,
    [],
  );

  const applyTransform = useCallback((px: number, animate: boolean) => {
    const el = trackRef.current;
    if (!el) return;
    animatingRef.current = animate;
    el.style.transition = animate
      ? "transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)"
      : "none";
    el.style.transform = `translate3d(${px}px,0,0)`;
  }, []);

  /** Animate to `page` (clamped). If `notify` is true, fires `onSnap`
   *  after the CSS transition finishes. */
  const snapTo = useCallback(
    (page: number, notify = true) => {
      const clamped = Math.max(0, Math.min(pageCount - 1, page));
      const w = getWidth();
      applyTransform(-clamped * w, true);
      pageRef.current = clamped;
      setCurrentPage(clamped);

      if (notify) {
        // Bump epoch so any pending callbacks from a previous snapTo
        // become stale and won't fire onSnap.
        const epoch = ++snapEpochRef.current;

        const el = trackRef.current;
        if (!el) {
          onSnapRef.current?.(clamped);
          return;
        }
        let fired = false;
        const fire = () => {
          if (fired) return;
          fired = true;
          // Only fire if no newer snapTo has started since.
          if (epoch !== snapEpochRef.current) return;
          onSnapRef.current?.(clamped);
        };
        const handler = () => {
          el.removeEventListener("transitionend", handler);
          animatingRef.current = false;
          fire();
        };
        el.addEventListener("transitionend", handler);
        // Safety fallback in case transitionend doesn't fire
        setTimeout(() => {
          el.removeEventListener("transitionend", handler);
          animatingRef.current = false;
          fire();
        }, 500);
      }
    },
    [pageCount, getWidth, applyTransform],
  );

  /** Jump to `page` instantly (no animation, no callback). */
  const setPageImmediate = useCallback(
    (page: number) => {
      const clamped = Math.max(0, Math.min(pageCount - 1, page));
      pageRef.current = clamped;
      setCurrentPage(clamped);
      applyTransform(-clamped * getWidth(), false);
    },
    [pageCount, applyTransform, getWidth],
  );

  // Keep latest values in refs so the touch-listener effect
  // doesn't need them as dependencies (avoids re-registering listeners
  // every time pageCount changes, which could interrupt gestures).
  const snapToRef = useRef(snapTo);
  snapToRef.current = snapTo;
  const pageCountRef = useRef(pageCount);
  pageCountRef.current = pageCount;
  const bypassEdgeRef = useRef(bypassEdge);
  bypassEdgeRef.current = bypassEdge;

  // ---- Touch listeners (non-passive for preventDefault) ----
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];

      // Only activate from screen edges to avoid conflicts with
      // in-content interactions (text selection, scrolling, etc.)
      // unless bypassEdge is enabled.
      if (!bypassEdgeRef.current) {
        const fromLeftEdge = t.clientX <= edgeWidth;
        const fromRightEdge =
          t.clientX >=
          (wrapperRef.current?.offsetWidth ?? window.innerWidth) - edgeWidth;
        if (!fromLeftEdge && !fromRightEdge) return;
      }

      gesture.current = {
        active: true,
        startX: t.clientX,
        startY: t.clientY,
        startTime: Date.now(),
        locked: false,
        horizontal: false,
      };
      // Only freeze the track when a CSS snap animation is in progress.
      // Mutating transform on every touchstart prevents mobile browsers
      // from synthesizing click events (they interpret the style change
      // as the element moving and cancel the tap).
      if (animatingRef.current) {
        const track = trackRef.current;
        if (track) {
          const mx = new DOMMatrix(getComputedStyle(track).transform);
          track.style.transition = "none";
          track.style.transform = `translate3d(${mx.m41}px,0,0)`;
          animatingRef.current = false;
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const g = gesture.current;
      if (!g.active) return;

      const t = e.touches[0];
      const dx = t.clientX - g.startX;
      const dy = t.clientY - g.startY;

      // Direction lock on first significant move
      if (!g.locked) {
        if (Math.abs(dx) > 12 || Math.abs(dy) > 12) {
          g.locked = true;
          g.horizontal = Math.abs(dx) >= Math.abs(dy);
          if (!g.horizontal) {
            g.active = false;
            return;
          }
        } else {
          return;
        }
      }
      if (!g.horizontal) return;

      if (e.cancelable) e.preventDefault(); // suppress vertical scroll

      const w = getWidth();
      const base = -pageRef.current * w;
      let offset = base + dx;

      // Rubber-band at boundaries
      const min = -(pageCountRef.current - 1) * w;
      if (offset > 0) {
        offset *= rubberBand;
      } else if (offset < min) {
        offset = min + (offset - min) * rubberBand;
      }

      applyTransform(offset, false);
    };

    const onTouchEnd = (e: TouchEvent) => {
      const g = gesture.current;
      if (!g.active) return; // touch wasn't tracked by onTouchStart
      g.active = false;
      if (!g.locked || !g.horizontal) return;

      const dx = e.changedTouches[0].clientX - g.startX;
      const dt = Math.max(Date.now() - g.startTime, 1);
      const velocity = Math.abs(dx / dt); // px/ms
      const w = getWidth();
      const fraction = Math.abs(dx) / w;

      let target = pageRef.current;
      if (velocity > velocityThreshold || fraction > distanceThreshold) {
        target += dx < 0 ? 1 : -1;
      }
      snapToRef.current(target);
    };

    wrapper.addEventListener("touchstart", onTouchStart, { passive: true });
    wrapper.addEventListener("touchmove", onTouchMove, { passive: false });
    wrapper.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      wrapper.removeEventListener("touchstart", onTouchStart);
      wrapper.removeEventListener("touchmove", onTouchMove);
      wrapper.removeEventListener("touchend", onTouchEnd);
    };
  }, [
    velocityThreshold,
    distanceThreshold,
    rubberBand,
    edgeWidth,
    getWidth,
    applyTransform,
  ]);

  // Set initial inline transform on mount and reposition after window resize.
  // The track MUST have an inline transform from the start so that
  // will-change-transform compositing works correctly for hit-testing.
  useEffect(() => {
    applyTransform(-pageRef.current * getWidth(), false);
    const onResize = () => applyTransform(-pageRef.current * getWidth(), false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [applyTransform, getWidth]);

  return {
    wrapperRef,
    trackRef,
    currentPage,
    goToPage: snapTo,
    setPageImmediate,
  };
}

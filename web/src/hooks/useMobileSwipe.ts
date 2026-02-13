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

  const getWidth = useCallback(
    () => wrapperRef.current?.offsetWidth ?? window.innerWidth,
    [],
  );

  const applyTransform = useCallback((px: number, animate: boolean) => {
    const el = trackRef.current;
    if (!el) return;
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
        const el = trackRef.current;
        if (!el) {
          onSnapRef.current?.(clamped);
          return;
        }
        let fired = false;
        const fire = () => {
          if (fired) return;
          fired = true;
          onSnapRef.current?.(clamped);
        };
        const handler = () => {
          el.removeEventListener("transitionend", handler);
          fire();
        };
        el.addEventListener("transitionend", handler);
        // Safety fallback in case transitionend doesn't fire
        setTimeout(() => {
          el.removeEventListener("transitionend", handler);
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

  // ---- Touch listeners (non-passive for preventDefault) ----
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      gesture.current = {
        active: true,
        startX: t.clientX,
        startY: t.clientY,
        startTime: Date.now(),
        locked: false,
        horizontal: false,
      };
      // Freeze any running CSS transition so the finger takes over
      const track = trackRef.current;
      if (track) {
        const mx = new DOMMatrix(getComputedStyle(track).transform);
        track.style.transition = "none";
        track.style.transform = `translate3d(${mx.m41}px,0,0)`;
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
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
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

      e.preventDefault(); // suppress vertical scroll

      const w = getWidth();
      const base = -pageRef.current * w;
      let offset = base + dx;

      // Rubber-band at boundaries
      const min = -(pageCount - 1) * w;
      if (offset > 0) {
        offset *= rubberBand;
      } else if (offset < min) {
        offset = min + (offset - min) * rubberBand;
      }

      applyTransform(offset, false);
    };

    const onTouchEnd = (e: TouchEvent) => {
      const g = gesture.current;
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
      snapTo(target);
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
    pageCount,
    velocityThreshold,
    distanceThreshold,
    rubberBand,
    getWidth,
    applyTransform,
    snapTo,
  ]);

  // Reposition after window resize
  useEffect(() => {
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

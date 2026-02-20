import { useEffect, useRef } from "react";

interface OverscrollPullOptions {
  /** Ref to the scrollable container to monitor scrollTop. */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Whether pull detection is active. */
  enabled?: boolean;
  /** Called when the pull completes (threshold met on release or velocity). */
  onPull?: () => void;
  /**
   * Called with the finger's current clientY during the pull.
   * The overlay should be revealed from top down to this Y position.
   */
  onProgress?: (fingerY: number) => void;
  /**
   * Called when the gesture ends.
   * `reached` — true if the pull threshold was met (auto-complete).
   */
  onEnd?: (reached: boolean) => void;
}

/**
 * iOS-style overscroll pull-down gesture.
 *
 * Trigger zone: touch must start in the **top 1/3** of the viewport and
 * the scroll container must be at `scrollTop === 0`.
 *
 * When the gesture engages, the overlay **jumps to the finger position**
 * and then tracks 1:1 with the finger.
 *
 * Auto-completes when:
 * - `fingerY > viewport * 2/3`, OR
 * - Downward velocity exceeds 800 px/s on release
 *
 * Tap-highlight suppression uses two phases:
 * 1. `data-pull-zone` — set on touchstart in the trigger zone.
 *    Only suppresses `-webkit-tap-highlight-color` (no pointer-events block),
 *    so click events still fire for normal taps.
 * 2. `data-pulling` — set after direction-lock confirms a vertical pull.
 *    Full `pointer-events: none` on children.
 */
export function useOverscrollPull({
  scrollRef,
  enabled = true,
  onPull,
  onProgress,
  onEnd,
}: OverscrollPullOptions) {
  const onPullRef = useRef(onPull);
  onPullRef.current = onPull;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const VELOCITY_THRESHOLD = 800; // px/s
    const COMPLETE_RATIO = 2 / 3;
    const TRIGGER_ZONE_RATIO = 1 / 3;

    let startY = 0;
    let startX = 0;
    let pulling = false;
    let locked = false;
    let vertical = false;
    let inTriggerZone = false; // touch started in the pull-trigger zone
    // Velocity samples: [timestamp, clientY]
    let prevSample: [number, number] = [0, 0];
    let currSample: [number, number] = [0, 0];

    const onTouchStart = (e: TouchEvent) => {
      if (!enabledRef.current) return;
      const t = e.touches[0];
      startY = t.clientY;
      startX = t.clientX;
      pulling = false;
      locked = false;
      vertical = false;
      prevSample = [Date.now(), t.clientY];
      currSample = [Date.now(), t.clientY];

      // Phase 1: If in the trigger zone, immediately suppress tap-highlight
      // so there's no flash of :active state before the 12px direction-lock.
      const vh = window.innerHeight;
      inTriggerZone = el.scrollTop <= 0 && t.clientY < vh * TRIGGER_ZONE_RATIO;
      if (inTriggerZone) {
        el.dataset.pullZone = "";
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!enabledRef.current) return;
      const t = e.touches[0];
      const dy = t.clientY - startY;
      const dx = t.clientX - startX;

      // Direction lock (12px dead-zone, same as useMobileSwipe)
      if (!locked) {
        if (Math.abs(dx) > 12 || Math.abs(dy) > 12) {
          locked = true;
          vertical = Math.abs(dy) > Math.abs(dx);
          if (!vertical) {
            // Horizontal gesture — remove zone suppression, let swipe handle it
            delete el.dataset.pullZone;
            return;
          }
        } else {
          return;
        }
      }
      if (!vertical) return;

      // Only engage at scrollTop === 0, pulling down, touch started in top 1/3
      if (el.scrollTop > 0 || dy <= 0 || !inTriggerZone) {
        if (pulling) {
          pulling = false;
          delete el.dataset.pulling;
          onProgressRef.current?.(0);
        }
        return;
      }

      // Phase 2: Confirmed vertical pull — full pointer-events suppression
      pulling = true;
      el.dataset.pulling = "";
      if (e.cancelable) e.preventDefault();

      // Update velocity samples
      prevSample = currSample;
      currSample = [Date.now(), t.clientY];

      // Report finger position directly (1:1 tracking)
      onProgressRef.current?.(t.clientY);
    };

    const onTouchEnd = () => {
      if (pulling) {
        // Compute velocity from last two samples
        const dt = (currSample[0] - prevSample[0]) / 1000; // seconds
        const dPx = currSample[1] - prevSample[1];
        const velocity = dt > 0 ? dPx / dt : 0; // px/s (positive = downward)

        const vh = window.innerHeight;
        const reached =
          currSample[1] > vh * COMPLETE_RATIO || velocity > VELOCITY_THRESHOLD;

        if (reached) {
          onPullRef.current?.();
        }
        onEndRef.current?.(reached);
      }
      pulling = false;
      locked = false;
      vertical = false;
      inTriggerZone = false;
      delete el.dataset.pulling;
      delete el.dataset.pullZone;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [scrollRef]);
}

import { useEffect, useRef } from "react";

interface OverscrollPullOptions {
  /** Ref to the scrollable container to monitor scrollTop. */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Distance in px the finger must travel to complete the pull. */
  threshold?: number;
  /** Damping factor (0–1) applied after the pull exceeds the threshold. */
  rubberBand?: number;
  /** Whether pull detection is active. */
  enabled?: boolean;
  /** Called when the pull exceeds the threshold on release. */
  onPull?: () => void;
  /** Called with 0..1+ progress during the pull gesture (finger tracking). */
  onProgress?: (progress: number) => void;
  /** Called when the gesture ends. `reached` is true if threshold was met. */
  onEnd?: (reached: boolean) => void;
}

/**
 * Overscroll-pull-down gesture hook.
 *
 * Detects a downward pull when the target scroll container is already
 * at `scrollTop === 0`.  Reports continuous progress (0..1) via
 * `onProgress` and fires `onPull` when the threshold is exceeded on
 * release.
 *
 * Follows the same architecture as `useMobileSwipe`:
 * - Native touch listeners (touchmove is non-passive so we can
 *   preventDefault during a pull — suppresses tap-highlight and
 *   native scroll bounce)
 * - Direction-lock to avoid fighting with horizontal page swipe
 * - Callbacks stored in refs so the effect never re-registers
 */
export function useOverscrollPull({
  scrollRef,
  threshold = 100,
  rubberBand = 0.35,
  enabled = true,
  onPull,
  onProgress,
  onEnd,
}: OverscrollPullOptions) {
  // Keep latest callbacks in refs so the effect closure never goes stale.
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

    let startY = 0;
    let startX = 0;
    let pulling = false; // actively tracking a pull gesture
    let locked = false; // direction determined
    let vertical = false; // was it vertical?
    let lastProgress = 0;
    let didVibrate = false;

    const onTouchStart = (e: TouchEvent) => {
      if (!enabledRef.current) return;
      const t = e.touches[0];
      startY = t.clientY;
      startX = t.clientX;
      pulling = false;
      locked = false;
      vertical = false;
      lastProgress = 0;
      didVibrate = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!enabledRef.current) return;
      const t = e.touches[0];
      const dy = t.clientY - startY;
      const dx = t.clientX - startX;

      // Direction lock on first significant move (same 12px as useMobileSwipe)
      if (!locked) {
        if (Math.abs(dx) > 12 || Math.abs(dy) > 12) {
          locked = true;
          vertical = Math.abs(dy) > Math.abs(dx);
          if (!vertical) return; // horizontal → let useMobileSwipe handle it
        } else {
          return; // not enough movement yet
        }
      }
      if (!vertical) return;

      // Only engage when at the very top and pulling down
      if (el.scrollTop > 0 || dy <= 0) {
        if (pulling) {
          pulling = false;
          lastProgress = 0;
          onProgressRef.current?.(0);
        }
        return;
      }

      pulling = true;
      e.preventDefault(); // suppress tap-highlight & native scroll bounce

      // Raw progress with rubber-band past threshold
      let effective = dy;
      if (dy > threshold) {
        effective = threshold + (dy - threshold) * rubberBand;
      }
      const progress = Math.min(effective / threshold, 1.5); // cap at 1.5
      lastProgress = progress;
      onProgressRef.current?.(progress);

      // Haptic at threshold
      if (progress >= 1 && !didVibrate) {
        didVibrate = true;
        navigator.vibrate?.(15);
      }
    };

    const onTouchEnd = () => {
      if (pulling) {
        const reached = lastProgress >= 1;
        if (reached) {
          onPullRef.current?.();
        }
        onEndRef.current?.(reached);
      }
      pulling = false;
      locked = false;
      vertical = false;
      lastProgress = 0;
      didVibrate = false;
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
  }, [scrollRef, threshold, rubberBand]);
}

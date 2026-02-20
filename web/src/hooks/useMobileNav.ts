import { useActiveChannelStatus } from "@/hooks/useChannelSelectors";
import { useOverscrollPull } from "@/hooks/useOverscrollPull";
import { useXyzen } from "@/store";
import { useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

/**
 * Owns all mobile navigation state + channel lifecycle logic.
 *
 * Handles:
 * - CEO overlay show/dismiss with pre-activation of the CEO channel
 * - Page persistence across unmount/remount
 * - Synchronisation when the active channel changes externally
 * - Cleanup of active channels on overlay dismiss when on page 0
 * - Race condition: dismiss before async activation completes
 */
export function useMobileNav() {
  // ---- Reactive state ----
  const { activeChatChannel, mobileCeoOverlay, mobilePage } = useXyzen(
    useShallow((s) => ({
      activeChatChannel: s.activeChatChannel,
      mobileCeoOverlay: s.mobileCeoOverlay,
      mobilePage: s.mobilePage,
    })),
  );
  const { knowledge_set_id } = useActiveChannelStatus();

  const hasChannel = !!activeChatChannel;
  const hasCapsule = hasChannel && !!knowledge_set_id;
  const pageCount = hasCapsule ? 3 : hasChannel ? 2 : 1;

  // ---- Internal refs ----

  // True after dismiss while on page 0 — prevents a stale in-flight
  // activation from restoring the channel (race condition handling).
  const dismissedRef = useRef(false);

  // Track previous hasChannel value for transition detection.
  const prevHasChannelRef = useRef(hasChannel);

  // Wired by MobileChatView after useMobileSwipe returns.
  const goToPageRef = useRef<(page: number) => void>(() => {});
  const setPageImmediateRef = useRef<(page: number) => void>(() => {});

  // DOM refs for overlay + agent scroll container
  const overlayRef = useRef<HTMLDivElement>(null);
  const agentScrollRef = useRef<HTMLDivElement>(null);

  // Agent list sort mode — disables overscroll pull while reordering
  const [agentSortMode, setAgentSortMode] = useState(false);

  // ---- Stable callbacks (all use getState(), empty deps) ----

  const showOverlay = useCallback(() => {
    const {
      setMobileCeoOverlay,
      activeChatChannel,
      rootAgent,
      activateChannelForAgent,
    } = useXyzen.getState();
    setMobileCeoOverlay(true);
    dismissedRef.current = false;
    if (!activeChatChannel && rootAgent) {
      activateChannelForAgent(rootAgent.id);
    }
  }, []);

  const dismissOverlay = useCallback(() => {
    const {
      setMobileCeoOverlay,
      setActiveChatChannel,
      activeChatChannel,
      mobilePage,
    } = useXyzen.getState();
    setMobileCeoOverlay(false);
    if (mobilePage === 0) {
      if (activeChatChannel) {
        // Channel exists — clear it synchronously. The pre-activation
        // already completed so there's no in-flight op to guard against.
        setActiveChatChannel(null);
      } else {
        // No channel yet — showOverlay's pre-activation may still be
        // in-flight. Arm the guard so the effect clears it on arrival.
        dismissedRef.current = true;
      }
    }
  }, []);

  const navigateToChat = useCallback(() => {
    const { setMobilePage } = useXyzen.getState();
    dismissedRef.current = false;
    setMobilePage(1);
    goToPageRef.current(1);
  }, []);

  const onSnap = useCallback((page: number) => {
    const {
      setMobilePage,
      setActiveChatChannel,
      activeChatChannel,
      mobileCeoOverlay,
    } = useXyzen.getState();
    setMobilePage(page);
    if (page === 0 && activeChatChannel && !mobileCeoOverlay) {
      setActiveChatChannel(null);
    }
    if (page >= 1) {
      dismissedRef.current = false;
    }
  }, []);

  // ---- Effect 1: External channel sync ----
  useEffect(() => {
    const wasActive = prevHasChannelRef.current;
    prevHasChannelRef.current = hasChannel;

    if (!hasChannel && wasActive) {
      // Channel cleared externally → snap back to agent list
      setPageImmediateRef.current(0);
      useXyzen.getState().setMobilePage(0);
    } else if (hasChannel && !wasActive) {
      if (dismissedRef.current) {
        // Stale in-flight activation completed after dismiss — clear it
        useXyzen.getState().setActiveChatChannel(null);
        dismissedRef.current = false;
      } else if (useXyzen.getState().mobileCeoOverlay) {
        // Overlay is showing — pre-activation, don't navigate
      } else {
        // Genuine external activation (deep-link, push notification)
        goToPageRef.current(1);
        useXyzen.getState().setMobilePage(1);
      }
    }
  }, [hasChannel]);

  // ---- Effect 2: Mount restore ----
  const didRestore = useRef(false);
  useEffect(() => {
    if (didRestore.current) return;
    didRestore.current = true;
    const target = Math.min(mobilePage, pageCount - 1);
    if (target > 0) {
      setPageImmediateRef.current(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageCount]);

  // ---- Overscroll pull-to-reveal (iOS-style with damping) ----
  useOverscrollPull({
    scrollRef: agentScrollRef,
    enabled: !mobileCeoOverlay && !agentSortMode,
    onPull: showOverlay,
    onProgress: useCallback((fingerY: number) => {
      const el = overlayRef.current;
      if (!el) return;
      if (fingerY > 0) {
        const vh = window.innerHeight;
        // Quadratic damping: resistance increases the further you pull.
        // At fingerY ≈ 0 → ~1:1 tracking; at fingerY = vh → ~80% tracking.
        const ratio = fingerY / vh;
        const damped = ratio * (1 - 0.2 * ratio);
        const effectiveY = vh * damped;
        const offset = vh - effectiveY;
        el.style.transition = "none";
        el.style.transform = `translateY(-${offset}px)`;
        el.style.pointerEvents = "none";
      } else {
        el.style.transition = "none";
        el.style.transform = "translateY(-100%)";
        el.style.pointerEvents = "none";
      }
    }, []),
    onEnd: useCallback((reached: boolean) => {
      const el = overlayRef.current;
      if (!el) return;
      if (reached) {
        // Snap open from current position — start animation immediately
        // so there's no dead frame waiting for the React state update.
        el.style.transition = "transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)";
        el.style.transform = "translateY(0)";
        el.style.pointerEvents = "auto";
      } else {
        // Snap back up with spring-like ease
        el.style.transition = "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)";
        el.style.transform = "translateY(-100%)";
      }
      // showOverlay() is called separately via onPull for the state update;
      // the visible effect in CeoOverlay will see transform is already at 0
      // and the rAF write will be a no-op.
    }, []),
  });

  return {
    overlay: mobileCeoOverlay,
    pageCount,
    hasChannel,
    hasCapsule,
    overlayRef,
    agentScrollRef,
    goToPageRef,
    setPageImmediateRef,
    onSnap,
    showOverlay,
    dismissOverlay,
    navigateToChat,
    setAgentSortMode,
  };
}

import { Capsule } from "@/components/capsule";
import XyzenAgent from "@/components/layouts/XyzenAgent";
import XyzenChat from "@/components/layouts/XyzenChat";
import CeoOverlay from "@/components/mobile/CeoOverlay";
import { useActiveChannelStatus } from "@/hooks/useChannelSelectors";
import { useMobileSwipe } from "@/hooks/useMobileSwipe";
import { useOverscrollPull } from "@/hooks/useOverscrollPull";
import { useXyzen } from "@/store";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { useShallow } from "zustand/react/shallow";

export interface MobileChatViewHandle {
  /** Navigate to a page: 0 = agents, 1 = chat, 2 = capsule */
  goToPage: (page: number) => void;
  currentPage: number;
}

interface MobileChatViewProps {
  /** Fires whenever the visible page index changes. */
  onPageChange?: (page: number) => void;
}

/**
 * Mobile three-page swipeable view:
 *   [Agent List]  ←→  [Chat]  ←→  [Capsule]
 *
 * Uses iOS-style gesture-driven navigation via `useMobileSwipe`.
 * Content follows the finger 1:1 during the drag and snaps with
 * velocity-based momentum on release.
 *
 * Navigation state (overlay visibility + page index) is persisted
 * in Zustand so it survives component unmount/remount.
 */
const MobileChatView = forwardRef<MobileChatViewHandle, MobileChatViewProps>(
  function MobileChatView({ onPageChange }, ref) {
    const {
      activeChatChannel,
      setActiveChatChannel,
      rootAgent,
      activateChannelForAgent,
      mobileCeoOverlay: showCeoOverlay,
      setMobileCeoOverlay: setShowCeoOverlay,
      mobilePage: persistedPage,
      setMobilePage,
    } = useXyzen(
      useShallow((s) => ({
        activeChatChannel: s.activeChatChannel,
        setActiveChatChannel: s.setActiveChatChannel,
        rootAgent: s.rootAgent,
        activateChannelForAgent: s.activateChannelForAgent,
        mobileCeoOverlay: s.mobileCeoOverlay,
        setMobileCeoOverlay: s.setMobileCeoOverlay,
        mobilePage: s.mobilePage,
        setMobilePage: s.setMobilePage,
      })),
    );
    const { knowledge_set_id } = useActiveChannelStatus();

    const hasChannel = !!activeChatChannel;
    const hasCapsule = hasChannel && !!knowledge_set_id;
    const pageCount = hasCapsule ? 3 : hasChannel ? 2 : 1;

    // Prevent clearing activeChatChannel when the snap to page 0
    // was triggered by *us* due to an external channel-clear.
    const externalClear = useRef(false);
    // Initialise to current hasChannel so that a remount with an
    // already-active channel does NOT trigger false auto-navigation.
    const prevHasChannel = useRef(hasChannel);

    // ---- CEO overlay ----
    const dismissOverlay = useCallback(
      () => setShowCeoOverlay(false),
      [setShowCeoOverlay],
    );

    // Pre-activate CEO channel so useMobileSwipe has a page 1 (chat) to
    // swipe to.  The skipAutoNav flag prevents the channel-change effect
    // below from auto-navigating to page 1 — preemptive activation should
    // only make the page *available*, not navigate to it.
    const skipAutoNav = useRef(false);
    useEffect(() => {
      if (showCeoOverlay && rootAgent && !activeChatChannel) {
        skipAutoNav.current = true;
        activateChannelForAgent(rootAgent.id);
      }
    }, [showCeoOverlay, rootAgent, activeChatChannel, activateChannelForAgent]);

    // Ref to the overlay container — direct DOM manipulation during
    // pull gesture (no React re-renders → no flicker, same as useMobileSwipe).
    const overlayRef = useRef<HTMLDivElement>(null);

    // Pull-down-to-reveal: native touch events on the agent scroll container.
    const agentScrollRef = useRef<HTMLDivElement>(null);
    useOverscrollPull({
      scrollRef: agentScrollRef,
      enabled: !showCeoOverlay,
      onPull: useCallback(() => setShowCeoOverlay(true), [setShowCeoOverlay]),
      onProgress: useCallback((progress: number) => {
        const el = overlayRef.current;
        if (!el) return;
        if (progress > 0) {
          const pct = Math.min(progress, 1) * 100;
          el.style.transition = "none";
          el.style.clipPath = `inset(0% 0% ${100 - pct}% 0%)`;
        } else {
          el.style.transition = "none";
          el.style.clipPath = "inset(0% 0% 100% 0%)";
        }
      }, []),
      onEnd: useCallback((reached: boolean) => {
        if (!reached) {
          // Animate shrink-back when pull cancelled
          const el = overlayRef.current;
          if (!el) return;
          el.style.transition = "clip-path 0.3s ease-out";
          el.style.clipPath = "inset(0% 0% 100% 0%)";
        }
      }, []),
    });

    // ---- Horizontal page swipe ----
    const handleSnap = useCallback(
      (page: number) => {
        setMobilePage(page);
        // Don't clear channel when overlay is visible — the CEO channel
        // must stay alive so the user can swipe right to chat again.
        if (
          page === 0 &&
          hasChannel &&
          !externalClear.current &&
          !showCeoOverlay
        ) {
          setActiveChatChannel(null);
        }
        externalClear.current = false;
      },
      [hasChannel, setActiveChatChannel, showCeoOverlay, setMobilePage],
    );

    const { wrapperRef, trackRef, currentPage, goToPage, setPageImmediate } =
      useMobileSwipe({
        pageCount,
        onSnap: handleSnap,
      });

    // Keep goToPage always-current via ref so async callbacks never go stale.
    const goToPageRef = useRef(goToPage);
    goToPageRef.current = goToPage;

    // Stable callback that XyzenAgent can safely call after an async
    // activateChannelForAgent — always uses the latest goToPage.
    const navigateToChat = useCallback(() => {
      setMobilePage(1);
      goToPageRef.current(1);
    }, [setMobilePage]);

    // Expose imperative handle for the parent (e.g. header back button)
    useImperativeHandle(ref, () => ({ goToPage, currentPage }), [
      goToPage,
      currentPage,
    ]);

    // Notify parent whenever the visible page changes
    useEffect(() => {
      onPageChange?.(currentPage);
    }, [currentPage, onPageChange]);

    // ---- Restore persisted page on mount ----
    const didRestore = useRef(false);
    useEffect(() => {
      if (didRestore.current) return;
      didRestore.current = true;
      // Clamp to valid range in case channel was cleared while unmounted
      const target = Math.min(persistedPage, pageCount - 1);
      if (target > 0) {
        setPageImmediate(target);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageCount]);

    // ---- Sync page position when channel changes externally ----
    useEffect(() => {
      if (!hasChannel && prevHasChannel.current) {
        // Channel cleared externally → snap back to agent list
        externalClear.current = true;
        setPageImmediate(0);
        setMobilePage(0);
      } else if (hasChannel && !prevHasChannel.current) {
        if (skipAutoNav.current) {
          // Preemptive CEO activation — page available but don't navigate
          skipAutoNav.current = false;
        } else {
          // Channel activated externally (e.g. push notification deep-link)
          goToPageRef.current(1);
          setMobilePage(1);
        }
      }
      prevHasChannel.current = hasChannel;
    }, [hasChannel, setPageImmediate, setMobilePage]);

    return (
      <div ref={wrapperRef} className="h-full overflow-hidden">
        <div ref={trackRef} className="flex h-full will-change-transform">
          {/* ---- Page 0: Agent List + CEO Overlay ---- */}
          <div className="relative h-full shrink-0 w-full">
            <XyzenAgent
              onNavigateToChat={navigateToChat}
              scrollRef={agentScrollRef}
            />
            <CeoOverlay
              visible={showCeoOverlay}
              overlayRef={overlayRef}
              onDismiss={dismissOverlay}
              onNavigateToChat={navigateToChat}
            />
          </div>

          {/* ---- Page 1: Chat ---- */}
          {hasChannel && (
            <div className="h-full shrink-0 w-full bg-white dark:bg-neutral-950">
              <XyzenChat />
            </div>
          )}

          {/* ---- Page 2: Capsule ---- */}
          {hasCapsule && (
            <div className="h-full shrink-0 w-full bg-white dark:bg-neutral-950">
              <Capsule variant="mobile" onBack={() => goToPage(1)} />
            </div>
          )}
        </div>
      </div>
    );
  },
);

export default MobileChatView;

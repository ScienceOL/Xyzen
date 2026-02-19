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
  useState,
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
 */
const MobileChatView = forwardRef<MobileChatViewHandle, MobileChatViewProps>(
  function MobileChatView({ onPageChange }, ref) {
    const {
      activeChatChannel,
      setActiveChatChannel,
      rootAgent,
      activateChannelForAgent,
    } = useXyzen(
      useShallow((s) => ({
        activeChatChannel: s.activeChatChannel,
        setActiveChatChannel: s.setActiveChatChannel,
        rootAgent: s.rootAgent,
        activateChannelForAgent: s.activateChannelForAgent,
      })),
    );
    const { knowledge_set_id } = useActiveChannelStatus();

    const hasChannel = !!activeChatChannel;
    const hasCapsule = hasChannel && !!knowledge_set_id;
    const pageCount = hasCapsule ? 3 : hasChannel ? 2 : 1;

    // Prevent clearing activeChatChannel when the snap to page 0
    // was triggered by *us* due to an external channel-clear.
    const externalClear = useRef(false);
    // Track whether we were previously in chat — initialised to false so that
    // mounting with an already-active channel (deep-link / notification) is
    // detected as a false→true transition and auto-navigates to page 1.
    const prevHasChannel = useRef(false);

    // ---- CEO overlay ----
    const [showCeoOverlay, setShowCeoOverlay] = useState(true);
    const dismissOverlay = useCallback(() => setShowCeoOverlay(false), []);

    // Pre-activate CEO channel when overlay is visible so that
    // useMobileSwipe has a page 1 (chat) to swipe to.
    useEffect(() => {
      if (showCeoOverlay && rootAgent && !activeChatChannel) {
        activateChannelForAgent(rootAgent.id);
      }
    }, [showCeoOverlay, rootAgent, activeChatChannel, activateChannelForAgent]);

    // Ref to the overlay backdrop element — direct DOM manipulation during
    // pull gesture (no React re-renders → no flicker, same as useMobileSwipe).
    const backdropRef = useRef<HTMLDivElement>(null);

    // Pull-down-to-reveal: native touch events on the agent scroll container.
    const agentScrollRef = useRef<HTMLDivElement>(null);
    useOverscrollPull({
      scrollRef: agentScrollRef,
      enabled: !showCeoOverlay,
      onPull: useCallback(() => setShowCeoOverlay(true), []),
      onProgress: useCallback((progress: number) => {
        const el = backdropRef.current;
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
    });

    // ---- Horizontal page swipe ----
    const handleSnap = useCallback(
      (page: number) => {
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
      [hasChannel, setActiveChatChannel, showCeoOverlay],
    );

    const { wrapperRef, trackRef, currentPage, goToPage, setPageImmediate } =
      useMobileSwipe({
        pageCount,
        onSnap: handleSnap,
        bypassEdge: showCeoOverlay,
      });

    // Keep goToPage always-current via ref so async callbacks never go stale.
    const goToPageRef = useRef(goToPage);
    goToPageRef.current = goToPage;

    // Stable callback that XyzenAgent can safely call after an async
    // activateChannelForAgent — always uses the latest goToPage.
    const navigateToChat = useCallback(() => {
      goToPageRef.current(1);
    }, []);

    // Expose imperative handle for the parent (e.g. header back button)
    useImperativeHandle(ref, () => ({ goToPage, currentPage }), [
      goToPage,
      currentPage,
    ]);

    // Notify parent whenever the visible page changes
    useEffect(() => {
      onPageChange?.(currentPage);
    }, [currentPage, onPageChange]);

    // ---- Sync page position when channel changes externally ----
    useEffect(() => {
      if (!hasChannel && prevHasChannel.current) {
        // Channel cleared externally → snap back to agent list
        externalClear.current = true;
        setPageImmediate(0);
      } else if (hasChannel && !prevHasChannel.current) {
        // Channel activated externally (e.g. push notification deep-link)
        // → navigate to chat page
        goToPageRef.current(1);
      }
      prevHasChannel.current = hasChannel;
    }, [hasChannel, setPageImmediate]);

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
              backdropRef={backdropRef}
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

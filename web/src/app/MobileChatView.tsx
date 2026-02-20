import { Capsule } from "@/components/capsule";
import XyzenAgent from "@/components/layouts/XyzenAgent";
import XyzenChat from "@/components/layouts/XyzenChat";
import CeoOverlay from "@/components/mobile/CeoOverlay";
import { useMobileNav } from "@/hooks/useMobileNav";
import { useMobileSwipe } from "@/hooks/useMobileSwipe";
import { forwardRef, useEffect, useImperativeHandle } from "react";

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
 * All business logic (overlay, channel lifecycle, page persistence)
 * lives in `useMobileNav`.
 */
const MobileChatView = forwardRef<MobileChatViewHandle, MobileChatViewProps>(
  function MobileChatView({ onPageChange }, ref) {
    const nav = useMobileNav();

    const { wrapperRef, trackRef, currentPage, goToPage, setPageImmediate } =
      useMobileSwipe({ pageCount: nav.pageCount, onSnap: nav.onSnap });

    // Wire swipe controls into nav hook (safe: effects run after body)
    nav.goToPageRef.current = goToPage;
    nav.setPageImmediateRef.current = setPageImmediate;

    useImperativeHandle(ref, () => ({ goToPage, currentPage }), [
      goToPage,
      currentPage,
    ]);

    useEffect(() => {
      onPageChange?.(currentPage);
    }, [currentPage, onPageChange]);

    return (
      <div ref={wrapperRef} className="h-full overflow-hidden">
        <div ref={trackRef} className="flex h-full will-change-transform">
          {/* Page 0: Agent List + CEO Overlay */}
          <div className="relative h-full shrink-0 w-full">
            <XyzenAgent
              onNavigateToChat={nav.navigateToChat}
              scrollRef={nav.agentScrollRef}
              onSortModeChange={nav.setAgentSortMode}
            />
            <CeoOverlay
              visible={nav.overlay}
              overlayRef={nav.overlayRef}
              onDismiss={nav.dismissOverlay}
              onNavigateToChat={nav.navigateToChat}
            />
          </div>

          {/* Page 1: Chat */}
          {nav.hasChannel && (
            <div className="h-full shrink-0 w-full bg-white dark:bg-neutral-950">
              <XyzenChat />
            </div>
          )}

          {/* Page 2: Capsule */}
          {nav.hasCapsule && (
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

import { Capsule } from "@/components/capsule";
import XyzenAgent from "@/components/layouts/XyzenAgent";
import XyzenChat from "@/components/layouts/XyzenChat";
import { useActiveChannelStatus } from "@/hooks/useChannelSelectors";
import { useMobileSwipe } from "@/hooks/useMobileSwipe";
import { useXyzen } from "@/store";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
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
    const { t } = useTranslation();
    const { activeChatChannel, setActiveChatChannel } = useXyzen(
      useShallow((s) => ({
        activeChatChannel: s.activeChatChannel,
        setActiveChatChannel: s.setActiveChatChannel,
      })),
    );
    const { knowledge_set_id } = useActiveChannelStatus();

    const hasChannel = !!activeChatChannel;
    const hasCapsule = hasChannel && !!knowledge_set_id;
    const pageCount = hasCapsule ? 3 : hasChannel ? 2 : 1;

    // Prevent clearing activeChatChannel when the snap to page 0
    // was triggered by *us* due to an external channel-clear.
    const externalClear = useRef(false);
    // Track whether we were previously in chat
    const prevHasChannel = useRef(hasChannel);

    const handleSnap = useCallback(
      (page: number) => {
        if (page === 0 && hasChannel && !externalClear.current) {
          setActiveChatChannel(null);
        }
        externalClear.current = false;
      },
      [hasChannel, setActiveChatChannel],
    );

    const { wrapperRef, trackRef, currentPage, goToPage, setPageImmediate } =
      useMobileSwipe({ pageCount, onSnap: handleSnap });

    // Keep goToPage always-current via ref so async callbacks never go stale.
    // `goToPage` (= snapTo) is recreated whenever pageCount changes, but the
    // ref is updated synchronously on every render — before any await resumes.
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
          {/* ---- Page 0: Agent List ---- */}
          <div className="h-full shrink-0 w-full bg-white dark:bg-neutral-950 flex flex-col">
            <div className="sm:border-b border-neutral-200 p-4 dark:border-neutral-800 shrink-0">
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
                {t("app.chat.assistantsTitle")}
              </h2>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {t("app.chat.chooseAgentHint")}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar py-4">
              <XyzenAgent onNavigateToChat={navigateToChat} />
            </div>
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

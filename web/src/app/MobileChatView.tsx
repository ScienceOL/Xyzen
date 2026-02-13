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

export interface MobileChatViewHandle {
  /** Navigate to a page: 0 = agents, 1 = chat, 2 = capsule */
  goToPage: (page: number) => void;
  currentPage: number;
}

/**
 * Mobile three-page swipeable view:
 *   [Agent List]  ←→  [Chat]  ←→  [Capsule]
 *
 * Uses iOS-style gesture-driven navigation via `useMobileSwipe`.
 * Content follows the finger 1:1 during the drag and snaps with
 * velocity-based momentum on release.
 */
const MobileChatView = forwardRef<MobileChatViewHandle>(
  function MobileChatView(_props, ref) {
    const { t } = useTranslation();
    const { activeChatChannel, setActiveChatChannel } = useXyzen();
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

    // Expose imperative handle for the parent (e.g. header back button)
    useImperativeHandle(ref, () => ({ goToPage, currentPage }), [
      goToPage,
      currentPage,
    ]);

    // ---- Page transitions driven by activeChatChannel ----
    useEffect(() => {
      if (hasChannel && !prevHasChannel.current) {
        // Entering chat: start at page 0 then animate to page 1
        setPageImmediate(0);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            goToPage(1, false); // no onSnap callback needed
          });
        });
      } else if (!hasChannel && prevHasChannel.current) {
        // Channel cleared externally (not by our swipe-back)
        externalClear.current = true;
        setPageImmediate(0);
      }
      prevHasChannel.current = hasChannel;
    }, [hasChannel, goToPage, setPageImmediate]);

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
              <XyzenAgent />
            </div>
          </div>

          {/* ---- Page 1: Chat ---- */}
          {hasChannel && (
            <div className="h-full shrink-0 w-full bg-white dark:bg-black">
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

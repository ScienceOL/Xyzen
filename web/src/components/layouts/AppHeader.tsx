import { AuthStatus } from "@/components/features";
import { PointsInfoModal } from "@/components/features/PointsInfoModal";
import { CheckInModal } from "@/components/modals/CheckInModal";
import { useAuth } from "@/hooks/useAuth";
import { useUserWallet } from "@/hooks/useUserWallet";
import { useXyzen } from "@/store";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  InformationCircleIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { PanelRightCloseIcon } from "lucide-react";
import { useState } from "react";

export interface AppHeaderProps {
  className?: string;
  variant?: "fullscreen" | "side";
  // For side variant
  isMobile?: boolean;
  showLlmProvider?: boolean;
  onDragStart?: (e: React.PointerEvent) => void;
  onDragMove?: (e: React.PointerEvent) => void;
  onDragEnd?: (e: React.PointerEvent) => void;
  showBackButton?: boolean;
  onBackClick?: () => void;
  backButtonLabel?: string;
}

export function AppHeader({
  className = "",
  variant = "fullscreen",
  isMobile = false,
  onDragStart,
  onDragMove,
  onDragEnd,
  showBackButton = false,
  onBackClick,
  backButtonLabel = "Chat",
}: AppHeaderProps) {
  const { closeXyzen } = useXyzen();
  const auth = useAuth();
  const [showPointsInfo, setShowPointsInfo] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);

  const isAuthedForUi = auth.isAuthenticated || !!auth.token;
  const walletQuery = useUserWallet(auth.token, isAuthedForUi);

  const isFullscreen = variant === "fullscreen";
  const isSide = variant === "side";

  const baseHeaderClasses = isFullscreen
    ? "flex h-14 shrink-0 items-center justify-between px-4 bg-white/80 dark:bg-black/60 backdrop-blur-md supports-[backdrop-filter]:backdrop-blur-md shadow-sm ring-1 ring-neutral-200/60 dark:ring-neutral-800/60"
    : `flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 px-4 dark:border-neutral-800 ${
        !isMobile ? "cursor-move select-none active:cursor-grabbing" : ""
      }`;

  return (
    <>
      <header
        className={`${baseHeaderClasses} ${className}`}
        onPointerDown={isSide ? onDragStart : undefined}
        onPointerMove={isSide ? onDragMove : undefined}
        onPointerUp={isSide ? onDragEnd : undefined}
      >
        <div className="flex items-center gap-2">
          {showBackButton && onBackClick ? (
            <button
              className="rounded-sm flex items-center gap-2 p-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              title="Back to Assistants"
              onClick={(e) => {
                e.stopPropagation();
                onBackClick();
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <ChevronLeftIcon className="size-4" />
              <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {backButtonLabel}
              </h3>
            </button>
          ) : (
            <h1 className="text-base sm:text-lg font-semibold tracking-tight bg-linear-to-r from-indigo-600 via-purple-600 to-pink-600 dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400 bg-clip-text text-transparent pointer-events-none">
              Xyzen
            </h1>
          )}

          {isSide && !isMobile && (
            <div className="ml-2 pointer-events-none">
              <kbd className="rounded border border-neutral-300 bg-neutral-50 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                ⌘⇧X
              </kbd>
            </div>
          )}
        </div>

        <div
          className="flex items-center space-x-1"
          onPointerDown={isSide ? (e) => e.stopPropagation() : undefined}
        >
          {/* Points Balance Display */}
          {isAuthedForUi && (
            <>
              <div className="flex items-center gap-1.5 rounded-md border border-indigo-100 bg-linear-to-br from-indigo-50/80 to-white px-2 py-1 sm:gap-2 sm:px-3 sm:py-1.5 dark:border-indigo-500/20 dark:from-indigo-950/20 dark:to-neutral-900/20">
                <div className="hidden sm:flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400">
                  <SparklesIcon className="h-3.5 w-3.5" />
                </div>
                <div className="hidden sm:flex items-center gap-1 sm:gap-1.5">
                  <span className="hidden text-xs font-medium text-neutral-500 dark:text-neutral-400 sm:inline">
                    积分
                  </span>
                  <span className="sr-only">
                    {walletQuery.isLoading
                      ? "积分加载中"
                      : `积分 ${(walletQuery.data?.virtual_balance ?? "--").toString()}`}
                  </span>
                  <span className="hidden text-sm font-bold text-indigo-900 dark:text-indigo-100 sm:inline sm:text-base">
                    {walletQuery.isLoading
                      ? "..."
                      : (walletQuery.data?.virtual_balance ?? "--")}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPointsInfo(true)}
                  className="rounded-full p-0.5 text-neutral-400 transition-colors hover:bg-white/50 hover:text-indigo-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-indigo-400"
                  title="积分说明"
                >
                  <InformationCircleIcon className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowCheckInModal(true)}
                className="rounded-md border border-amber-100 bg-linear-to-br from-amber-50/80 to-white px-2 py-1 text-sm font-medium text-amber-700 transition-colors hover:from-amber-100/80 hover:to-amber-50 sm:px-2.5 sm:py-1.5 dark:border-amber-500/20 dark:from-amber-950/20 dark:to-neutral-900/20 dark:text-amber-400 dark:hover:from-amber-900/30 dark:hover:to-amber-950/30"
                title="每日签到"
              >
                <div className="flex items-center gap-1.5">
                  <CalendarDaysIcon className="h-4 w-4" />
                  <span className="sr-only">签到</span>
                  <span className="hidden sm:inline">签到</span>
                </div>
              </button>
              <div className="mx-2 hidden h-6 w-px bg-neutral-200 dark:bg-neutral-700 sm:block"></div>
            </>
          )}

          <AuthStatus className="ml-2" />
          {isSide && !isMobile && (
            <button
              onClick={closeXyzen}
              className="rounded-sm p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-red-500 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-red-400"
              title="Close"
            >
              <PanelRightCloseIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      </header>

      <PointsInfoModal
        isOpen={showPointsInfo}
        onClose={() => setShowPointsInfo(false)}
      />
      <CheckInModal
        isOpen={showCheckInModal}
        onClose={() => setShowCheckInModal(false)}
      />
    </>
  );
}

import { ChevronLeftIcon, CogIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";

import McpIcon from "@/assets/McpIcon";
import { AuthStatus, SettingsButton } from "@/components/features";
import ToggleSidePanelShortcutHint from "@/components/features/ToggleSidePanelShortcutHint";
import { ActivityBar } from "@/components/layouts/ActivityBar";
import KnowledgeBase from "@/components/layouts/KnowledgeBase";
import { McpListModal } from "@/components/layouts/McpListModal";
import XyzenAgent from "@/components/layouts/XyzenAgent";
import XyzenChat from "@/components/layouts/XyzenChat";
import { SettingsModal } from "@/components/modals/SettingsModal";
import { DEFAULT_BACKEND_URL } from "@/configs";
import { DEFAULT_WIDTH, MIN_WIDTH } from "@/configs/common";
import { useXyzen } from "@/store";
import { PanelRightCloseIcon } from "lucide-react";
import AuthErrorScreen from "./auth/AuthErrorScreen";
import AgentMarketplace from "@/app/marketplace/AgentMarketplace";

export interface AppSideProps {
  backendUrl?: string;
  showLlmProvider?: boolean;
  isMobile?: boolean; // when true, sidebar occupies full viewport width and is not resizable
  showAuthError?: boolean; // when auth failed, render error inline in panel
  onRetryAuth?: () => void;
}

const MIN_HEIGHT = 400;

type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export function AppSide({
  backendUrl = DEFAULT_BACKEND_URL,
  showLlmProvider = false,
  isMobile = false,
  showAuthError = false,
  onRetryAuth,
}: AppSideProps) {
  const {
    isXyzenOpen,
    closeXyzen,
    activePanel,
    setActivePanel,
    setBackendUrl,
    openMcpListModal,
    openSettingsModal,
  } = useXyzen();
  const { activeChatChannel, setActiveChatChannel } = useXyzen();

  const [mounted, setMounted] = useState(false);

  // Floating window state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const resizeDirRef = useRef<ResizeDirection | null>(null);

  // Init backend; auth is initialized at App root
  useEffect(() => {
    setMounted(true);
    setBackendUrl(backendUrl);

    // Set initial position centered-right if not set
    if (typeof window !== "undefined") {
      const initialHeight = Math.min(window.innerHeight - 100, 700);
      const initialWidth = DEFAULT_WIDTH;
      const initialX = window.innerWidth - initialWidth - 50;
      const initialY = (window.innerHeight - initialHeight) / 2;

      setPosition({
        x: Math.max(20, initialX),
        y: Math.max(20, initialY),
      });
      setSize({
        width: initialWidth,
        height: initialHeight,
      });
    }
  }, [backendUrl, setBackendUrl]);

  // Keyboard shortcut to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "X") {
        e.preventDefault();
        if (isXyzenOpen) closeXyzen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isXyzenOpen, closeXyzen]);

  // --- Dragging Logic ---
  const dragStartPos = useRef({ x: 0, y: 0 });
  const windowStartPos = useRef({ x: 0, y: 0 });

  const handleDragStart = (e: React.PointerEvent) => {
    if (isMobile) return;
    // Don't drag if clicking a button or interactive element
    if ((e.target as HTMLElement).closest("button, [role='button']")) return;

    setIsDragging(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    windowStartPos.current = { ...position };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleDragMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    const dx = e.clientX - dragStartPos.current.x;
    const dy = e.clientY - dragStartPos.current.y;

    let newX = windowStartPos.current.x + dx;
    let newY = windowStartPos.current.y + dy;

    // Constraint: Prevent dragging completely outside the screen
    const maxX = window.innerWidth - size.width;
    const maxY = window.innerHeight - size.height;

    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));

    setPosition({ x: newX, y: newY });
  };

  const handleDragEnd = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // --- Resizing Logic ---
  const resizeStartPos = useRef({ x: 0, y: 0 });
  const windowStartSize = useRef({ width: 0, height: 0 });
  const windowStartPosForResize = useRef({ x: 0, y: 0 });

  const handleResizeStart = (e: React.PointerEvent, dir: ResizeDirection) => {
    if (isMobile) return;
    e.preventDefault();
    e.stopPropagation();

    setIsResizing(true);
    resizeDirRef.current = dir;
    resizeStartPos.current = { x: e.clientX, y: e.clientY };
    windowStartSize.current = { ...size };
    windowStartPosForResize.current = { ...position };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleResizeMove = (e: React.PointerEvent) => {
    if (!isResizing || !resizeDirRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const dx = e.clientX - resizeStartPos.current.x;
    const dy = e.clientY - resizeStartPos.current.y;

    const startW = windowStartSize.current.width;
    const startH = windowStartSize.current.height;
    const startX = windowStartPosForResize.current.x;
    const startY = windowStartPosForResize.current.y;

    let newW = startW;
    let newH = startH;
    let newX = startX;
    let newY = startY;

    const dir = resizeDirRef.current;

    // Apply delta based on direction
    if (dir.includes("e")) newW = startW + dx;
    if (dir.includes("w")) {
      newW = startW - dx;
      newX = startX + dx;
    }
    if (dir.includes("s")) newH = startH + dy;
    if (dir.includes("n")) {
      newH = startH - dy;
      newY = startY + dy;
    }

    // Min Dimensions
    if (newW < MIN_WIDTH) {
      newW = MIN_WIDTH;
      if (dir.includes("w")) newX = startX + (startW - MIN_WIDTH);
    }
    if (newH < MIN_HEIGHT) {
      newH = MIN_HEIGHT;
      if (dir.includes("n")) newY = startY + (startH - MIN_HEIGHT);
    }

    // Boundary Checks (Constraint to screen)
    if (newX < 0) {
      const diff = 0 - newX;
      newX = 0;
      newW -= diff;
    }
    if (newY < 0) {
      const diff = 0 - newY;
      newY = 0;
      newH -= diff;
    }
    if (newX + newW > window.innerWidth) {
      newW = window.innerWidth - newX;
    }
    if (newY + newH > window.innerHeight) {
      newH = window.innerHeight - newY;
    }

    setSize({ width: newW, height: newH });
    setPosition({ x: newX, y: newY });
  };

  const handleResizeEnd = (e: React.PointerEvent) => {
    setIsResizing(false);
    resizeDirRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  if (!mounted) return null;

  // Styles based on mode
  const mobileStyle: React.CSSProperties = {
    position: "fixed",
    right: 0,
    top: 0,
    width: "100%",
    height: "100%",
    zIndex: 50,
  };

  const desktopStyle: React.CSSProperties = {
    position: "fixed",
    left: position.x,
    top: position.y,
    width: size.width,
    height: size.height,
    zIndex: 50,
    boxShadow:
      "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
  };

  return (
    <>
      <div
        className={`flex flex-col bg-white dark:bg-black dark:border dark:border-neutral-800 overflow-visible ${
          !isMobile ? "rounded-xl border border-neutral-200" : ""
        }`}
        style={isMobile ? mobileStyle : desktopStyle}
      >
        {/* Resize Handles (Desktop Only) */}
        {!isMobile && (
          <>
            {/* Edge Handles */}
            <div
              className="absolute top-0 left-0 w-full h-1.5 cursor-ns-resize z-50 bg-transparent hover:bg-indigo-500/10 transition-colors"
              onPointerDown={(e) => handleResizeStart(e, "n")}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
            />
            <div
              className="absolute bottom-0 left-0 w-full h-1.5 cursor-ns-resize z-50 bg-transparent hover:bg-indigo-500/10 transition-colors"
              onPointerDown={(e) => handleResizeStart(e, "s")}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
            />
            <div
              className="absolute top-0 left-0 w-1.5 h-full cursor-ew-resize z-50 bg-transparent hover:bg-indigo-500/10 transition-colors"
              onPointerDown={(e) => handleResizeStart(e, "w")}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
            />
            <div
              className="absolute top-0 right-0 w-1.5 h-full cursor-ew-resize z-50 bg-transparent hover:bg-indigo-500/10 transition-colors"
              onPointerDown={(e) => handleResizeStart(e, "e")}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
            />

            {/* Corner Handles */}
            <div
              className="absolute top-0 left-0 w-4 h-4 cursor-nwse-resize z-[51] bg-transparent"
              onPointerDown={(e) => handleResizeStart(e, "nw")}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
            />
            <div
              className="absolute top-0 right-0 w-4 h-4 cursor-nesw-resize z-[51] bg-transparent"
              onPointerDown={(e) => handleResizeStart(e, "ne")}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
            />
            <div
              className="absolute bottom-0 left-0 w-4 h-4 cursor-nesw-resize z-[51] bg-transparent"
              onPointerDown={(e) => handleResizeStart(e, "sw")}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
            />
            <div
              className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-[51] bg-transparent"
              onPointerDown={(e) => handleResizeStart(e, "se")}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
            />
          </>
        )}

        {/* Header Area */}
        <div
          className={`flex h-14 flex-shrink-0 items-center justify-between border-b border-neutral-200 px-4 dark:border-neutral-800 ${
            !isMobile ? "cursor-move select-none active:cursor-grabbing" : ""
          }`}
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
        >
          <div className="flex items-center gap-2">
            {activePanel === "chat" && activeChatChannel ? (
              <button
                className="rounded-sm flex items-center gap-2 p-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                title="Back to Assistants"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveChatChannel(null);
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <ChevronLeftIcon className="size-4" />
                <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  {activeChatChannel ? "Chat" : "Assistants"}
                </h3>
              </button>
            ) : (
              <h1 className="text-base sm:text-lg font-semibold tracking-tight bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400 bg-clip-text text-transparent pointer-events-none">
                Xyzen
              </h1>
            )}

            {!isMobile && <ToggleSidePanelShortcutHint />}
          </div>

          <div
            className="flex items-center space-x-1"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <SettingsButton />
            <button
              className="rounded-sm p-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              title="MCP Management"
              onClick={openMcpListModal}
            >
              <McpIcon className="h-5 w-5" />
            </button>
            {showLlmProvider && (
              <button
                className="rounded-sm p-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                title="LLM Providers"
                onClick={() => openSettingsModal("provider")}
              >
                <CogIcon className="h-5 w-5" />
              </button>
            )}
            <div className="mx-2 h-6 w-px bg-neutral-200 dark:bg-neutral-700" />
            <AuthStatus className="ml-2" />
            {!isMobile && (
              <button
                onClick={closeXyzen}
                className="rounded-sm p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-red-500 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-red-400"
                title="Close"
              >
                <PanelRightCloseIcon className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Content Area with Sidebar */}
        <div className="flex flex-1 overflow-hidden relative">
          {/* Activity Bar (Left Sidebar on Desktop) */}
          {!isMobile && (
            <ActivityBar
              activePanel={activePanel}
              onPanelChange={setActivePanel}
              isMobile={false}
            />
          )}

          {/* Main Content */}
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-neutral-950">
            {activePanel === "chat" &&
              (activeChatChannel ? (
                <div className="h-full">
                  <div className="h-full bg-white dark:bg-black">
                    <XyzenChat />
                  </div>
                </div>
              ) : (
                <div className="h-full bg-white dark:bg-neutral-950 flex flex-col">
                  <div className="border-b border-neutral-200 p-4 dark:border-neutral-800 flex-shrink-0">
                    <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
                      Assistants
                    </h2>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      Choose an agent to start
                    </p>
                  </div>
                  <div className="flex-1 overflow-y-auto py-4">
                    <XyzenAgent systemAgentType="chat" />
                  </div>
                </div>
              ))}

            {activePanel === "knowledge" && <KnowledgeBase />}

            {activePanel === "marketplace" && (
              <div className="h-full bg-white dark:bg-neutral-950">
                <AgentMarketplace />
              </div>
            )}

            {showAuthError && (
              <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
                <div className="w-full max-w-md px-4">
                  <AuthErrorScreen
                    onRetry={onRetryAuth ?? (() => {})}
                    variant="inline"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Activity Bar (Bottom) */}
        {isMobile && (
          <ActivityBar
            activePanel={activePanel}
            onPanelChange={setActivePanel}
            isMobile={true}
          />
        )}
      </div>

      <McpListModal />
      <SettingsModal />
    </>
  );
}

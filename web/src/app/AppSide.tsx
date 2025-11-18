import type {
  DragEndEvent,
  DragMoveEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import { ChevronLeftIcon, CogIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import McpIcon from "@/assets/McpIcon";
import { AuthStatus, SettingsButton } from "@/components/features";
import ToggleSidePanelShortcutHint from "@/components/features/ToggleSidePanelShortcutHint";
import { McpListModal } from "@/components/layouts/McpListModal";
import XyzenAgent from "@/components/layouts/XyzenAgent";
import XyzenChat from "@/components/layouts/XyzenChat";
import { SettingsModal } from "@/components/modals/SettingsModal";
import { DEFAULT_BACKEND_URL } from "@/configs";
import { DEFAULT_WIDTH, MAX_WIDTH, MIN_WIDTH } from "@/configs/common";
import { useXyzen } from "@/store";
import { PanelRightCloseIcon } from "lucide-react";
import AuthErrorScreen from "./auth/AuthErrorScreen";

export interface AppSideProps {
  backendUrl?: string;
  showLlmProvider?: boolean;
  isMobile?: boolean; // when true, sidebar occupies full viewport width and is not resizable
  showAuthError?: boolean; // when auth failed, render error inline in panel
  onRetryAuth?: () => void;
}

// Resizer handle only shown on non-mobile
function DragHandle({
  isActive,
  onDoubleClick,
}: {
  isActive: boolean;
  onDoubleClick: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: "xyzen-resizer",
  });
  return (
    <div
      ref={setNodeRef}
      className={`absolute left-0 top-0 z-50 h-full w-1 cursor-col-resize ${
        isActive
          ? "bg-indigo-500 shadow-md dark:bg-indigo-400"
          : "bg-transparent hover:bg-indigo-400/60 hover:shadow-sm dark:hover:bg-indigo-500/60"
      } transition-all duration-150 ease-in-out`}
      {...listeners}
      {...attributes}
      onDoubleClick={onDoubleClick}
    />
  );
}

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
    panelWidth,
    setPanelWidth,
    activePanel,
    setBackendUrl,
    user,
    fetchAgents,
    fetchMcpServers,
    openMcpListModal,
    openSettingsModal,
  } = useXyzen();
  const { activeChatChannel, setActiveChatChannel } = useXyzen();

  const [mounted, setMounted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const lastWidthRef = useRef<number>(panelWidth);

  // Init backend; auth is initialized at App root
  useEffect(() => {
    setMounted(true);
    setBackendUrl(backendUrl);
  }, [backendUrl, setBackendUrl]);

  // Load initial data
  const loadInitialData = useCallback(async () => {
    if (user && backendUrl) {
      try {
        await Promise.all([fetchAgents(), fetchMcpServers()]);
      } catch (error) {
        console.error("Failed to load initial data:", error);
      }
    }
  }, [user, backendUrl, fetchAgents, fetchMcpServers]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Sensors only when resizable
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const clamp = (n: number, min: number, max: number) =>
    Math.max(min, Math.min(max, n));

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      if (event.active.id !== "xyzen-resizer") return;
      setIsDragging(true);
      lastWidthRef.current = panelWidth;
    },
    [panelWidth],
  );

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      if (event.active.id !== "xyzen-resizer") return;
      // disable all animate css
      const deltaX = event.delta.x; // positive: right, negative: left
      const next = clamp(lastWidthRef.current - deltaX, MIN_WIDTH, MAX_WIDTH);
      setPanelWidth(next);
    },
    [setPanelWidth],
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    if (event.active.id !== "xyzen-resizer") return;
    setIsDragging(false);
  }, []);

  const handleResizeDoubleClick = useCallback(() => {
    setPanelWidth(DEFAULT_WIDTH);
    lastWidthRef.current = DEFAULT_WIDTH;
  }, [setPanelWidth]);

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

  // Effective width: mobile = 100vw, desktop = panelWidth
  const containerStyle = useMemo(() => {
    if (isMobile) {
      return { width: "100vw", transition: "none" as const };
    }
    return {
      width: `${panelWidth || DEFAULT_WIDTH}px`,
      transition: isDragging ? "none" : "width 0.2s ease-in-out",
    };
  }, [isMobile, panelWidth, isDragging]);

  if (!mounted) return null;

  return (
    <>
      {/* Mobile & Desktop unified structure for easier overlay handling */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToHorizontalAxis]}
      >
        <div
          className={
            isMobile
              ? "fixed right-0 top-0 z-50 h-full bg-white shadow-xl dark:border-l dark:border-neutral-800 dark:bg-black"
              : "fixed right-0 top-0 z-50 h-full bg-white shadow-xl dark:border-l dark:border-neutral-800 dark:bg-black"
          }
          style={containerStyle}
        >
          <div className="flex h-full">
            {/* Resizer handle (shows on desktop; present but width ignored on mobile) */}
            {!isMobile && (
              <DragHandle
                isActive={isDragging}
                onDoubleClick={handleResizeDoubleClick}
              />
            )}
            {/* Activity Bar */}
            {/* <div className="w-16 flex-shrink-0 border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950">
              <ActivityBar
                activePanel={activePanel}
                onPanelChange={setActivePanel}
              />
            </div> */}
            {/* Main Content */}
            <div className="flex flex-1 flex-col relative">
              {/* Header */}
              <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-neutral-200 px-4 dark:border-neutral-800">
                <div className="flex items-center gap-2">
                  {activePanel === "chat" && activeChatChannel ? (
                    <button
                      className="rounded-sm flex items-center gap-2 p-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                      title="返回 Assistants"
                      onClick={() => setActiveChatChannel(null)}
                    >
                      <ChevronLeftIcon className="size-4" />
                      <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        {activePanel === "chat"
                          ? activeChatChannel
                            ? "Chat"
                            : "Assistants"
                          : activePanel === "explorer"
                            ? "Explorer"
                            : "Workshop"}
                      </h3>
                    </button>
                  ) : (
                    <h1 className="text-base sm:text-lg font-semibold tracking-tight bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
                      Xyzen
                    </h1>
                  )}

                  {/* Shortcut hint (only in sidebar mode) */}
                  {!isMobile && <ToggleSidePanelShortcutHint />}
                </div>
                <div className="flex items-center space-x-1">
                  <SettingsButton />
                  <button
                    className="rounded-sm p-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                    title="MCP 管理"
                    onClick={openMcpListModal}
                  >
                    <McpIcon className="h-5 w-5" />
                  </button>
                  {showLlmProvider && (
                    <button
                      className="rounded-sm p-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                      title="LLM 提供商"
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
                      className="rounded-sm p-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                      title="关闭"
                    >
                      <PanelRightCloseIcon className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>
              {/* Content area */}
              <div className="flex-1 overflow-hidden">
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
                {/* {activePanel === "explorer" && <Explorer />}
                {activePanel === "workshop" && <Workshop />} */}
              </div>
              {showAuthError && (
                <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
                  <div className="w-full max-w-md px-4">
                    <AuthErrorScreen
                      onRetry={onRetryAuth ?? (() => {})}
                      variant="inline"
                    />
                    <div className="hidden mt-3 lg:flex items-center justify-center text-xs text-neutral-500 dark:text-neutral-400">
                      <ToggleSidePanelShortcutHint />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Keep quick actions and input overlays consistent with original sidebar */}
      </DndContext>

      <McpListModal />
      <SettingsModal />
    </>
  );
}

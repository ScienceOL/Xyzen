import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragMoveEvent,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
  ChevronLeftIcon,
  CogIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Explorer from "@/app/explore/page";
import McpIcon from "@/assets/McpIcon";
import {
  AuthStatus,
  CenteredInput,
  SettingsButton,
} from "@/components/features";
import ActivityBar from "@/components/layouts/ActivityBar";
import Workshop from "@/components/layouts/Workshop";
import XyzenAgent from "@/components/layouts/XyzenAgent";
import XyzenChat from "@/components/layouts/XyzenChat";
import { AddLlmProviderModal } from "@/components/modals/AddLlmProviderModal";
import { AddMcpServerModal } from "@/components/modals/AddMcpServerModal";
import { DEFAULT_BACKEND_URL } from "@/configs";
import { useXyzen } from "@/store";
import { PanelRightCloseIcon } from "lucide-react";

export interface AppSideProps {
  backendUrl?: string;
  showLlmProvider?: boolean;
  isMobile?: boolean; // when true, sidebar occupies full viewport width and is not resizable
}

const MIN_WIDTH = 280;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 380;

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
}: AppSideProps) {
  const {
    isXyzenOpen,
    closeXyzen,
    panelWidth,
    setPanelWidth,
    activePanel,
    setActivePanel,
    setBackendUrl,
    user,
    fetchAgents,
    fetchMcpServers,
    fetchUserByToken,
    openMcpListModal,
    openSettingsModal,
  } = useXyzen();
  const { activeChatChannel, setActiveChatChannel } = useXyzen();

  const [mounted, setMounted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const lastWidthRef = useRef(panelWidth || DEFAULT_WIDTH);

  // Init backend & user session
  useEffect(() => {
    setMounted(true);
    setBackendUrl(backendUrl);
    fetchUserByToken();
  }, [backendUrl, setBackendUrl, fetchUserByToken]);

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

  const handleDragStart = () => {
    setIsDragging(true);
    lastWidthRef.current = panelWidth || DEFAULT_WIDTH;
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const newWidth = Math.min(
      Math.max(lastWidthRef.current - event.delta.x, MIN_WIDTH),
      MAX_WIDTH,
    );
    setPanelWidth(newWidth);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleResizeDoubleClick = () => {
    setPanelWidth(DEFAULT_WIDTH);
    lastWidthRef.current = DEFAULT_WIDTH;
  };

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
      {isMobile ? (
        // No DnD on mobile
        <div
          className="fixed right-0 top-0 z-50 h-full bg-white shadow-xl dark:border-l dark:border-neutral-800 dark:bg-black"
          style={containerStyle}
        >
          <div className="flex h-full">
            {/* Activity Bar */}
            <div className="w-16 flex-shrink-0 border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
              <ActivityBar
                activePanel={activePanel}
                onPanelChange={setActivePanel}
              />
            </div>

            {/* Main Content */}
            <div className="flex flex-1 flex-col">
              {/* Header */}
              <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-neutral-200 px-4 dark:border-neutral-800">
                <div className="flex items-center gap-2">
                  {activePanel === "chat" && activeChatChannel && (
                    <button
                      className="rounded-sm p-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                      title="返回 Assistants"
                      onClick={() => setActiveChatChannel(null)}
                    >
                      <ChevronLeftIcon className="h-5 w-5" />
                    </button>
                  )}
                  <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    {activePanel === "chat"
                      ? activeChatChannel
                        ? "Chat"
                        : "Assistants"
                      : activePanel === "explorer"
                        ? "Explorer"
                        : "Workshop"}
                  </h3>
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
                  <div className="mx-2 h-6 w-px bg-neutral-200 dark:bg-neutral-700"></div>
                  <AuthStatus className="ml-2" />
                  <button
                    onClick={closeXyzen}
                    className="rounded-sm p-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                    title="关闭"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-hidden">
                {activePanel === "chat" &&
                  (activeChatChannel ? (
                    // 已选择会话：仅显示聊天
                    <div className="h-full">
                      <div className="h-full bg-white dark:bg-black">
                        <XyzenChat />
                      </div>
                    </div>
                  ) : (
                    // 未选择会话：仅显示 Assistants 列表
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
                {activePanel === "explorer" && <Explorer />}
                {activePanel === "workshop" && <Workshop />}
              </div>
            </div>
          </div>
        </div>
      ) : (
        // Desktop with resizable panel
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToHorizontalAxis]}
        >
          <div
            className="fixed right-0 top-0 z-50 h-full bg-white shadow-xl dark:border-l dark:border-neutral-800 dark:bg-black"
            style={containerStyle}
          >
            <DragHandle
              isActive={isDragging}
              onDoubleClick={handleResizeDoubleClick}
            />
            <div className="flex h-full">
              {/* Activity Bar */}
              <div className="w-16 flex-shrink-0 border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
                <ActivityBar
                  activePanel={activePanel}
                  onPanelChange={setActivePanel}
                />
              </div>

              {/* Main Content */}
              <div className="flex flex-1 flex-col">
                {/* Header */}
                <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-neutral-200 px-4 dark:border-neutral-800">
                  <div className="flex items-center gap-2">
                    {activePanel === "chat" && activeChatChannel && (
                      <button
                        className="rounded-sm p-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                        title="返回 Assistants"
                        onClick={() => setActiveChatChannel(null)}
                      >
                        <ChevronLeftIcon className="h-5 w-5" />
                      </button>
                    )}
                    <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      {activePanel === "chat"
                        ? activeChatChannel
                          ? "Chat"
                          : "Assistants"
                        : activePanel === "explorer"
                          ? "Explorer"
                          : "Workshop"}
                    </h3>
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
                    <div className="mx-2 h-6 w-px bg-neutral-200 dark:bg-neutral-700"></div>
                    <AuthStatus className="ml-2" />
                    <button
                      onClick={closeXyzen}
                      className="rounded-sm p-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                      title="关闭"
                    >
                      <PanelRightCloseIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Content */}
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
                  {activePanel === "explorer" && <Explorer />}
                  {activePanel === "workshop" && <Workshop />}
                </div>
              </div>
            </div>
          </div>
        </DndContext>
      )}
      {/* Keep quick actions and input overlays consistent with original sidebar */}
      <AddMcpServerModal />
      {showLlmProvider && <AddLlmProviderModal />}
      <CenteredInput />
    </>
  );
}

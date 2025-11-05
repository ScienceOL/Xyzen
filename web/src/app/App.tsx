import { useXyzen } from "@/store";
import type { DragMoveEvent } from "@dnd-kit/core";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";

// Import styles - these will be included in both app and library builds
import "@/styles/markdown.css";
import "@/styles/markdown.dark.css";
import "@/styles/markdown.quote.css";
import "@/styles/markdown.abstract.css";
import "@/styles/code-block.css";
import "@/styles/prose.css";
import {
  Dialog,
  DialogPanel,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { CogIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";

import { LlmProviders } from "@/app/LlmProviders";
import { Mcp } from "@/app/Mcp";
import { AppFullscreen } from "@/app/AppFullscreen";
import McpIcon from "@/assets/McpIcon";
import {
  AuthStatus,
  SettingsButton,
  CenteredInput,
} from "@/components/features";
import ActivityBar from "@/components/layouts/ActivityBar";
import Explorer from "@/components/layouts/Explorer";
import Workshop from "@/components/layouts/Workshop";
import XyzenAgent from "@/components/layouts/XyzenAgent";
import XyzenChat from "@/components/layouts/XyzenChat";
import { AddLlmProviderModal } from "@/components/modals/AddLlmProviderModal";
import { SettingsModal } from "@/components/modals/SettingsModal";
import { AddMcpServerModal } from "@/components/modals/AddMcpServerModal";
import { DEFAULT_BACKEND_URL } from "@/configs";
import useTheme from "@/hooks/useTheme";
// theme toggle is now a separate component

// 定义最小宽度和最大宽度限制
const MIN_WIDTH = 280;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 380;

// 定义拖拽手柄组件
const DragHandle = ({
  isActive,
  onDoubleClick,
}: {
  isActive: boolean;
  onDoubleClick: (e: React.MouseEvent) => void;
}) => {
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
    ></div>
  );
};

export interface XyzenProps {
  backendUrl?: string;
  showLlmProvider?: boolean;
}

export function Xyzen({
  backendUrl = DEFAULT_BACKEND_URL,
  showLlmProvider = false,
}: XyzenProps) {
  const { layoutStyle } = useXyzen();

  // Initialize theme at the top level so it works for both layouts
  useTheme();

  // Conditionally render layout based on style
  if (layoutStyle === "fullscreen") {
    return (
      <AppFullscreen
        backendUrl={backendUrl}
        showLlmProvider={showLlmProvider}
      />
    );
  }

  // Render sidebar layout
  return (
    <XyzenSidebar backendUrl={backendUrl} showLlmProvider={showLlmProvider} />
  );
}

// Sidebar layout component
function XyzenSidebar({
  backendUrl = DEFAULT_BACKEND_URL,
  showLlmProvider = false,
}: Omit<XyzenProps, "showThemeToggle">) {
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
  } = useXyzen();
  const [mounted, setMounted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isMcpOpen, setIsMcpOpen] = useState(false);
  const [isLlmProvidersOpen, setIsLlmProvidersOpen] = useState(false);
  const lastWidthRef = useRef(panelWidth);

  // Note: Legacy tab system replaced with ActivityBar

  // 初始化：设置后端URL和获取用户信息
  useEffect(() => {
    setMounted(true);
    setBackendUrl(backendUrl);
    // 尝试从localStorage恢复用户会话
    fetchUserByToken();
  }, [backendUrl, setBackendUrl, fetchUserByToken]);

  // 初始化加载基础数据
  const loadInitialData = useCallback(async () => {
    if (user && backendUrl) {
      // 加载 agents 和 MCP servers 数据，这些是 ChatToolbar 需要的
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

  // 优化 dnd-kit sensor 配置
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const handleDragStart = () => {
    setIsDragging(true);
    lastWidthRef.current = panelWidth;
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

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Shift + X to toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "X") {
        e.preventDefault();
        if (isXyzenOpen) {
          closeXyzen();
        }
        // When sidebar is closed, the input is automatically shown
        // No need to explicitly open input focus
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isXyzenOpen, closeXyzen]);

  if (!mounted) return null;

  if (!isXyzenOpen) {
    return <CenteredInput />;
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToHorizontalAxis]}
    >
      <div
        className={`fixed right-0 top-0 z-50 h-full bg-white shadow-xl dark:border-l dark:border-neutral-800 dark:bg-black`}
        style={{
          width: `${panelWidth}px`,
          transition: isDragging ? "none" : "width 0.2s ease-in-out",
        }}
      >
        <DragHandle
          isActive={isDragging}
          onDoubleClick={handleResizeDoubleClick}
        />

        <div className="flex h-full">
          {/* VSCode-like Activity Bar - Leftmost vertical bar */}
          <div className="w-16 flex-shrink-0 border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
            <ActivityBar
              activePanel={activePanel}
              onPanelChange={setActivePanel}
            />
          </div>

          {/* Main Content Area */}
          <div className="flex flex-1 flex-col">
            {/* Header Bar */}
            <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-neutral-200 px-4 dark:border-neutral-800">
              <div className="flex items-center">
                <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  {activePanel === "chat"
                    ? "Chat"
                    : activePanel === "explorer"
                      ? "Explorer"
                      : "Workshop"}
                </h3>
              </div>
              <div className="flex items-center space-x-1">
                <SettingsButton />
                <button
                  className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  title="MCP 管理"
                  onClick={() => setIsMcpOpen(true)}
                >
                  <McpIcon className="h-5 w-5" />
                </button>
                {showLlmProvider && (
                  <button
                    className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                    title="LLM 提供商"
                    onClick={() => setIsLlmProvidersOpen(true)}
                  >
                    <CogIcon className="h-5 w-5" />
                  </button>
                )}
                <div className="mx-2 h-6 w-px bg-neutral-200 dark:bg-neutral-700"></div>
                <AuthStatus className="ml-2" />
                <button
                  onClick={closeXyzen}
                  className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  title="关闭"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden">
              {activePanel === "chat" && (
                <div className="flex h-full">
                  {/* Left: Agents */}
                  <div className="w-80 flex-shrink-0 border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950 flex flex-col">
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
                  {/* Right: Chat */}
                  <div className="flex-1 bg-white dark:bg-black">
                    <XyzenChat />
                  </div>
                </div>
              )}
              {activePanel === "explorer" && <Explorer />}
              {activePanel === "workshop" && <Workshop />}
            </div>
          </div>
        </div>

        <Transition appear show={isMcpOpen} as={Fragment}>
          <Dialog
            open={isMcpOpen}
            onClose={() => setIsMcpOpen(false)}
            className="relative z-50"
          >
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
            </TransitionChild>
            <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
              <TransitionChild
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <DialogPanel className="w-full max-w-4xl rounded-lg">
                  <Mcp />
                </DialogPanel>
              </TransitionChild>
            </div>
          </Dialog>
        </Transition>

        {showLlmProvider && (
          <Transition appear show={isLlmProvidersOpen} as={Fragment}>
            <Dialog
              open={isLlmProvidersOpen}
              onClose={() => setIsLlmProvidersOpen(false)}
              className="relative z-50"
            >
              <TransitionChild
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0"
                enterTo="opacity-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
              >
                <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
              </TransitionChild>
              <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
                <TransitionChild
                  as={Fragment}
                  enter="ease-out duration-300"
                  enterFrom="opacity-0 scale-95"
                  enterTo="opacity-100 scale-100"
                  leave="ease-in duration-200"
                  leaveFrom="opacity-100 scale-100"
                  leaveTo="opacity-0 scale-95"
                >
                  <DialogPanel className="w-full max-w-2xl rounded-lg bg-white p-6 dark:bg-neutral-900">
                    <LlmProviders />
                  </DialogPanel>
                </TransitionChild>
              </div>
            </Dialog>
          </Transition>
        )}
      </div>
      <AddMcpServerModal />
      {showLlmProvider && <AddLlmProviderModal />}
      <SettingsModal />
      <CenteredInput />
    </DndContext>
  );
}

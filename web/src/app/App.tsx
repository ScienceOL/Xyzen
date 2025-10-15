import { useXyzen } from "@/store";
import type { DragEndEvent, DragMoveEvent } from "@dnd-kit/core";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  restrictToHorizontalAxis,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  Dialog,
  DialogPanel,
  Tab,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { CogIcon, SparklesIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";

import { LlmProviders } from "@/app/LlmProviders";
import { Mcp } from "@/app/Mcp";
import McpIcon from "@/assets/McpIcon";
import { AuthStatus, ThemeToggle } from "@/components/features";
import XyzenAgent from "@/components/layouts/XyzenAgent";
import XyzenChat from "@/components/layouts/XyzenChat";
import { AddLlmProviderModal } from "@/components/modals/AddLlmProviderModal";
import { AddMcpServerModal } from "@/components/modals/AddMcpServerModal";
import { DEFAULT_BACKEND_URL } from "@/configs";
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

// Draggable floating button for when the panel is closed
const FloatingButton = ({ onOpenClick }: { onOpenClick: () => void }) => {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: "xyzen-floater",
  });

  const style = transform
    ? {
        transform: `translate3d(0, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onOpenClick}
      className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition-transform duration-200 ease-in-out hover:scale-110 hover:bg-indigo-700"
      title="Open Xyzen"
    >
      <SparklesIcon className="h-6 w-6" />
    </button>
  );
};

export interface XyzenProps {
  backendUrl?: string;
  showThemeToggle?: boolean;
  showLlmProvider?: boolean;
}

export function Xyzen({
  backendUrl = DEFAULT_BACKEND_URL,
  showThemeToggle = true,
  showLlmProvider = false,
}: XyzenProps) {
  const {
    isXyzenOpen,
    closeXyzen,
    panelWidth,
    setPanelWidth,
    toggleXyzen,
    activeTabIndex,
    setTabIndex,
    setBackendUrl,
    user,
    fetchAgents,
    fetchMcpServers,
  } = useXyzen();
  const [mounted, setMounted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isMcpOpen, setIsMcpOpen] = useState(false);
  const [isLlmProvidersOpen, setIsLlmProvidersOpen] = useState(false);
  const [floaterPosition, setFloaterPosition] = useState({
    y: typeof window !== "undefined" ? window.innerHeight / 2 : 300,
  });
  const lastWidthRef = useRef(panelWidth);

  // Tab选项
  const tabs = [
    { id: "agent", title: "助手", component: <XyzenAgent /> },
    { id: "chat", title: "聊天", component: <XyzenChat /> },
  ];

  useEffect(() => {
    setMounted(true);
    setBackendUrl(backendUrl);
  }, [backendUrl, setBackendUrl]);

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

  const floaterSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
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

  const handleFloaterDragEnd = (event: DragEndEvent) => {
    const { delta } = event;
    setFloaterPosition((pos) => ({ y: pos.y + delta.y }));
  };

  const handleResizeDoubleClick = () => {
    setPanelWidth(DEFAULT_WIDTH);
    lastWidthRef.current = DEFAULT_WIDTH;
  };

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "X") {
        e.preventDefault();
        toggleXyzen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleXyzen]);

  if (!mounted) return null;

  if (!isXyzenOpen) {
    return (
      <DndContext
        sensors={floaterSensors}
        onDragEnd={handleFloaterDragEnd}
        modifiers={[restrictToVerticalAxis]}
      >
        <div
          className="fixed right-4 z-50"
          style={{ top: floaterPosition.y, transform: "translateY(-50%)" }}
        >
          <FloatingButton onOpenClick={toggleXyzen} />
        </div>
      </DndContext>
    );
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

        <Tab.Group
          as="div"
          selectedIndex={activeTabIndex}
          onChange={setTabIndex}
          className="flex h-full flex-col"
        >
          <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-neutral-200 px-4 dark:border-neutral-800">
            <Tab.List className="flex items-center space-x-1">
              {tabs.map((tab) => (
                <Tab
                  key={tab.id}
                  className={({ selected }) =>
                    `whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors duration-200 ${
                      selected
                        ? "bg-neutral-100 text-indigo-600 dark:bg-neutral-900 dark:text-indigo-400"
                        : "text-neutral-500 hover:bg-neutral-100/50 dark:text-neutral-400 dark:hover:bg-neutral-800/50"
                    }`
                  }
                >
                  {tab.title}
                </Tab>
              ))}
            </Tab.List>
            <div className="flex items-center space-x-1">
              {showThemeToggle && <ThemeToggle />}
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

          <div className="flex-grow overflow-y-auto py-4">
            <Tab.Panels className="h-full">
              {tabs.map((tab) => (
                <Tab.Panel key={tab.id} className="h-full" unmount={false}>
                  {tab.component}
                </Tab.Panel>
              ))}
            </Tab.Panels>
          </div>
        </Tab.Group>

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
                <DialogPanel className="w-full max-w-2xl rounded-lg">
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
    </DndContext>
  );
}

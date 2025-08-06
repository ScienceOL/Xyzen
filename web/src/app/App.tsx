import { useXyzen } from "@/store/xyzenStore";
import type { DragMoveEvent } from "@dnd-kit/core";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import { Dialog, DialogPanel, Tab } from "@headlessui/react";
import {
  ChevronLeftIcon,
  Cog6ToothIcon,
  ComputerDesktopIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";

import { Mcp } from "@/app/Mcp";
import XyzenChat from "@/components/layouts/XyzenChat";
import XyzenHistory from "@/components/layouts/XyzenHistory";
import XyzenNodes from "@/components/layouts/XyzenNodes";
import { DEFAULT_BACKEND_URL } from "@/configs";
import useTheme from "@/hooks/useTheme";
import XyzenAgent from "@/components/layouts/XyzenAgent";

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
}

export function Xyzen({ backendUrl = DEFAULT_BACKEND_URL }: XyzenProps) {
  const {
    isXyzenOpen,
    closeXyzen,
    panelWidth,
    setPanelWidth,
    toggleXyzen,
    activeTabIndex,
    setTabIndex,
    createDefaultChannel,
    setBackendUrl,
  } = useXyzen();
  const { theme, cycleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isMcpOpen, setIsMcpOpen] = useState(false);
  const lastWidthRef = useRef(panelWidth);

  // Tab选项
  const tabs = [
    { id: "chat", title: "聊天", component: <XyzenChat /> },
    {id: "agent", title: "助手", component: <XyzenAgent /> },
    { id: "history", title: "历史", component: <XyzenHistory /> },
    { id: "nodes", title: "节点", component: <XyzenNodes /> },
  ];

  // 添加useEffect处理客户端挂载
  useEffect(() => {
    setMounted(true);
    setBackendUrl(backendUrl);
  }, [backendUrl, setBackendUrl]);

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
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "X") {
        e.preventDefault();
        toggleXyzen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleXyzen]);

  if (!mounted || !isXyzenOpen) return null;

  // const handleCreateCustomAgent = () => {
  //   const newAgent = {
  //     id: `agent-${Date.now()}`,
  //     name: "自定义助手",
  //     description: "这是一个自定义创建的助手",
  //     model: "GPT-4",
  //     temperature: 0.7,
  //     tags: [],
  //     avatar: "https://cdn1.deepmd.net/static/img/affb038eChatGPT Image 2025年8月6日 10_33_07.png",
  //   };

  //   createDefaultChannel(newAgent);         // 创建频道
  //   setTabIndex(1);
  // };

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

        <div className="flex h-16 items-center justify-between border-b border-neutral-200 px-4 dark:border-neutral-800">
          <h2 className="bg-gradient-to-r from-violet-500 to-fuchsia-500 bg-clip-text text-lg font-semibold text-transparent">
            Xyzen
          </h2>
          <button
            onClick={closeXyzen}
            className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
        </div>

        <Tab.Group
          selectedIndex={activeTabIndex}
          onChange={setTabIndex}
          style={{ height: "100vh" }}
        >
          <div className="border-b border-neutral-200 px-4 dark:border-neutral-800">
            <div className="flex items-center justify-between">
              <Tab.List className="flex space-x-1">
                {tabs.map((tab) => (
                  <Tab
                    key={tab.id}
                    className={({ selected }) =>
                      `whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium outline-none transition-colors duration-200 ${
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
                <button
                  className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  title="切换主题"
                  onClick={cycleTheme}
                >
                  {theme === "light" && <SunIcon className="h-5 w-5" />}
                  {theme === "dark" && <MoonIcon className="h-5 w-5" />}
                  {theme === "system" && (
                    <ComputerDesktopIcon className="h-5 w-5" />
                  )}
                </button>
                <button
                  className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  title="MCP 管理"
                  onClick={() => setIsMcpOpen(true)}
                >
                  <Cog6ToothIcon className="h-5 w-5" />
                </button>
                <button
                  className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  title="新对话"
                  onClick={createDefaultChannel}
                >
                  <PlusIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          <div className="h-[calc(100%-104px)] overflow-y-auto py-4">
            <Tab.Panels>
              {tabs.map((tab) => (
                <Tab.Panel key={tab.id}>{tab.component}</Tab.Panel>
              ))}
            </Tab.Panels>
          </div>
        </Tab.Group>

        <Dialog
          open={isMcpOpen}
          onClose={() => setIsMcpOpen(false)}
          className="relative z-50"
        >
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
          <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
            <DialogPanel className="w-full max-w-2xl rounded-lg bg-white p-6 dark:bg-neutral-900">
              <Mcp />
            </DialogPanel>
          </div>
        </Dialog>
      </div>
    </DndContext>
  );
}

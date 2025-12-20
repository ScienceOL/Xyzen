import { McpListModal } from "@/components/layouts/McpListModal";
import { useXyzen } from "@/store";
import type { DragEndEvent } from "@dnd-kit/core";
import { DndContext } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import McpIcon from "@/assets/McpIcon";
import { AuthStatus, SettingsButton } from "@/components/features";
import { ActivityBar } from "@/components/layouts/ActivityBar";
import KnowledgeBase from "@/components/layouts/KnowledgeBase";
import XyzenAgent from "@/components/layouts/XyzenAgent";
import XyzenChat from "@/components/layouts/XyzenChat";
import AgentMarketplace from "@/app/marketplace/AgentMarketplace";

import { SettingsModal } from "@/components/modals/SettingsModal";

import { DEFAULT_BACKEND_URL } from "@/configs";

export interface AppFullscreenProps {
  backendUrl?: string;
  showLlmProvider?: boolean;
}

export function AppFullscreen({
  backendUrl = DEFAULT_BACKEND_URL,
}: AppFullscreenProps) {
  const {
    setBackendUrl,
    // centralized UI actions
    openMcpListModal,
    activePanel,
    setActivePanel,
  } = useXyzen();

  const [mounted, setMounted] = useState(false);

  // Initialize: set backend URL; auth is initialized at App root
  useEffect(() => {
    setMounted(true);
    setBackendUrl(backendUrl);
  }, [backendUrl, setBackendUrl]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (_e: KeyboardEvent) => {
      // Add any keyboard shortcuts here if needed
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleFloaterDragEnd = (_event: DragEndEvent) => {
    // No-op for fullscreen
  };

  if (!mounted) {
    return null;
  }

  const fullscreenContent = (
    <>
      <DndContext
        onDragEnd={handleFloaterDragEnd}
        modifiers={[restrictToVerticalAxis]}
      >
        <div className="fixed inset-0 z-40 flex flex-col bg-white dark:bg-black">
          {/* Header Bar */}
          <header className="flex h-14 flex-shrink-0 items-center justify-between px-4 bg-white/80 dark:bg-black/60 backdrop-blur-md supports-[backdrop-filter]:backdrop-blur-md shadow-sm ring-1 ring-neutral-200/60 dark:ring-neutral-800/60">
            <div className="flex items-center gap-3">
              <h1 className="text-base sm:text-lg font-semibold tracking-tight bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
                Xyzen
              </h1>
              {/* Breadcrumbs or current context could go here */}
            </div>

            <div className="flex items-center space-x-1">
              <SettingsButton />
              <button
                className="rounded-sm p-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                title="MCP Management"
                onClick={openMcpListModal}
              >
                <McpIcon className="h-5 w-5" />
              </button>
              <div className="mx-2 h-6 w-px bg-neutral-200 dark:bg-neutral-700"></div>
              <AuthStatus className="ml-2" />
            </div>
          </header>

          {/* Main Content Layout */}
          <main className="flex flex-1 overflow-hidden">
            {/* Activity Bar */}
            <ActivityBar
              activePanel={activePanel}
              onPanelChange={setActivePanel}
              isMobile={false}
            />

            {/* Panel Content */}
            <div className="flex flex-1 overflow-hidden bg-white dark:bg-neutral-950">
              {activePanel === "chat" && (
                <div className="flex h-full w-full">
                  {/* Left Sidebar: Assistants - Only show if no active chat or we want a split view?
                      In fullscreen, we typically want the list AND the chat.
                      However, to match AppSide logic where we drill down:
                  */}

                  {/* For fullscreen, we can keep the sidebar + chat layout for the "chat" panel */}
                  <aside className="w-80 flex-shrink-0 border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
                    <div className="flex h-full flex-col">
                      <div className="px-4 py-3 dark:border-neutral-800">
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
                  </aside>

                  {/* Right Column: Chat Interface */}
                  <section className="flex flex-1 flex-col overflow-hidden bg-white dark:bg-black">
                    <XyzenChat />
                  </section>
                </div>
              )}

              {activePanel === "knowledge" && (
                <div className="h-full w-full">
                  <KnowledgeBase />
                </div>
              )}

              {activePanel === "marketplace" && (
                <div className="h-full w-full">
                  <AgentMarketplace />
                </div>
              )}
            </div>
          </main>
        </div>
      </DndContext>

      <McpListModal />
      <SettingsModal />
    </>
  );
  return createPortal(fullscreenContent, document.body);
}

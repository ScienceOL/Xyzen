import { McpListModal } from "@/components/layouts/McpListModal";
import { useXyzen } from "@/store";
import type { DragEndEvent } from "@dnd-kit/core";
import { DndContext } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import Explorer from "@/app/explore/page";
import McpIcon from "@/assets/McpIcon";
import { AuthStatus, SettingsButton } from "@/components/features";
import ActivityBar from "@/components/layouts/ActivityBar";
import Workshop from "@/components/layouts/Workshop";
import WorkshopChat from "@/components/layouts/WorkshopChat";
import XyzenAgent from "@/components/layouts/XyzenAgent";
import XyzenChat from "@/components/layouts/XyzenChat";

import { SettingsModal } from "@/components/modals/SettingsModal";

import { LayoutTextFlip } from "@/components/ui/layout-text-flip";
import { Spotlight } from "@/components/ui/spotlight-new";
import { DEFAULT_BACKEND_URL } from "@/configs";

export interface AppFullscreenProps {
  backendUrl?: string;
  showLlmProvider?: boolean;
}

export function AppFullscreen({
  backendUrl = DEFAULT_BACKEND_URL,
}: AppFullscreenProps) {
  const {
    user,
    fetchAgents,
    fetchMcpServers,
    setBackendUrl,
    activePanel,
    setActivePanel,
    // centralized UI actions
    openMcpListModal,
  } = useXyzen();

  const [mounted, setMounted] = useState(false);

  // Initialize: set backend URL; auth is initialized at App root
  useEffect(() => {
    setMounted(true);
    setBackendUrl(backendUrl);
  }, [backendUrl, setBackendUrl]);

  // Load initial data when user is available
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

  // Panel content is now handled directly in the JSX

  if (!mounted) {
    return null;
  }

  const fullscreenContent = (
    <>
      <DndContext
        onDragEnd={handleFloaterDragEnd}
        modifiers={[restrictToVerticalAxis]}
      >
        <div className="fixed inset-0 z-[9999] flex flex-col bg-white dark:bg-black">
          {/* Header Bar */}
          <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4 dark:border-neutral-800 dark:bg-black">
            <div className="flex items-center gap-4">
              <h1 className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
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

          {/* Main Content: VSCode-like Layout */}
          <main className="flex flex-1 overflow-hidden">
            {/* Activity Bar - Leftmost Column */}
            <div className="w-16 flex-shrink-0 border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
              <ActivityBar
                activePanel={activePanel}
                onPanelChange={setActivePanel}
              />
            </div>

            {/* Explorer takes full width in fullscreen */}
            {activePanel === "explorer" && (
              <section className="flex flex-1 flex-col overflow-y-auto bg-white dark:bg-black">
                <div className="h-[10rem] w-full rounded-md flex md:items-center md:justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-black dark:via-black dark:to-black antialiased bg-grid-neutral-200/[0.05] dark:bg-grid-white/[0.02] relative overflow-hidden border-b border-neutral-100 dark:border-neutral-800">
                  <Spotlight
                    gradientFirst="radial-gradient(68.54% 68.72% at 55.02% 31.46%, hsla(220, 100%, 50%, .12) 0, hsla(220, 100%, 45%, .04) 50%, hsla(220, 100%, 40%, 0) 80%)"
                    gradientSecond="radial-gradient(50% 50% at 50% 50%, hsla(220, 100%, 55%, .08) 0, hsla(220, 100%, 50%, .03) 80%, transparent 100%)"
                    gradientThird="radial-gradient(50% 50% at 50% 50%, hsla(220, 100%, 60%, .06) 0, hsla(220, 100%, 50%, .02) 80%, transparent 100%)"
                  />
                  <div className=" p-4 max-w-7xl  mx-auto relative z-10  w-full pt-20 md:pt-0">
                    <motion.div className="relative mx-4 my-4 flex flex-col items-center justify-center gap-4 text-center sm:mx-0 sm:mb-0 sm:flex-row">
                      <LayoutTextFlip
                        text="Welcome to "
                        words={[
                          "Xyzen Explore",
                          "Agents Hub",
                          "Mcp Market",
                          "AI Inspiration",
                        ]}
                      />
                    </motion.div>
                    <p className="mt-4 text-center text-base text-neutral-700 dark:text-neutral-400">
                      Discover intelligent agents, explore MCP integrations, and
                      unlock the full potential of AI collaboration.
                    </p>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <Explorer />
                </div>
              </section>
            )}

            {/* Chat and Workshop use sidebar-style layout */}
            {(activePanel === "chat" || activePanel === "workshop") && (
              <>
                {/* Middle Column: Content Panel */}
                <aside className="w-80 flex-shrink-0 border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
                  <div className="flex h-full flex-col">
                    <div className="border-b border-neutral-200 p-4 dark:border-neutral-800">
                      <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
                        {activePanel === "chat" ? "Assistants" : "Workshop"}
                      </h2>
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                        {activePanel === "chat"
                          ? "Choose an agent to start"
                          : "Create and design new agents"}
                      </p>
                    </div>

                    {/* Content based on active panel */}
                    <div className="flex-1 overflow-y-auto py-4">
                      {activePanel === "chat" && (
                        <XyzenAgent systemAgentType="chat" />
                      )}
                      {activePanel === "workshop" && <Workshop />}
                    </div>
                  </div>
                </aside>

                {/* Right Column: Chat Interface */}
                <section className="flex flex-1 flex-col overflow-hidden bg-white dark:bg-black">
                  {activePanel === "chat" && <XyzenChat />}
                  {activePanel === "workshop" && <WorkshopChat />}
                </section>
              </>
            )}
          </main>
        </div>
      </DndContext>

      <McpListModal />
      <SettingsModal />
    </>
  );
  return createPortal(fullscreenContent, document.body);
}

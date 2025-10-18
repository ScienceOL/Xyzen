import { useXyzen } from "@/store";
import type { DragEndEvent } from "@dnd-kit/core";
import { DndContext } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { Fragment, useCallback, useEffect, useState } from "react";
import { CogIcon } from "@heroicons/react/24/outline";
import { Dialog, Transition, TransitionChild } from "@headlessui/react";

import { Mcp } from "@/app/Mcp";
import { LlmProviders } from "@/app/LlmProviders";
import McpIcon from "@/assets/McpIcon";
import { AuthStatus, SettingsButton } from "@/components/features";
import XyzenAgent from "@/components/layouts/XyzenAgent";
import XyzenChat from "@/components/layouts/XyzenChat";
import XyzenTopics from "@/components/layouts/XyzenTopics";
import { AddLlmProviderModal } from "@/components/modals/AddLlmProviderModal";
import { SettingsModal } from "@/components/modals/SettingsModal";
import { AddMcpServerModal } from "@/components/modals/AddMcpServerModal";
import { DEFAULT_BACKEND_URL } from "@/configs";

export interface AppFullscreenProps {
  backendUrl?: string;
  showLlmProvider?: boolean;
}

export function AppFullscreen({
  backendUrl = DEFAULT_BACKEND_URL,
  showLlmProvider = false,
}: AppFullscreenProps) {
  const {
    user,
    fetchAgents,
    fetchMcpServers,
    fetchUserByToken,
    setBackendUrl,
  } = useXyzen();

  const [mounted, setMounted] = useState(false);
  const [isMcpOpen, setIsMcpOpen] = useState(false);
  const [isLlmProvidersOpen, setIsLlmProvidersOpen] = useState(false);

  // Initialize: set backend URL and fetch user
  useEffect(() => {
    setMounted(true);
    setBackendUrl(backendUrl);
    fetchUserByToken();
  }, [backendUrl, setBackendUrl, fetchUserByToken]);

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

  if (!mounted) {
    return null;
  }

  return (
    <DndContext
      onDragEnd={handleFloaterDragEnd}
      modifiers={[restrictToVerticalAxis]}
    >
      <div className="fixed inset-0 flex flex-col bg-white dark:bg-black">
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
              className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              title="MCP Management"
              onClick={() => setIsMcpOpen(true)}
            >
              <McpIcon className="h-5 w-5" />
            </button>
            {showLlmProvider && (
              <button
                className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                title="LLM Providers"
                onClick={() => setIsLlmProvidersOpen(true)}
              >
                <CogIcon className="h-5 w-5" />
              </button>
            )}
            <div className="mx-2 h-6 w-px bg-neutral-200 dark:bg-neutral-700"></div>
            <AuthStatus className="ml-2" />
          </div>
        </header>

        {/* Main Content: 3-Column Layout */}
        <main className="flex flex-1 overflow-hidden">
          {/* Left Column: Agents */}
          <aside className="w-80 flex-shrink-0 border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
            <div className="flex h-full flex-col">
              <div className="border-b border-neutral-200 p-4 dark:border-neutral-800">
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
                  Assistants
                </h2>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  Choose an agent to start
                </p>
              </div>
              <div className="flex-1 overflow-y-auto py-4">
                <XyzenAgent />
              </div>
            </div>
          </aside>

          {/* Center Column: Chat */}
          <section className="flex flex-1 flex-col overflow-hidden bg-white dark:bg-black">
            <XyzenChat />
          </section>

          {/* Right Column: Topics */}
          <aside className="w-80 flex-shrink-0 border-l border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
            <XyzenTopics />
          </aside>
        </main>

        {/* MCP Dialog */}
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
                <Dialog.Panel className="w-full max-w-2xl rounded-lg bg-white p-6 dark:bg-neutral-900">
                  <Mcp />
                </Dialog.Panel>
              </TransitionChild>
            </div>
          </Dialog>
        </Transition>

        {/* LLM Providers Dialog */}
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
                  <Dialog.Panel className="w-full max-w-2xl rounded-lg bg-white p-6 dark:bg-neutral-900">
                    <LlmProviders />
                  </Dialog.Panel>
                </TransitionChild>
              </div>
            </Dialog>
          </Transition>
        )}
      </div>
      <AddMcpServerModal />
      {showLlmProvider && <AddLlmProviderModal />}
      <SettingsModal />
    </DndContext>
  );
}

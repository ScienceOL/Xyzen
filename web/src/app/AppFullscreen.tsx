import { useXyzen } from "@/store";
import type { DragEndEvent } from "@dnd-kit/core";
import { DndContext } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { SpatialWorkspace } from "@/app/chat/SpatialWorkspace";
import AgentMarketplace from "@/app/marketplace/AgentMarketplace";
import { BottomDock } from "@/components/layouts/BottomDock";
import KnowledgeBase from "@/components/layouts/KnowledgeBase";

import { PwaInstallPrompt } from "@/components/features/PwaInstallPrompt";
import { SettingsModal } from "@/components/modals/SettingsModal";

import { DEFAULT_BACKEND_URL } from "@/configs";

export interface AppFullscreenProps {
  backendUrl?: string;
}

export function AppFullscreen({
  backendUrl = DEFAULT_BACKEND_URL,
}: AppFullscreenProps) {
  const {
    setBackendUrl,
    // centralized UI actions
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
          {/* Main Content - Full screen canvas */}
          <main className="flex-1 overflow-hidden">
            {activePanel === "chat" && (
              <div className="h-full w-full">
                <SpatialWorkspace />
              </div>
            )}

            {activePanel === "knowledge" && (
              <div className="h-full w-full bg-white dark:bg-neutral-950">
                <KnowledgeBase />
              </div>
            )}

            {activePanel === "marketplace" && (
              <div className="h-full w-full bg-white dark:bg-neutral-950">
                <AgentMarketplace />
              </div>
            )}
          </main>

          {/* Bottom Dock - Floating on top of canvas */}
          <BottomDock
            activePanel={activePanel}
            onPanelChange={setActivePanel}
          />
        </div>
      </DndContext>

      <SettingsModal />
      <PwaInstallPrompt />
    </>
  );
  return createPortal(fullscreenContent, document.body);
}

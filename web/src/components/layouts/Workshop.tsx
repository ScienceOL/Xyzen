"use client";
import { useXyzen } from "@/store";
import WorkshopChat from "./WorkshopChat";

export default function Workshop() {
  const { layoutStyle } = useXyzen();

  if (layoutStyle === "fullscreen") {
    // Fullscreen: Empty workshop area (chat is handled by AppFullscreen.tsx)
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🛠️</div>
          <h3 className="text-lg font-semibold text-neutral-800 dark:text-white mb-2">
            Workshop
          </h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Workshop area
          </p>
        </div>
      </div>
    );
  }

  // Sidebar: Workshop view with integrated chat
  return (
    <div className="h-full flex">
      {/* Left: Workshop Tools */}
      <div className="w-80 flex-shrink-0 border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950 flex flex-col">
        <div className="border-b border-neutral-200 p-4 dark:border-neutral-800 flex-shrink-0">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
            Workshop
          </h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Create and design new agents
          </p>
        </div>

        {/* Workshop Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-3">🛠️</div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Workshop tools coming soon
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Workshop Chat */}
      <div className="flex-1 bg-white dark:bg-black">
        <WorkshopChat />
      </div>
    </div>
  );
}

import AgentMarketplace from "@/app/marketplace/AgentMarketplace";
import MobileAccountPage from "@/components/features/MobileAccountPage";
import { ActivityBar } from "@/components/layouts/ActivityBar";
import KnowledgeBase from "@/components/layouts/KnowledgeBase";
import MemoryPanel from "@/components/layouts/MemoryPanel";
import SandboxPanel from "@/components/layouts/SandboxPanel";
import ScheduledTasksPanel from "@/components/layouts/ScheduledTasksPanel";
import SkillsLibrary from "@/components/layouts/SkillsLibrary";
import { PushPermissionPrompt } from "@/components/features/PushPermissionPrompt";
import { SettingsModal } from "@/components/modals/SettingsModal";
import { useXyzen } from "@/store";
import { useShallow } from "zustand/react/shallow";
import AuthErrorScreen from "./auth/AuthErrorScreen";
import MobileChatView from "./MobileChatView";

export interface MobileAppProps {
  backendUrl?: string;
  showAuthError?: boolean;
  onRetryAuth?: () => void;
}

export function MobileApp({
  showAuthError = false,
  onRetryAuth,
}: MobileAppProps) {
  const { activePanel, setActivePanel } = useXyzen(
    useShallow((s) => ({
      activePanel: s.activePanel,
      setActivePanel: s.setActivePanel,
    })),
  );

  return (
    <>
      <div
        className="flex flex-col bg-white dark:bg-black select-none"
        style={{ height: "100dvh" }}
      >
        <div className="flex flex-1 overflow-hidden relative">
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-neutral-950">
            {activePanel === "chat" && <MobileChatView />}

            {activePanel === "knowledge" && <KnowledgeBase />}

            {activePanel === "skills" && (
              <div className="h-full bg-white dark:bg-neutral-950">
                <SkillsLibrary />
              </div>
            )}

            {activePanel === "memory" && (
              <div className="h-full bg-white dark:bg-neutral-950">
                <MemoryPanel />
              </div>
            )}

            {activePanel === "marketplace" && (
              <div className="h-full bg-white dark:bg-neutral-950">
                <AgentMarketplace />
              </div>
            )}

            {activePanel === "sandbox" && (
              <div className="h-full bg-white dark:bg-neutral-950">
                <SandboxPanel />
              </div>
            )}

            {activePanel === "tasks" && (
              <div className="h-full bg-white dark:bg-neutral-950">
                <ScheduledTasksPanel />
              </div>
            )}

            {activePanel === "account" && <MobileAccountPage />}

            {showAuthError && (
              <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
                <div className="w-full max-w-md px-4">
                  <AuthErrorScreen
                    onRetry={onRetryAuth ?? (() => {})}
                    variant="inline"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <ActivityBar
          activePanel={activePanel}
          onPanelChange={setActivePanel}
          isMobile={true}
        />
      </div>

      <SettingsModal />
      <PushPermissionPrompt />
    </>
  );
}

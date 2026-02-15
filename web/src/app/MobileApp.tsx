import { useRef, useState } from "react";

import AgentMarketplace from "@/app/marketplace/AgentMarketplace";
import { ActivityBar } from "@/components/layouts/ActivityBar";
import { AppHeader } from "@/components/layouts/AppHeader";
import KnowledgeBase from "@/components/layouts/KnowledgeBase";
import MemoryPanel from "@/components/layouts/MemoryPanel";
import SkillsLibrary from "@/components/layouts/SkillsLibrary";
import { SettingsModal } from "@/components/modals/SettingsModal";
import { useXyzen } from "@/store";
import { useTranslation } from "react-i18next";
import AuthErrorScreen from "./auth/AuthErrorScreen";
import MobileChatView, { type MobileChatViewHandle } from "./MobileChatView";

export interface MobileAppProps {
  backendUrl?: string;
  showAuthError?: boolean;
  onRetryAuth?: () => void;
}

export function MobileApp({
  showAuthError = false,
  onRetryAuth,
}: MobileAppProps) {
  const { t } = useTranslation();
  const { activePanel, setActivePanel } = useXyzen();
  const { activeChatChannel } = useXyzen();

  const mobileChatRef = useRef<MobileChatViewHandle>(null);
  const [mobilePage, setMobilePage] = useState(0);

  const noop = () => {};

  return (
    <>
      <div
        className="flex flex-col bg-white dark:bg-black"
        style={{ height: "100dvh" }}
      >
        <AppHeader
          variant="side"
          isMobile
          onDragStart={noop}
          onDragMove={noop}
          onDragEnd={noop}
          showBackButton={activePanel === "chat" && mobilePage > 0}
          onBackClick={() => {
            const page = mobileChatRef.current?.currentPage ?? 0;
            if (page === 2) mobileChatRef.current?.goToPage(1);
            else if (page === 1) mobileChatRef.current?.goToPage(0);
          }}
          backButtonLabel={
            activeChatChannel
              ? t("app.chat.chatLabel")
              : t("app.chat.assistantsTitle")
          }
        />

        <div className="flex flex-1 overflow-hidden relative">
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-neutral-950">
            {activePanel === "chat" && (
              <MobileChatView
                ref={mobileChatRef}
                onPageChange={setMobilePage}
              />
            )}

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
    </>
  );
}

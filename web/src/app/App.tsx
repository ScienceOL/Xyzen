import { autoLogin, handleRelinkCallback } from "@/core/auth";
import { useAuth } from "@/hooks/useAuth";
import { useXyzen } from "@/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import AuthErrorScreen from "@/app/auth/AuthErrorScreen";
import SharedAgentDetailPage from "@/app/marketplace/SharedAgentDetailPage";
import SharedChatPage from "@/app/share/SharedChatPage";
import { CenteredInput } from "@/components/features";
import { DEFAULT_BACKEND_URL } from "@/configs";
import { MOBILE_BREAKPOINT } from "@/configs/common";
import { resolveEdition } from "@/core/edition/edition";
import { resolveRegion } from "@/core/region/region";
import useTheme from "@/hooks/useTheme";
import { useWalletSync } from "@/hooks/useWalletSync";
import { authService } from "@/service/authService";
import { LAYOUT_STYLE, type InputPosition } from "@/store/slices/uiSlice/types";
import { buildAuthorizeUrl } from "@/utils/authFlow";
import { AppFullscreen } from "./AppFullscreen";
import { AppSide } from "./AppSide";
import { AuthLoadingScreen } from "./AuthLoadingScreen";
import { MobileApp } from "./MobileApp";
import { LandingPageV2 } from "./landing/v2/LandingPageV2";

const SecretCodePage = React.lazy(() =>
  import("@/components/admin/SecretCodePage").then((m) => ({
    default: m.SecretCodePage,
  })),
);

const TermsPage = React.lazy(() =>
  import("@/app/legal/TermsPage").then((m) => ({ default: m.TermsPage })),
);

const PrivacyPage = React.lazy(() =>
  import("@/app/legal/PrivacyPage").then((m) => ({ default: m.PrivacyPage })),
);

// Handle relink callback in popup - check at module level
handleRelinkCallback();

function parseAgentShareHash(hash: string): string | null {
  const match = hash.match(/^#\/agent\/([a-zA-Z0-9_-]+)$/);
  return match ? match[1] : null;
}

function parseChatShareHash(hash: string): string | null {
  const match = hash.match(/^#\/share\/([a-zA-Z0-9_-]+)$/);
  return match ? match[1] : null;
}

function parseChatTopicHash(hash: string): string | null {
  const match = hash.match(/^#\/chat\/([a-zA-Z0-9_-]+)$/);
  return match ? match[1] : null;
}

// 创建 React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export interface XyzenProps {
  backendUrl?: string;
  showLlmProvider?: boolean;
  centeredInputPosition?: InputPosition;
  /** Whether to show the landing page when not authenticated. Default: true */
  showLandingPage?: boolean;
}

export function Xyzen({
  backendUrl = DEFAULT_BACKEND_URL,
  centeredInputPosition,
  showLandingPage = true,
}: XyzenProps) {
  const {
    isXyzenOpen,
    layoutStyle,
    setBackendUrl,
    toggleXyzen,
    fetchAgents,
    fetchRootAgentId,
    fetchMcpServers,
    fetchChatHistory,
    activateChannel,
    setInputPosition,
    setActivePanel,
  } = useXyzen(
    useShallow((s) => ({
      isXyzenOpen: s.isXyzenOpen,
      layoutStyle: s.layoutStyle,
      setBackendUrl: s.setBackendUrl,
      toggleXyzen: s.toggleXyzen,
      fetchAgents: s.fetchAgents,
      fetchRootAgentId: s.fetchRootAgentId,
      fetchMcpServers: s.fetchMcpServers,
      fetchChatHistory: s.fetchChatHistory,
      activateChannel: s.activateChannel,
      setInputPosition: s.setInputPosition,
      setActivePanel: s.setActivePanel,
    })),
  );
  const { status } = useAuth();

  // Initialize theme at the top level so it works for both layouts
  useTheme();
  useWalletSync();
  const [mounted, setMounted] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1920,
  );
  const [progress, setProgress] = useState(0);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [currentHash, setCurrentHash] = useState(
    typeof window !== "undefined" ? window.location.hash : "",
  );
  const [showAuthScreen, setShowAuthScreen] = useState(false);

  useEffect(() => {
    setMounted(true);
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);

    // Update current hash on navigation
    const updateHash = () => setCurrentHash(window.location.hash);
    window.addEventListener("popstate", updateHash);
    window.addEventListener("hashchange", updateHash);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("popstate", updateHash);
      window.removeEventListener("hashchange", updateHash);
    };
  }, []);

  // Global keyboard shortcut: Cmd/Ctrl + Shift + X toggles sidebar open/close
  useEffect(() => {
    const isEditableTarget = (el: Element | null) => {
      if (!el) return false;
      const tag = (el as HTMLElement).tagName;
      const editable = (el as HTMLElement).isContentEditable;
      return (
        editable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (el as HTMLElement).closest?.('[role="textbox"]') !== null
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        (e.key === "X" || e.key === "x")
      ) {
        // Avoid toggling when typing in inputs/editable areas
        if (isEditableTarget(document.activeElement)) return;
        e.preventDefault();
        toggleXyzen();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleXyzen]);

  // Ensure backend URL is configured in the store before attempting auto-login.
  useEffect(() => {
    setBackendUrl(backendUrl);
    void autoLogin();
  }, [backendUrl, setBackendUrl]);

  // Sync prop to store if provided
  useEffect(() => {
    if (centeredInputPosition) {
      setInputPosition(centeredInputPosition);
    }
  }, [centeredInputPosition, setInputPosition]);

  // After OAuth redirect, the hash is lost (redirect_uri has no hash).
  // Restore the hash route from sessionStorage so the shared page re-renders
  // and its auto-continue / auto-fork logic can fire.
  useEffect(() => {
    if (status !== "succeeded") return;
    if (
      currentHash.startsWith("#/share/") ||
      currentHash.startsWith("#/agent/")
    )
      return;

    const pendingShare = sessionStorage.getItem("pending_share_continue");
    if (pendingShare) {
      window.location.hash = `#/share/${pendingShare}`;
      return;
    }
    const pendingAgent = sessionStorage.getItem("pending_agent_share");
    if (pendingAgent) {
      window.location.hash = `#/agent/${pendingAgent}`;
      return;
    }
  }, [status, currentHash]);

  // Load initial data when auth succeeds
  useEffect(() => {
    if (status === "succeeded" && !initialLoadComplete) {
      // Reset auth screen state when authentication succeeds
      setShowAuthScreen(false);

      const loadData = async () => {
        try {
          // 0. Fetch root agent ID first (fetchAgents needs it for default layout)
          await fetchRootAgentId();

          // 1. Fetch all necessary data in parallel
          await Promise.all([
            fetchAgents(),
            fetchMcpServers(),
            fetchChatHistory(),
            resolveEdition(),
            resolveRegion(),
          ]);

          // 2. Check for pending channel activation (from shared chat "continue conversation")
          const pendingChannel = sessionStorage.getItem(
            "pending_activate_channel",
          );
          // Also check for #/chat/{topicId} deep-link (from push notifications)
          const hashTopicId = parseChatTopicHash(window.location.hash);

          console.log("[App] pending_activate_channel:", pendingChannel);
          if (hashTopicId) {
            // Clear the hash so the app doesn't re-activate on next render
            window.location.hash = "";
            console.log(
              "[App] Activating from hash deep-link, topicId:",
              hashTopicId,
            );
            setActivePanel("chat");
            try {
              await activateChannel(hashTopicId);
              console.log("[App] Channel activated from hash successfully");
            } catch (err) {
              console.error("[App] Failed to activate channel from hash:", err);
            }
          } else if (pendingChannel) {
            sessionStorage.removeItem("pending_activate_channel");
            // Format is "session_id:topic_id"
            const parts = pendingChannel.split(":");
            const topicId = parts.length >= 2 ? parts[1] : parts[0];
            console.log("[App] Activating pending channel, topicId:", topicId);
            if (topicId) {
              setActivePanel("chat");
              try {
                await activateChannel(topicId);
                console.log("[App] Channel activated successfully");
              } catch (err) {
                console.error("[App] Failed to activate channel:", err);
              }
            }
          } else {
            // 3. If there is an active chat channel (persisted), try to connect to it
            // We access the store directly to get the latest state after fetchChatHistory
            const state = useXyzen.getState();
            const currentActiveChannel = state.activeChatChannel;

            if (currentActiveChannel) {
              console.log(
                `[App] Pre-connecting to active channel: ${currentActiveChannel}`,
              );
              // activateChannel handles fetching messages and connecting via WebSocket
              await activateChannel(currentActiveChannel);
            }
          }
        } catch (error) {
          console.error("Failed to load initial data:", error);
        } finally {
          setInitialLoadComplete(true);
        }
      };
      void loadData();
    }
  }, [
    status,
    initialLoadComplete,
    backendUrl,
    fetchAgents,
    fetchRootAgentId,
    fetchMcpServers,
    fetchChatHistory,
    activateChannel,
    setActivePanel,
  ]);

  // Handle #/chat/{topicId} deep-link while app is already running
  // (e.g. from SW notification_click postMessage or in-app hash navigation)
  useEffect(() => {
    if (!initialLoadComplete) return;
    const topicId = parseChatTopicHash(currentHash);
    if (!topicId) return;
    window.location.hash = "";
    setActivePanel("chat");
    activateChannel(topicId);
  }, [currentHash, initialLoadComplete, activateChannel, setActivePanel]);

  // Listen for Service Worker notification click messages
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "notification_click" && event.data.url) {
        const url: string = event.data.url;
        // Extract topic ID from /chat?topic=xxx or /#/chat/xxx patterns
        const hashMatch = /\/#\/chat\/([a-zA-Z0-9_-]+)/.exec(url);
        const queryMatch = /[?&]topic=([^&]+)/.exec(url);
        const topicId = hashMatch?.[1] ?? queryMatch?.[1];
        if (topicId) {
          setActivePanel("chat");
          activateChannel(topicId);
        }
      }
    };
    navigator.serviceWorker?.addEventListener("message", handler);
    return () =>
      navigator.serviceWorker?.removeEventListener("message", handler);
  }, [activateChannel, setActivePanel]);

  // Sync active topic to Service Worker so it can suppress push notifications
  // for the topic the user is already viewing (WeChat-style behaviour).
  useEffect(() => {
    const sync = (topicId: string | null) => {
      navigator.serviceWorker?.ready.then((reg) => {
        reg.active?.postMessage({ type: "SET_ACTIVE_TOPIC", topicId });
      });
    };
    // Send current value immediately
    sync(useXyzen.getState().activeChatChannel);
    // Subscribe to future changes
    let prev = useXyzen.getState().activeChatChannel;
    return useXyzen.subscribe((state) => {
      if (state.activeChatChannel !== prev) {
        prev = state.activeChatChannel;
        sync(prev);
      }
    });
  }, []);

  // Unified progress bar logic
  useEffect(() => {
    // Target progress based on current state
    let targetProgress = 0;

    if (status === "idle") {
      targetProgress = 10;
    } else if (status === "loading") {
      targetProgress = 30;
    } else if (status === "succeeded") {
      if (!initialLoadComplete) {
        targetProgress = 80; // Data loading phase
      } else {
        targetProgress = 100; // All done
      }
    } else if (status === "failed") {
      targetProgress = 100;
    }

    // If we are already at target, do nothing (unless it's 100, then we ensure it stays there)
    if (progress >= targetProgress && targetProgress !== 100) {
      return;
    }

    // If we reached 100, just set it and clear interval
    if (targetProgress === 100) {
      setProgress(100);
      return;
    }

    // Smoothly animate towards target
    const intervalId = window.setInterval(() => {
      setProgress((prev) => {
        if (prev >= targetProgress) return prev;
        // Decelerate as we get closer
        const remaining = targetProgress - prev;
        const increment = Math.max(0.5, remaining * 0.1);
        return Math.min(prev + increment, targetProgress);
      });
    }, 100);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [status, initialLoadComplete, progress]);

  const handleRetry = useCallback(() => {
    void autoLogin();
  }, []);

  const handleShowAuthScreen = useCallback(async () => {
    // For OAuth providers (non-bohr_app), redirect directly to the login page
    try {
      const [status, config] = await Promise.all([
        authService.getAuthStatus(),
        authService.getAuthConfig(),
      ]);
      const provider = config?.provider ?? status?.provider;

      if (provider && provider !== "bohr_app") {
        let url: string | null = null;
        if (provider === "casdoor") {
          const state = Math.random().toString(36).substring(7);
          sessionStorage.setItem("auth_state", state);
          url = buildAuthorizeUrl(provider, config, state);
        } else {
          url = buildAuthorizeUrl(provider, config);
        }
        if (url) {
          window.location.href = url;
          return;
        }
      }
    } catch {
      // Fall through to show AuthErrorScreen
    }
    setShowAuthScreen(true);
  }, []);

  const isAuthenticating =
    status === "idle" ||
    status === "loading" ||
    (status === "succeeded" && !initialLoadComplete);
  const authFailed = status === "failed";
  const sharedAgentId = parseAgentShareHash(currentHash);
  const sharedChatToken = parseChatShareHash(currentHash);
  // 手机阈值：512px 以下强制 Sidebar（不可拖拽，全宽）
  const isMobile = viewportWidth < MOBILE_BREAKPOINT;

  if (!mounted) return null;

  // Legal pages — no auth required
  if (currentHash === "#/terms") {
    return (
      <Suspense>
        <TermsPage />
      </Suspense>
    );
  }
  if (currentHash === "#/privacy") {
    return (
      <Suspense>
        <PrivacyPage />
      </Suspense>
    );
  }

  // Shared chat page — no auth required, highest priority
  if (sharedChatToken) {
    return (
      <QueryClientProvider client={queryClient}>
        <SharedChatPage token={sharedChatToken} />
      </QueryClientProvider>
    );
  }

  // Shared agent detail page — no auth required
  if (sharedAgentId) {
    return (
      <QueryClientProvider client={queryClient}>
        <SharedAgentDetailPage
          marketplaceId={sharedAgentId}
          onBack={() => {
            window.location.hash = "";
          }}
        />
      </QueryClientProvider>
    );
  }

  const shouldShowCompactInput =
    layoutStyle === LAYOUT_STYLE.Sidebar && !isXyzenOpen && !isMobile;

  const mainLayout = shouldShowCompactInput ? (
    <CenteredInput position={centeredInputPosition} />
  ) : isMobile ? (
    <MobileApp
      backendUrl={backendUrl}
      showAuthError={authFailed}
      onRetryAuth={handleRetry}
    />
  ) : layoutStyle === LAYOUT_STYLE.Sidebar ? (
    <AppSide
      backendUrl={backendUrl}
      showAuthError={authFailed && isXyzenOpen}
      onRetryAuth={handleRetry}
    />
  ) : (
    // 大于等于阈值：默认/设置为 fullscreen
    <AppFullscreen backendUrl={backendUrl} />
  );

  const gatedContent = isAuthenticating ? (
    <AuthLoadingScreen progress={progress} />
  ) : authFailed ? (
    showLandingPage && !showAuthScreen ? (
      <LandingPageV2 onGetStarted={handleShowAuthScreen} />
    ) : (
      <AuthErrorScreen onRetry={handleRetry} variant="fullscreen" />
    )
  ) : (
    <>{mainLayout}</>
  );

  // Check if we're on the secret code page (key-protected)
  if (currentHash === "#secretcode") {
    return (
      <QueryClientProvider client={queryClient}>
        <Suspense>
          <SecretCodePage />
        </Suspense>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      {gatedContent}
    </QueryClientProvider>
  );
}

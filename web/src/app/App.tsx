import { Progress } from "@/components/animate-ui/components/radix/progress";
import { autoLogin } from "@/core/auth";
import { useAuth } from "@/hooks/useAuth";
import { useXyzen } from "@/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { CenteredInput } from "@/components/features";
import { DEFAULT_BACKEND_URL } from "@/configs";
import { MOBILE_BREAKPOINT } from "@/configs/common";
import useTheme from "@/hooks/useTheme";
import { LAYOUT_STYLE, type InputPosition } from "@/store/slices/uiSlice/types";
import { AppFullscreen } from "./AppFullscreen";
import { AppSide } from "./AppSide";
import AuthErrorScreen from "./auth/AuthErrorScreen";

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
}

export function Xyzen({
  backendUrl = DEFAULT_BACKEND_URL,
  showLlmProvider = false,
  centeredInputPosition,
}: XyzenProps) {
  const {
    isXyzenOpen,
    layoutStyle,
    setBackendUrl,
    toggleXyzen,
    fetchAgents,
    fetchSystemAgents,
    fetchMcpServers,
    fetchChatHistory,
    activateChannel,
    setInputPosition,
  } = useXyzen();
  const { status } = useAuth();

  // Initialize theme at the top level so it works for both layouts
  useTheme();
  const [mounted, setMounted] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1920,
  );
  const [progress, setProgress] = useState(0);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  useEffect(() => {
    setMounted(true);
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
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

  // Load initial data when auth succeeds
  useEffect(() => {
    if (status === "succeeded" && !initialLoadComplete) {
      const loadData = async () => {
        try {
          // 1. Fetch all necessary data in parallel
          await Promise.all([
            fetchAgents(),
            fetchSystemAgents(),
            fetchMcpServers(),
            fetchChatHistory(),
          ]);

          // 2. If there is an active chat channel (persisted), try to connect to it
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
    fetchAgents,
    fetchSystemAgents,
    fetchMcpServers,
    fetchChatHistory,
    activateChannel,
  ]);

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

  const isAuthenticating =
    status === "idle" ||
    status === "loading" ||
    (status === "succeeded" && !initialLoadComplete);
  const authFailed = status === "failed";
  // 手机阈值：512px 以下强制 Sidebar（不可拖拽，全宽）
  const isMobile = viewportWidth < MOBILE_BREAKPOINT;
  const isSidebarLayout = isMobile || layoutStyle === LAYOUT_STYLE.Sidebar;

  if (!mounted) return null;

  const shouldShowCompactInput =
    layoutStyle === LAYOUT_STYLE.Sidebar && !isXyzenOpen && !isMobile;

  const mainLayout = shouldShowCompactInput ? (
    <CenteredInput position={centeredInputPosition} />
  ) : isMobile ? (
    // 小于阈值：强制 Sidebar，全宽且不可拖拽
    <AppSide
      backendUrl={backendUrl}
      showLlmProvider={showLlmProvider}
      isMobile
      showAuthError={authFailed}
      onRetryAuth={handleRetry}
    />
  ) : layoutStyle === LAYOUT_STYLE.Sidebar ? (
    // 大于等于阈值：尊重设置为 Sidebar，桌面可拖拽
    <AppSide
      backendUrl={backendUrl}
      showLlmProvider={showLlmProvider}
      showAuthError={authFailed && isXyzenOpen}
      onRetryAuth={handleRetry}
    />
  ) : (
    // 大于等于阈值：默认/设置为 fullscreen
    <AppFullscreen backendUrl={backendUrl} showLlmProvider={showLlmProvider} />
  );

  const gatedContent = isAuthenticating ? (
    <AuthLoadingScreen progress={progress} />
  ) : authFailed ? (
    isSidebarLayout ? (
      <>{mainLayout}</>
    ) : (
      <AuthErrorScreen onRetry={handleRetry} variant="fullscreen" />
    )
  ) : (
    <>{mainLayout}</>
  );

  return (
    <QueryClientProvider client={queryClient}>
      {gatedContent}
    </QueryClientProvider>
  );
}

function AuthLoadingScreen({ progress }: { progress: number }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6 text-center">
      <Progress value={progress} className="w-56" />
    </div>
  );
}

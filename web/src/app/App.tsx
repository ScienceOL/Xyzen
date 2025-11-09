import { autoLogin } from "@/core/auth";
import { useXyzen } from "@/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { CenteredInput } from "@/components/features";
import { SettingsModal } from "@/components/modals/SettingsModal";
import { DEFAULT_BACKEND_URL } from "@/configs";
import { MOBILE_BREAKPOINT } from "@/configs/constants";
import useTheme from "@/hooks/useTheme";
import { LAYOUT_STYLE } from "@/store/slices/uiSlice/types";
import { McpListModal } from "../components/layouts/McpListModal";
import { AppFullscreen } from "./AppFullscreen";
import { AppSide } from "./AppSide";

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
}

export function Xyzen({
  backendUrl = DEFAULT_BACKEND_URL,
  showLlmProvider = false,
}: XyzenProps) {
  const { isXyzenOpen, layoutStyle } = useXyzen();

  // Initialize theme at the top level so it works for both layouts
  useTheme();
  const [mounted, setMounted] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1920,
  );

  useEffect(() => {
    setMounted(true);
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Initialize auth once at app root to avoid duplicate triggers from hooks
  useEffect(() => {
    autoLogin();
  }, []);

  if (!mounted) return null;

  // 手机阈值：512px 以下强制 Sidebar（不可拖拽，全宽）

  const isMobile = viewportWidth < MOBILE_BREAKPOINT;

  if (layoutStyle === LAYOUT_STYLE.Sidebar && !isXyzenOpen && !isMobile) {
    return (
      <QueryClientProvider client={queryClient}>
        <CenteredInput />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      {isMobile ? (
        // 小于阈值：强制 Sidebar，全宽且不可拖拽
        <AppSide
          backendUrl={backendUrl}
          showLlmProvider={showLlmProvider}
          isMobile
        />
      ) : layoutStyle === LAYOUT_STYLE.Sidebar ? (
        // 大于等于阈值：尊重设置为 Sidebar，桌面可拖拽
        <AppSide backendUrl={backendUrl} showLlmProvider={showLlmProvider} />
      ) : (
        // 大于等于阈值：默认/设置为 fullscreen
        <AppFullscreen
          backendUrl={backendUrl}
          showLlmProvider={showLlmProvider}
        />
      )}
      <McpListModal />
      <SettingsModal />
    </QueryClientProvider>
  );
}

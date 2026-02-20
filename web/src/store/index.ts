import { enableMapSet } from "immer";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

// Enable Immer support for Set/Map (used by derived state in ChatSlice)
enableMapSet();
import {
  createAgentSlice,
  createAuthSlice,
  createChatSlice,
  createFileUploadSlice,
  createKnowledgeSlice,
  createLoadingSlice,
  createMcpSlice,
  createMcpToolSlice,
  createNotificationSlice,
  createProviderSlice,
  createUiSlice,
} from "./slices";
import type { XyzenState } from "./types";

export const useXyzen = create<XyzenState>()(
  persist(
    immer((...a) => ({
      ...createUiSlice(...a),
      ...createChatSlice(...a),
      ...createAgentSlice(...a),
      ...createMcpSlice(...a),
      ...createMcpToolSlice(...a),
      ...createProviderSlice(...a),
      ...createAuthSlice(...a),
      ...createLoadingSlice(...a),
      ...createFileUploadSlice(...a),
      ...createKnowledgeSlice(...a),
      ...createNotificationSlice(...a),
    })),
    {
      name: "xyzen-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        isXyzenOpen: state.isXyzenOpen,
        panelWidth: state.panelWidth,
        activePanel: state.activePanel,
        theme: state.theme,
        token: state.token,
        user: state.user, // 持久化用户数据
        backendUrl: state.backendUrl, // 🔥 修复：持久化 backendUrl 避免使用空字符串
        activeChatChannel: state.activeChatChannel,
        spatialSidebarCollapsed: state.spatialSidebarCollapsed,
        capsuleOpen: state.capsuleOpen,
        capsuleActiveTab: state.capsuleActiveTab,
        mobileCeoOverlay: state.mobileCeoOverlay,
        mobilePage: state.mobilePage,
      }),
    },
  ),
);

// --- Diagnostic: detect unexpected message count drops ---
if (typeof window !== "undefined") {
  const prevMsgCounts = new Map<string, number>();

  useXyzen.subscribe((state) => {
    const activeId = state.activeChatChannel;
    if (!activeId) return;

    const channel = state.channels[activeId];
    if (!channel) return;

    const prevCount = prevMsgCounts.get(activeId) ?? 0;
    const currCount = channel.messages.length;

    if (prevCount > 0 && currCount < prevCount) {
      console.error(
        `[DIAGNOSTIC] MESSAGE COUNT DROP: ${activeId.slice(0, 8)} ${prevCount} → ${currCount}`,
        `| responding=${channel.responding}`,
        `| latestAssist=${(() => {
          const la = [...channel.messages]
            .reverse()
            .find((m) => m.role === "assistant");
          return la
            ? `id=${la.id.slice(0, 12)} agentExec=${la.agentExecution?.status}`
            : "none";
        })()}`,
        new Error("trace").stack,
      );
    }

    prevMsgCounts.set(activeId, currCount);
  });
}

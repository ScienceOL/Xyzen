import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import {
  createAgentSlice,
  createAuthSlice,
  createChatSlice,
  createLoadingSlice,
  createMcpSlice,
  createMcpToolSlice,
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
    })),
    {
      name: "xyzen-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        isXyzenOpen: state.isXyzenOpen,
        panelWidth: state.panelWidth,
        theme: state.theme,
        token: state.token,
        user: state.user, // 持久化用户数据
        backendUrl: state.backendUrl, // 🔥 修复：持久化 backendUrl 避免使用空字符串
      }),
    },
  ),
);

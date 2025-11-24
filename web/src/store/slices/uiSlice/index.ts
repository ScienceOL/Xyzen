import { DEFAULT_BACKEND_URL, DEFAULT_LAYOUT_STYLE } from "@/configs";
import { DEFAULT_WIDTH } from "@/configs/common";
import xyzenService from "@/service/xyzenService";
import type { StateCreator } from "zustand";
import type { Theme, UiSettingType, XyzenState } from "../../types";
import { type InputPosition, type LayoutStyle } from "./types";

// Ensure xyzen service is aware of the default backend on startup
xyzenService.setBackendUrl(DEFAULT_BACKEND_URL);

export type ActivityPanel = "chat" | "explorer" | "workshop";

export interface UiSlice {
  backendUrl: string;
  isXyzenOpen: boolean;
  panelWidth: number;
  activeTabIndex: number;
  activePanel: ActivityPanel;
  theme: Theme;
  layoutStyle: LayoutStyle;
  inputPosition: InputPosition;
  // Global modals
  isMcpListModalOpen: boolean;
  isLlmProvidersModalOpen: boolean;
  isAddMcpServerModalOpen: boolean;
  isAddLlmProviderModalOpen: boolean;
  isSettingsModalOpen: boolean;
  activeSettingsCategory: string;
  activeUiSetting: UiSettingType;
  selectedProviderId: string | null;
  pendingInput: string;

  toggleXyzen: () => void;
  openXyzen: () => void;
  closeXyzen: () => void;
  setPanelWidth: (width: number) => void;
  setTabIndex: (index: number) => void;
  setActivePanel: (panel: ActivityPanel) => void;
  setTheme: (theme: Theme) => void;
  setLayoutStyle: (style: LayoutStyle) => void;
  setInputPosition: (position: InputPosition) => void;
  setBackendUrl: (url: string) => void;
  // MCP list modal
  openMcpListModal: () => void;
  closeMcpListModal: () => void;
  // LLM Providers modal
  openLlmProvidersModal: () => void;
  closeLlmProvidersModal: () => void;
  openAddMcpServerModal: () => void;
  closeAddMcpServerModal: () => void;
  openAddLlmProviderModal: () => void;
  closeAddLlmProviderModal: () => void;
  openSettingsModal: (category?: string) => void;
  closeSettingsModal: () => void;
  setActiveSettingsCategory: (category: string) => void;
  setActiveUiSetting: (setting: UiSettingType) => void;
  setSelectedProvider: (id: string | null) => void;
  setPendingInput: (input: string) => void;
  submitInput: () => void;
}

export const createUiSlice: StateCreator<
  XyzenState,
  [["zustand/immer", never]],
  [],
  UiSlice
> = (set) => ({
  backendUrl: DEFAULT_BACKEND_URL,
  isXyzenOpen: false,
  panelWidth: DEFAULT_WIDTH,
  activeTabIndex: 0,
  activePanel: "chat",
  theme: (localStorage.getItem("theme") as Theme) || "system",
  layoutStyle: DEFAULT_LAYOUT_STYLE,
  inputPosition:
    (localStorage.getItem("inputPosition") as InputPosition) || "bottom",
  isMcpListModalOpen: false,
  isLlmProvidersModalOpen: false,
  isAddMcpServerModalOpen: false,
  isAddLlmProviderModalOpen: false,
  isSettingsModalOpen: false,
  activeSettingsCategory: "provider",
  activeUiSetting: "theme",
  selectedProviderId: null,
  pendingInput: "",

  toggleXyzen: () =>
    set((state: { isXyzenOpen: boolean }) => ({
      isXyzenOpen: !state.isXyzenOpen,
    })),
  openXyzen: () => set({ isXyzenOpen: true }),
  closeXyzen: () => set({ isXyzenOpen: false }),
  setPanelWidth: (width) => set({ panelWidth: width }),
  setTabIndex: (index) => set({ activeTabIndex: index }),
  setActivePanel: (panel) => set({ activePanel: panel }),
  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("theme", theme);
    }
    set({ theme });
  },
  setLayoutStyle: (style) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("layoutStyle", style);
    }
    set({ layoutStyle: style });
  },
  setInputPosition: (position) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("inputPosition", position);
    }
    set({ inputPosition: position });
  },
  setBackendUrl: (url) => {
    set({ backendUrl: url });
    xyzenService.setBackendUrl(url);
  },
  openMcpListModal: () => set({ isMcpListModalOpen: true }),
  closeMcpListModal: () => set({ isMcpListModalOpen: false }),
  openLlmProvidersModal: () => set({ isLlmProvidersModalOpen: true }),
  closeLlmProvidersModal: () => set({ isLlmProvidersModalOpen: false }),
  openAddMcpServerModal: () => set({ isAddMcpServerModalOpen: true }),
  closeAddMcpServerModal: () => set({ isAddMcpServerModalOpen: false }),
  openAddLlmProviderModal: () => set({ isAddLlmProviderModalOpen: true }),
  closeAddLlmProviderModal: () => set({ isAddLlmProviderModalOpen: false }),
  openSettingsModal: (category = "provider") =>
    set({ isSettingsModalOpen: true, activeSettingsCategory: category }),
  closeSettingsModal: () =>
    set({ isSettingsModalOpen: false, selectedProviderId: null }),
  setActiveSettingsCategory: (category) =>
    set({ activeSettingsCategory: category }),
  setActiveUiSetting: (setting) => set({ activeUiSetting: setting }),
  setSelectedProvider: (id) => set({ selectedProviderId: id }),
  setPendingInput: (input) => set({ pendingInput: input }),
  submitInput: () =>
    set(() => ({
      isXyzenOpen: true,
      activeTabIndex: 1, // Switch to Chat tab (legacy support)
      activePanel: "chat", // Switch to Chat panel
      // Keep the pendingInput so it can be used by the chat component
    })),
});

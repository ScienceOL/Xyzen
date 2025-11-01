import xyzenService from "@/service/xyzenService";
import type { StateCreator } from "zustand";
import type { Theme, XyzenState, LayoutStyle, UiSettingType } from "../types";

export interface UiSlice {
  backendUrl: string;
  isXyzenOpen: boolean;
  panelWidth: number;
  activeTabIndex: number;
  theme: Theme;
  layoutStyle: LayoutStyle;
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
  setTheme: (theme: Theme) => void;
  setLayoutStyle: (style: LayoutStyle) => void;
  setBackendUrl: (url: string) => void;
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
  backendUrl: "",
  isXyzenOpen: false,
  panelWidth: 380,
  activeTabIndex: 0,
  theme: (localStorage.getItem("theme") as Theme) || "system",
  layoutStyle:
    (localStorage.getItem("layoutStyle") as LayoutStyle) || "fullscreen",
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
  setBackendUrl: (url) => {
    set({ backendUrl: url });
    xyzenService.setBackendUrl(url);
  },
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
      activeTabIndex: 1, // Switch to Chat tab
      // Keep the pendingInput so it can be used by the chat component
    })),
});

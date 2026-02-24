import { DEFAULT_BACKEND_URL, DEFAULT_LAYOUT_STYLE } from "@/configs";
import { DEFAULT_WIDTH } from "@/configs/common";
import xyzenService from "@/service/xyzenService";
import type { StateCreator } from "zustand";
import type { Theme, UiSettingType, XyzenState } from "../../types";
import { type InputPosition, type LayoutStyle } from "./types";

// Ensure xyzen service is aware of the default backend on startup
xyzenService.setBackendUrl(DEFAULT_BACKEND_URL);

export type ActivityPanel =
  | "chat"
  | "knowledge"
  | "skills"
  | "marketplace"
  | "memory"
  | "sandbox"
  | "tasks"
  | "account";

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
  spatialSidebarCollapsed: boolean;
  capsuleOpen: boolean;
  capsuleActiveTab: "knowledge" | "tools" | "sandbox" | "memory";
  showOfficialRecommendations: boolean;
  // Mobile navigation
  mobileCeoOverlay: boolean;
  mobilePage: number;
  // Spatial focus request (from notification clicks etc.)
  pendingFocusAgentId: string | null;
  // Message highlight (scroll-to + flash)
  highlightMessageId: string | null;

  // Spatial open tabs per agent (agentId → ordered tab list)
  openTabsByAgent: Record<string, { id: string; name: string }[]>;

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
  setSpatialSidebarCollapsed: (collapsed: boolean) => void;
  setCapsuleOpen: (open: boolean) => void;
  setCapsuleActiveTab: (
    tab: "knowledge" | "tools" | "sandbox" | "memory",
  ) => void;
  setShowOfficialRecommendations: (show: boolean) => void;
  setMobileCeoOverlay: (visible: boolean) => void;
  setMobilePage: (page: number) => void;
  requestFocusAgent: (agentId: string | null) => void;
  highlightMessage: (messageId: string | null) => void;
  // Spatial open tabs
  openTab: (agentId: string, tab: { id: string; name: string }) => void;
  closeTab: (agentId: string, topicId: string) => void;
  setOpenTabs: (agentId: string, tabs: { id: string; name: string }[]) => void;
  renameTab: (topicId: string, name: string) => void;
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
  activeSettingsCategory: "account",
  activeUiSetting: "theme",
  selectedProviderId: null,
  pendingInput: "",
  spatialSidebarCollapsed: false,
  capsuleOpen: false,
  capsuleActiveTab: "knowledge",
  showOfficialRecommendations:
    localStorage.getItem("officialRecommendationsDismissed") !== "true",
  mobileCeoOverlay: true,
  mobilePage: 0,
  pendingFocusAgentId: null,
  highlightMessageId: null,
  openTabsByAgent: {},

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
  openSettingsModal: (category = "account") =>
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
  setSpatialSidebarCollapsed: (collapsed) =>
    set({ spatialSidebarCollapsed: collapsed }),
  setCapsuleOpen: (open) => set({ capsuleOpen: open }),
  setCapsuleActiveTab: (tab) => set({ capsuleActiveTab: tab }),
  setShowOfficialRecommendations: (show) => {
    localStorage.setItem(
      "officialRecommendationsDismissed",
      show ? "false" : "true",
    );
    set({ showOfficialRecommendations: show });
  },
  setMobileCeoOverlay: (visible) => set({ mobileCeoOverlay: visible }),
  setMobilePage: (page) => set({ mobilePage: page }),
  requestFocusAgent: (agentId) => set({ pendingFocusAgentId: agentId }),
  highlightMessage: (messageId) => set({ highlightMessageId: messageId }),
  openTab: (agentId, tab) =>
    set((state) => {
      const existing = state.openTabsByAgent[agentId] ?? [];
      if (existing.some((t) => t.id === tab.id)) return;
      state.openTabsByAgent[agentId] = [...existing, tab];
    }),
  closeTab: (agentId, topicId) =>
    set((state) => {
      const existing = state.openTabsByAgent[agentId];
      if (!existing) return;
      state.openTabsByAgent[agentId] = existing.filter((t) => t.id !== topicId);
    }),
  setOpenTabs: (agentId, tabs) =>
    set((state) => {
      state.openTabsByAgent[agentId] = tabs;
    }),
  renameTab: (topicId, name) =>
    set((state) => {
      for (const tabs of Object.values(state.openTabsByAgent)) {
        const tab = tabs.find((t) => t.id === topicId);
        if (tab) {
          tab.name = name;
          break;
        }
      }
    }),
});

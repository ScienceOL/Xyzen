import type { StateCreator } from "zustand";
import type { FileTreeItem } from "@/service/folderService";
import { folderService } from "@/service/folderService";
import type { KnowledgeTab } from "@/components/knowledge/types";
import type { XyzenState } from "../types";

export interface KnowledgeSlice {
  // Navigation state (previously Layout.tsx local state)
  knowledgeActiveTab: KnowledgeTab;
  knowledgeFolderId: string | null;
  knowledgeSetId: string | null;

  // Tree data from /folders/tree API
  knowledgeTreeItems: FileTreeItem[];
  knowledgeTreeLoading: boolean;
  knowledgeTreeSignal: number;

  // Actions
  navigateKnowledge: (
    tab: KnowledgeTab,
    knowledgeSetId?: string | null,
  ) => void;
  setKnowledgeFolderId: (id: string | null) => void;
  fetchKnowledgeTree: () => Promise<void>;
  refreshKnowledge: () => void;
}

export const createKnowledgeSlice: StateCreator<
  XyzenState,
  [["zustand/immer", never]],
  [],
  KnowledgeSlice
> = (set, get) => ({
  knowledgeActiveTab: "home",
  knowledgeFolderId: null,
  knowledgeSetId: null,

  knowledgeTreeItems: [],
  knowledgeTreeLoading: false,
  knowledgeTreeSignal: 0,

  navigateKnowledge: (tab, knowledgeSetId = null) => {
    set((state) => {
      state.knowledgeActiveTab = tab;
      state.knowledgeSetId =
        tab === "knowledge" ? (knowledgeSetId ?? null) : null;
      state.knowledgeFolderId = null;
    });
  },

  setKnowledgeFolderId: (id) => {
    set((state) => {
      state.knowledgeFolderId = id;
    });
  },

  fetchKnowledgeTree: async () => {
    const { knowledgeActiveTab, knowledgeSetId } = get();

    // Only fetch for tabs that use the tree view
    if (knowledgeActiveTab !== "all" && knowledgeActiveTab !== "knowledge") {
      return;
    }

    // Don't fetch without a knowledge set ID for the knowledge tab
    if (knowledgeActiveTab === "knowledge" && !knowledgeSetId) {
      set((state) => {
        state.knowledgeTreeItems = [];
        state.knowledgeTreeLoading = false;
      });
      return;
    }

    set((state) => {
      state.knowledgeTreeLoading = true;
    });

    try {
      const ksId =
        knowledgeActiveTab === "knowledge"
          ? (knowledgeSetId ?? undefined)
          : undefined;
      const items = await folderService.getTree(ksId);
      set((state) => {
        state.knowledgeTreeItems = items;
        state.knowledgeTreeLoading = false;
      });
    } catch (e) {
      console.error("Failed to fetch knowledge tree", e);
      set((state) => {
        state.knowledgeTreeLoading = false;
      });
    }
  },

  refreshKnowledge: () => {
    set((state) => {
      state.knowledgeTreeSignal += 1;
    });
  },
});

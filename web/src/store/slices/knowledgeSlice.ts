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

  // Trash tree data
  trashTreeItems: FileTreeItem[];
  trashTreeLoading: boolean;

  // Actions
  navigateKnowledge: (
    tab: KnowledgeTab,
    knowledgeSetId?: string | null,
  ) => void;
  setKnowledgeFolderId: (id: string | null) => void;
  fetchKnowledgeTree: () => Promise<void>;
  refreshKnowledge: () => void;

  /** Optimistically remove item(s) from the active tree. */
  removeTreeItems: (ids: string[]) => void;
  /** Optimistically rename an item in the active tree. */
  renameTreeItem: (id: string, newName: string) => void;
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

  trashTreeItems: [],
  trashTreeLoading: false,

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

    // Trash tab: fetch only-deleted items
    if (knowledgeActiveTab === "trash") {
      set((state) => {
        state.trashTreeLoading = true;
      });

      try {
        const items = await folderService.getTree(undefined, true);
        set((state) => {
          state.trashTreeItems = items;
          state.trashTreeLoading = false;
        });
      } catch (e) {
        console.error("Failed to fetch trash tree", e);
        set((state) => {
          state.trashTreeLoading = false;
        });
      }
      return;
    }

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

  removeTreeItems: (ids) => {
    set((state) => {
      const idSet = new Set(ids);
      if (state.knowledgeActiveTab === "trash") {
        state.trashTreeItems = state.trashTreeItems.filter(
          (i) => !idSet.has(i.id),
        );
      } else {
        state.knowledgeTreeItems = state.knowledgeTreeItems.filter(
          (i) => !idSet.has(i.id),
        );
      }
    });
  },

  renameTreeItem: (id, newName) => {
    set((state) => {
      const list =
        state.knowledgeActiveTab === "trash"
          ? state.trashTreeItems
          : state.knowledgeTreeItems;
      const item = list.find((i) => i.id === id);
      if (item) item.name = newName;
    });
  },
});

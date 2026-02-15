import { useXyzen } from "@/store";
import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";

export function useKnowledge() {
  const {
    knowledgeActiveTab,
    knowledgeFolderId,
    knowledgeSetId,
    knowledgeTreeItems,
    knowledgeTreeLoading,
    knowledgeTreeSignal,
    trashTreeItems,
    trashTreeLoading,
    navigateKnowledge,
    setKnowledgeFolderId,
    fetchKnowledgeTree,
    refreshKnowledge,
    removeTreeItems,
    renameTreeItem,
  } = useXyzen(
    useShallow((s) => ({
      knowledgeActiveTab: s.knowledgeActiveTab,
      knowledgeFolderId: s.knowledgeFolderId,
      knowledgeSetId: s.knowledgeSetId,
      knowledgeTreeItems: s.knowledgeTreeItems,
      knowledgeTreeLoading: s.knowledgeTreeLoading,
      knowledgeTreeSignal: s.knowledgeTreeSignal,
      trashTreeItems: s.trashTreeItems,
      trashTreeLoading: s.trashTreeLoading,
      navigateKnowledge: s.navigateKnowledge,
      setKnowledgeFolderId: s.setKnowledgeFolderId,
      fetchKnowledgeTree: s.fetchKnowledgeTree,
      refreshKnowledge: s.refreshKnowledge,
      removeTreeItems: s.removeTreeItems,
      renameTreeItem: s.renameTreeItem,
    })),
  );

  // Auto-fetch tree when tab/knowledgeSetId/signal changes
  useEffect(() => {
    if (
      knowledgeActiveTab === "all" ||
      knowledgeActiveTab === "knowledge" ||
      knowledgeActiveTab === "trash"
    ) {
      fetchKnowledgeTree();
    }
  }, [
    knowledgeActiveTab,
    knowledgeSetId,
    knowledgeTreeSignal,
    fetchKnowledgeTree,
  ]);

  return {
    knowledgeActiveTab,
    knowledgeFolderId,
    knowledgeSetId,
    knowledgeTreeItems,
    knowledgeTreeLoading,
    knowledgeTreeSignal,
    trashTreeItems,
    trashTreeLoading,
    navigateKnowledge,
    setKnowledgeFolderId,
    fetchKnowledgeTree,
    refreshKnowledge,
    removeTreeItems,
    renameTreeItem,
  };
}

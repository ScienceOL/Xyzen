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
    navigateKnowledge,
    setKnowledgeFolderId,
    fetchKnowledgeTree,
    refreshKnowledge,
  } = useXyzen(
    useShallow((s) => ({
      knowledgeActiveTab: s.knowledgeActiveTab,
      knowledgeFolderId: s.knowledgeFolderId,
      knowledgeSetId: s.knowledgeSetId,
      knowledgeTreeItems: s.knowledgeTreeItems,
      knowledgeTreeLoading: s.knowledgeTreeLoading,
      knowledgeTreeSignal: s.knowledgeTreeSignal,
      navigateKnowledge: s.navigateKnowledge,
      setKnowledgeFolderId: s.setKnowledgeFolderId,
      fetchKnowledgeTree: s.fetchKnowledgeTree,
      refreshKnowledge: s.refreshKnowledge,
    })),
  );

  // Auto-fetch tree when tab/knowledgeSetId/signal changes
  useEffect(() => {
    if (knowledgeActiveTab === "all" || knowledgeActiveTab === "knowledge") {
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
    navigateKnowledge,
    setKnowledgeFolderId,
    fetchKnowledgeTree,
    refreshKnowledge,
  };
}

import { KnowledgeFilePanel } from "@/components/knowledge/KnowledgeFilePanel";
import { useActiveChannelStatus } from "@/hooks/useChannelSelectors";
import { useTranslation } from "react-i18next";

export function KnowledgeTab() {
  const { t } = useTranslation();
  const { knowledge_set_id } = useActiveChannelStatus();

  if (!knowledge_set_id) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
          {t("capsule.knowledge.noKnowledgeSet")}
        </p>
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          {t("capsule.knowledge.noKnowledgeSetHint")}
        </p>
      </div>
    );
  }

  return (
    <KnowledgeFilePanel
      knowledgeSetId={knowledge_set_id}
      showToolbar={false}
      showStatusBar={false}
      enableUpload
    />
  );
}

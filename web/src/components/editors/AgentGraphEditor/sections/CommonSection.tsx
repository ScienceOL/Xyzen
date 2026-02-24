import { FieldGroup, Input, TagInput } from "@/components/base";
import type { GraphNodeConfig } from "@/types/graphConfig";
import { memo } from "react";
import { useTranslation } from "react-i18next";

interface CommonSectionProps {
  config: GraphNodeConfig;
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string | null) => void;
  onReadsChange: (reads: string[]) => void;
  onWritesChange: (writes: string[]) => void;
  onBlur: () => void;
}

function CommonSection({
  config,
  onNameChange,
  onDescriptionChange,
  onReadsChange,
  onWritesChange,
  onBlur,
}: CommonSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      {/* Read-only ID */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-400 dark:text-neutral-500">
          {t("agents.graphEditor.nodePanel.id")}:
        </span>
        <code className="rounded bg-neutral-100/60 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-white/[0.04] dark:text-neutral-400">
          {config.id}
        </code>
      </div>

      <FieldGroup label={t("agents.graphEditor.common.name")}>
        <Input
          value={config.name}
          onChange={(e) => onNameChange(e.target.value)}
          onBlur={onBlur}
          placeholder={t("agents.graphEditor.common.namePlaceholder")}
        />
      </FieldGroup>

      <FieldGroup label={t("agents.graphEditor.common.description")}>
        <Input
          value={config.description || ""}
          onChange={(e) => onDescriptionChange(e.target.value || null)}
          onBlur={onBlur}
          placeholder={t("agents.graphEditor.common.descriptionPlaceholder")}
        />
      </FieldGroup>

      <FieldGroup
        label={t("agents.graphEditor.common.reads")}
        hint={t("agents.graphEditor.common.readsHint")}
      >
        <TagInput
          value={config.reads}
          onChange={(tags) => {
            onReadsChange(tags);
          }}
          placeholder={t("agents.graphEditor.common.readsPlaceholder")}
        />
      </FieldGroup>

      <FieldGroup
        label={t("agents.graphEditor.common.writes")}
        hint={t("agents.graphEditor.common.writesHint")}
      >
        <TagInput
          value={config.writes}
          onChange={(tags) => {
            onWritesChange(tags);
          }}
          placeholder={t("agents.graphEditor.common.writesPlaceholder")}
        />
      </FieldGroup>
    </div>
  );
}

export default memo(CommonSection);

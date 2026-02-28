import { FieldGroup, Input, TagInput, Textarea } from "@/components/base";
import MonacoEditorModal from "@/components/editors/MonacoEditorModal";
import type { TransformNodeConfig } from "@/types/graphConfig";
import { ArrowsPointingOutIcon } from "@heroicons/react/24/outline";
import { memo, useState } from "react";
import { useTranslation } from "react-i18next";

interface TransformSectionProps {
  config: TransformNodeConfig;
  onChange: (updates: Partial<TransformNodeConfig>) => void;
  onBlur: () => void;
}

function TransformSection({ config, onChange, onBlur }: TransformSectionProps) {
  const { t } = useTranslation();
  const [templateExpanded, setTemplateExpanded] = useState(false);

  return (
    <div className="space-y-4">
      <FieldGroup
        label={t("agents.graphEditor.transform.template")}
        labelExtra={
          <button
            type="button"
            onClick={() => setTemplateExpanded(true)}
            className="rounded p-0.5 text-neutral-400 transition-colors hover:bg-neutral-200/60 hover:text-neutral-600 dark:hover:bg-white/[0.08] dark:hover:text-neutral-300"
            title={t("agents.graphEditor.fullscreenEdit")}
          >
            <ArrowsPointingOutIcon className="h-3.5 w-3.5" />
          </button>
        }
      >
        <Textarea
          value={config.template}
          onChange={(e) => onChange({ template: e.target.value })}
          onBlur={onBlur}
          rows={6}
          placeholder={t("agents.graphEditor.transform.templatePlaceholder")}
          className="font-mono"
        />
      </FieldGroup>

      <MonacoEditorModal
        isOpen={templateExpanded}
        onClose={() => setTemplateExpanded(false)}
        title={t("agents.graphEditor.transform.template")}
        value={config.template}
        onChange={(val) => {
          onChange({ template: val });
          onBlur();
        }}
        language="markdown"
      />

      <FieldGroup label={t("agents.graphEditor.transform.outputKey")}>
        <Input
          value={config.output_key}
          onChange={(e) => onChange({ output_key: e.target.value })}
          onBlur={onBlur}
          placeholder={t("agents.graphEditor.transform.outputKeyPlaceholder")}
        />
      </FieldGroup>

      <FieldGroup label={t("agents.graphEditor.transform.inputKeys")}>
        <TagInput
          value={config.input_keys}
          onChange={(tags) => onChange({ input_keys: tags })}
          placeholder={t("agents.graphEditor.transform.inputKeysPlaceholder")}
        />
      </FieldGroup>
    </div>
  );
}

export default memo(TransformSection);

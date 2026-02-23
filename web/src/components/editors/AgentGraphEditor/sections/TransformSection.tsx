import { FieldGroup, Input, TagInput, Textarea } from "@/components/base";
import type { TransformNodeConfig } from "@/types/graphConfig";
import { memo } from "react";
import { useTranslation } from "react-i18next";

interface TransformSectionProps {
  config: TransformNodeConfig;
  onChange: (updates: Partial<TransformNodeConfig>) => void;
  onBlur: () => void;
}

function TransformSection({ config, onChange, onBlur }: TransformSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <FieldGroup label={t("agents.graphEditor.transform.template")}>
        <Textarea
          value={config.template}
          onChange={(e) => onChange({ template: e.target.value })}
          onBlur={onBlur}
          rows={6}
          placeholder={t("agents.graphEditor.transform.templatePlaceholder")}
          className="font-mono"
        />
      </FieldGroup>

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

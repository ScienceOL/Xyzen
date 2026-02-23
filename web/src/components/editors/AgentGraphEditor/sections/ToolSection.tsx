import { FieldGroup, Input, TagInput } from "@/components/base";
import { Switch } from "@/components/base/Switch";
import type { ToolNodeConfig } from "@/types/graphConfig";
import { memo } from "react";
import { useTranslation } from "react-i18next";

interface ToolSectionProps {
  config: ToolNodeConfig;
  onChange: (updates: Partial<ToolNodeConfig>) => void;
  onBlur: () => void;
}

function ToolSection({ config, onChange, onBlur }: ToolSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <FieldGroup label={t("agents.graphEditor.tool.outputKey")}>
        <Input
          value={config.output_key}
          onChange={(e) => onChange({ output_key: e.target.value })}
          onBlur={onBlur}
          placeholder={t("agents.graphEditor.tool.outputKeyPlaceholder")}
        />
      </FieldGroup>

      <div className="flex items-center justify-between py-1">
        <span className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
          {t("agents.graphEditor.tool.executeAll")}
        </span>
        <Switch
          checked={config.execute_all}
          onChange={(checked) => onChange({ execute_all: checked })}
        />
      </div>

      <FieldGroup
        label={t("agents.graphEditor.tool.toolFilter")}
        hint={t("agents.graphEditor.tool.toolFilterHint")}
      >
        <TagInput
          value={config.tool_filter || []}
          onChange={(tags) =>
            onChange({ tool_filter: tags.length ? tags : null })
          }
          placeholder={t("agents.graphEditor.tool.toolFilterPlaceholder")}
        />
      </FieldGroup>

      <FieldGroup label={t("agents.graphEditor.tool.timeoutSeconds")}>
        <Input
          type="number"
          value={String(config.timeout_seconds)}
          onChange={(e) =>
            onChange({
              timeout_seconds: Math.max(
                1,
                Math.min(600, Number(e.target.value) || 60),
              ),
            })
          }
          onBlur={onBlur}
          min={1}
          max={600}
        />
      </FieldGroup>
    </div>
  );
}

export default memo(ToolSection);

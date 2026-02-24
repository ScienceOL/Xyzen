import { FieldGroup, Input } from "@/components/base";
import type { ComponentNodeConfig } from "@/types/graphConfig";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { memo } from "react";
import { useTranslation } from "react-i18next";

interface ComponentSectionProps {
  config: ComponentNodeConfig;
  onChange: (updates: Partial<ComponentNodeConfig>) => void;
  onBlur: () => void;
}

function ComponentSection({ config, onChange, onBlur }: ComponentSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <FieldGroup label={t("agents.graphEditor.component.componentKey")}>
        <Input
          value={config.component_ref.key}
          onChange={(e) =>
            onChange({
              component_ref: { ...config.component_ref, key: e.target.value },
            })
          }
          onBlur={onBlur}
          placeholder={t(
            "agents.graphEditor.component.componentKeyPlaceholder",
          )}
        />
      </FieldGroup>

      <FieldGroup label={t("agents.graphEditor.component.componentVersion")}>
        <Input
          value={config.component_ref.version}
          onChange={(e) =>
            onChange({
              component_ref: {
                ...config.component_ref,
                version: e.target.value,
              },
            })
          }
          onBlur={onBlur}
          placeholder={t(
            "agents.graphEditor.component.componentVersionPlaceholder",
          )}
        />
      </FieldGroup>

      {/* config_overrides hint */}
      <div className="flex items-start gap-2 rounded-lg bg-neutral-100/60 p-3 dark:bg-white/[0.04]">
        <InformationCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {t("agents.graphEditor.component.configOverridesHint")}
        </p>
      </div>
    </div>
  );
}

export default memo(ComponentSection);

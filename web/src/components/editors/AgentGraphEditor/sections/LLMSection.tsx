import { FieldGroup, Input, TagInput, Textarea } from "@/components/base";
import { Switch } from "@/components/base/Switch";
import MonacoEditorModal from "@/components/editors/MonacoEditorModal";
import type { LLMNodeConfig } from "@/types/graphConfig";
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "@headlessui/react";
import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { ArrowsPointingOutIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { memo, useState } from "react";
import { useTranslation } from "react-i18next";

interface LLMSectionProps {
  config: LLMNodeConfig;
  onChange: (updates: Partial<LLMNodeConfig>) => void;
  onBlur: () => void;
}

function LLMSection({ config, onChange, onBlur }: LLMSectionProps) {
  const { t } = useTranslation();
  const [promptExpanded, setPromptExpanded] = useState(false);

  return (
    <div className="space-y-3">
      {/* Prompt & Output — default open */}
      <Disclosure defaultOpen>
        {({ open }) => (
          <div className="rounded-lg bg-neutral-100/60 dark:bg-white/[0.04]">
            <DisclosureButton className="flex w-full items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
              <ChevronRightIcon
                className={clsx(
                  "h-4 w-4 text-neutral-400 transition-transform",
                  open && "rotate-90",
                )}
              />
              {t("agents.graphEditor.llm.promptOutput")}
            </DisclosureButton>
            <DisclosurePanel className="space-y-4 px-3 pb-3">
              <FieldGroup
                label={t("agents.graphEditor.llm.promptTemplate")}
                labelExtra={
                  <button
                    type="button"
                    onClick={() => setPromptExpanded(true)}
                    className="rounded p-0.5 text-neutral-400 transition-colors hover:bg-neutral-200/60 hover:text-neutral-600 dark:hover:bg-white/[0.08] dark:hover:text-neutral-300"
                    title={t("agents.graphEditor.fullscreenEdit")}
                  >
                    <ArrowsPointingOutIcon className="h-3.5 w-3.5" />
                  </button>
                }
              >
                <Textarea
                  value={config.prompt_template}
                  onChange={(e) =>
                    onChange({ prompt_template: e.target.value })
                  }
                  onBlur={onBlur}
                  rows={6}
                  placeholder={t("agents.graphEditor.llm.promptPlaceholder")}
                  className="font-mono"
                />
              </FieldGroup>

              <MonacoEditorModal
                isOpen={promptExpanded}
                onClose={() => setPromptExpanded(false)}
                title={t("agents.graphEditor.llm.promptTemplate")}
                value={config.prompt_template}
                onChange={(val) => {
                  onChange({ prompt_template: val });
                  onBlur();
                }}
                language="markdown"
              />

              <FieldGroup label={t("agents.graphEditor.llm.outputKey")}>
                <Input
                  value={config.output_key}
                  onChange={(e) => onChange({ output_key: e.target.value })}
                  onBlur={onBlur}
                  placeholder={t("agents.graphEditor.llm.outputKeyPlaceholder")}
                />
              </FieldGroup>

              <FieldGroup label={t("agents.graphEditor.llm.messageKey")}>
                <Input
                  value={config.message_key || ""}
                  onChange={(e) =>
                    onChange({ message_key: e.target.value || null })
                  }
                  onBlur={onBlur}
                  placeholder={t(
                    "agents.graphEditor.llm.messageKeyPlaceholder",
                  )}
                />
              </FieldGroup>
            </DisclosurePanel>
          </div>
        )}
      </Disclosure>

      {/* Model & Tools — default closed */}
      <Disclosure>
        {({ open }) => (
          <div className="rounded-lg bg-neutral-100/60 dark:bg-white/[0.04]">
            <DisclosureButton className="flex w-full items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
              <ChevronRightIcon
                className={clsx(
                  "h-4 w-4 text-neutral-400 transition-transform",
                  open && "rotate-90",
                )}
              />
              {t("agents.graphEditor.llm.modelTools")}
            </DisclosureButton>
            <DisclosurePanel className="space-y-4 px-3 pb-3">
              <FieldGroup label={t("agents.graphEditor.llm.modelOverride")}>
                <Input
                  value={config.model_override || ""}
                  onChange={(e) =>
                    onChange({ model_override: e.target.value || null })
                  }
                  onBlur={onBlur}
                  placeholder={t(
                    "agents.graphEditor.llm.modelOverridePlaceholder",
                  )}
                />
              </FieldGroup>

              <FieldGroup label={t("agents.graphEditor.llm.temperature")}>
                <Input
                  type="number"
                  value={
                    config.temperature_override != null
                      ? String(config.temperature_override)
                      : ""
                  }
                  onChange={(e) =>
                    onChange({
                      temperature_override: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  onBlur={onBlur}
                  placeholder="0.7"
                  min={0}
                  max={2}
                  step={0.1}
                />
              </FieldGroup>

              <FieldGroup label={t("agents.graphEditor.llm.maxTokens")}>
                <Input
                  type="number"
                  value={
                    config.max_tokens != null ? String(config.max_tokens) : ""
                  }
                  onChange={(e) =>
                    onChange({
                      max_tokens: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  onBlur={onBlur}
                  placeholder="4096"
                  min={1}
                />
              </FieldGroup>

              <div className="flex items-center justify-between py-1">
                <span className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
                  {t("agents.graphEditor.llm.toolsEnabled")}
                </span>
                <Switch
                  checked={config.tools_enabled}
                  onChange={(checked) => onChange({ tools_enabled: checked })}
                />
              </div>

              {config.tools_enabled && (
                <FieldGroup
                  label={t("agents.graphEditor.llm.toolFilter")}
                  hint={t("agents.graphEditor.llm.toolFilterHint")}
                >
                  <TagInput
                    value={config.tool_filter || []}
                    onChange={(tags) =>
                      onChange({ tool_filter: tags.length ? tags : null })
                    }
                    placeholder={t(
                      "agents.graphEditor.llm.toolFilterPlaceholder",
                    )}
                  />
                </FieldGroup>
              )}

              <FieldGroup label={t("agents.graphEditor.llm.maxIterations")}>
                <Input
                  type="number"
                  value={String(config.max_iterations)}
                  onChange={(e) =>
                    onChange({
                      max_iterations: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  onBlur={onBlur}
                  min={1}
                />
              </FieldGroup>
            </DisclosurePanel>
          </div>
        )}
      </Disclosure>
    </div>
  );
}

export default memo(LLMSection);

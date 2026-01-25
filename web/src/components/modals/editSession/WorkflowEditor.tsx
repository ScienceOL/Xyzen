import { AgentGraphEditor } from "@/components/editors/AgentGraphEditor";
import { JsonEditor } from "@/components/editors/JsonEditor";
import PublishAgentModal from "@/components/features/PublishAgentModal";
import { useXyzen } from "@/store";
import type { Agent } from "@/types/agents";
import type { GraphConfig } from "@/types/graphConfig";
import {
  Button as HeadlessButton,
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
} from "@headlessui/react";
import {
  CodeBracketIcon,
  CubeTransparentIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface WorkflowEditorProps {
  agent: Agent;
  onClose: () => void;
}

export default function WorkflowEditor({
  agent: agentToEdit,
  onClose,
}: WorkflowEditorProps) {
  const { t } = useTranslation();
  const { updateAgent } = useXyzen();
  const [isSaving, setIsSaving] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);

  // Check if agent is forked (explicit nullish check to match backend `is not None`)
  const isForked = agentToEdit.original_source_id != null;

  // Graph config state
  const [graphConfig, setGraphConfig] = useState<GraphConfig | null>(() => {
    if (agentToEdit?.graph_config) {
      return agentToEdit.graph_config as unknown as GraphConfig;
    }
    return null;
  });
  const [graphConfigJson, setGraphConfigJson] = useState<string>(() => {
    if (agentToEdit?.graph_config) {
      return JSON.stringify(agentToEdit.graph_config, null, 2);
    }
    return "";
  });
  const [graphConfigError, setGraphConfigError] = useState<string | null>(null);
  const [activeEditorTab, setActiveEditorTab] = useState(0);

  useEffect(() => {
    if (agentToEdit.graph_config) {
      const config = agentToEdit.graph_config as unknown as GraphConfig;
      setGraphConfig(config);
      setGraphConfigJson(JSON.stringify(config, null, 2));
    } else {
      setGraphConfig(null);
      setGraphConfigJson("");
    }
    setGraphConfigError(null);
  }, [agentToEdit]);

  const handleGraphConfigChange = useCallback((config: GraphConfig) => {
    setGraphConfig(config);
    setGraphConfigJson(JSON.stringify(config, null, 2));
    setGraphConfigError(null);
  }, []);

  const handleJsonChange = useCallback((value: string) => {
    setGraphConfigJson(value);
    if (!value.trim()) {
      setGraphConfig(null);
      setGraphConfigError(null);
      return;
    }
    try {
      const parsed = JSON.parse(value) as GraphConfig;
      setGraphConfig(parsed);
      setGraphConfigError(null);
    } catch {
      setGraphConfigError("Invalid JSON format");
    }
  }, []);

  const handleJsonValidation = useCallback(
    (isValid: boolean, errors: string[]) => {
      setGraphConfigError(isValid ? null : errors[0] || "Invalid JSON");
    },
    [],
  );

  const handleEditorTabChange = useCallback(
    (index: number) => {
      if (activeEditorTab === 1 && index === 0 && graphConfigJson.trim()) {
        try {
          const parsed = JSON.parse(graphConfigJson) as GraphConfig;
          setGraphConfig(parsed);
          setGraphConfigError(null);
        } catch {
          // Keep error
        }
      }
      setActiveEditorTab(index);
    },
    [activeEditorTab, graphConfigJson],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    if (graphConfigError) {
      alert("Please fix the JSON configuration errors before saving.");
      return;
    }

    let finalGraphConfig: Record<string, unknown> | null = null;

    if (graphConfigJson.trim()) {
      try {
        finalGraphConfig = JSON.parse(graphConfigJson);
      } catch {
        alert("Invalid JSON in graph configuration.");
        return;
      }
    }

    setIsSaving(true);
    try {
      await updateAgent({
        ...agentToEdit,
        graph_config: finalGraphConfig,
      });
      onClose();
    } catch (error) {
      console.error("Failed to update agent:", error);
      alert(t("agents.errors.updateFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-[60vh]">
      {/* Graph Editor - Full width */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <TabGroup
          selectedIndex={activeEditorTab}
          onChange={handleEditorTabChange}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabList className="shrink-0 flex gap-1 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-lg">
            <Tab className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 data-selected:bg-white data-selected:text-indigo-600 data-selected:shadow-sm dark:data-selected:bg-neutral-700 dark:data-selected:text-indigo-400 transition-all outline-none">
              <CubeTransparentIcon className="w-4 h-4" />
              {t("agents.sessionSettings.workflow.visualEditor")}
            </Tab>
            <Tab className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 data-selected:bg-white data-selected:text-indigo-600 data-selected:shadow-sm dark:data-selected:bg-neutral-700 dark:data-selected:text-indigo-400 transition-all outline-none">
              <CodeBracketIcon className="w-4 h-4" />
              {t("agents.sessionSettings.workflow.jsonEditor")}
              {graphConfigError && (
                <span className="w-2 h-2 rounded-full bg-red-500" />
              )}
            </Tab>
          </TabList>

          <TabPanels className="flex-1 mt-3 min-h-0">
            {/* Visual Editor Panel */}
            <TabPanel className="h-full">
              <AgentGraphEditor
                value={graphConfig}
                onChange={handleGraphConfigChange}
                height="100%"
                graphId={agentToEdit.id}
              />
            </TabPanel>

            {/* JSON Editor Panel */}
            <TabPanel className="h-full flex flex-col">
              <p className="shrink-0 mb-3 text-xs text-neutral-500 dark:text-neutral-400">
                {t("agents.sessionSettings.workflow.jsonDescription")}
              </p>
              <div className="flex-1 min-h-0">
                <JsonEditor
                  value={graphConfigJson}
                  onChange={handleJsonChange}
                  onValidationChange={handleJsonValidation}
                  height="100%"
                />
              </div>
              {graphConfigError && (
                <p className="shrink-0 mt-2 text-xs text-red-600 dark:text-red-400">
                  {graphConfigError}
                </p>
              )}
            </TabPanel>
          </TabPanels>
        </TabGroup>
      </div>

      {/* Footer - Actions */}
      <div
        className={`shrink-0 mt-4 flex gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-700 ${isForked ? "justify-end" : "justify-between"}`}
      >
        {!isForked && (
          <HeadlessButton
            type="button"
            onClick={() => setShowPublishModal(true)}
            disabled={!agentToEdit.graph_config}
            className="inline-flex items-center gap-2 rounded-md bg-purple-100 py-2 px-4 text-sm font-medium text-purple-700 hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50 transition-colors"
            title={
              !agentToEdit.graph_config
                ? t("agents.actions.publishTooltip")
                : t("agents.actions.publish")
            }
          >
            <SparklesIcon className="h-4 w-4" />
            {t("agents.actions.publish")}
          </HeadlessButton>
        )}
        <div className="flex gap-3">
          <HeadlessButton
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-md bg-neutral-100 py-2 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 transition-colors"
          >
            {t("agents.actions.cancel")}
          </HeadlessButton>
          <HeadlessButton
            type="submit"
            disabled={isSaving}
            className={`inline-flex items-center gap-2 rounded-md py-2 px-4 text-sm font-medium transition-colors ${
              isSaving
                ? "bg-indigo-400 text-white cursor-not-allowed"
                : "bg-indigo-600 text-white hover:bg-indigo-500"
            }`}
          >
            {isSaving ? t("agents.actions.saving") : t("agents.actions.save")}
          </HeadlessButton>
        </div>
      </div>

      {/* Publish to Marketplace Modal - only render for non-forked agents */}
      {!isForked && (
        <PublishAgentModal
          open={showPublishModal}
          onOpenChange={setShowPublishModal}
          agentId={agentToEdit.id}
          agentName={agentToEdit.name}
          agentDescription={agentToEdit.description}
          agentPrompt={agentToEdit.prompt}
          graphConfig={agentToEdit.graph_config}
          mcpServers={agentToEdit.mcp_servers?.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description || undefined,
          }))}
          onPublishSuccess={(marketplaceId) => {
            console.log("Agent published to marketplace:", marketplaceId);
            setShowPublishModal(false);
          }}
        />
      )}
    </form>
  );
}

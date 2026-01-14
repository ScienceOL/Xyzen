import { Modal } from "@/components/animate-ui/components/animate/modal";
import { Input } from "@/components/base/Input";
import { AgentGraphEditor } from "@/components/editors/AgentGraphEditor";
import { JsonEditor } from "@/components/editors/JsonEditor";
import PublishAgentModal from "@/components/features/PublishAgentModal";
import { useXyzen } from "@/store";
import type { Agent } from "@/types/agents";
import type { GraphConfig } from "@/types/graphConfig";
import {
  extractSimpleConfig,
  isStandardReactPattern,
  mergeSimpleConfigToGraphConfig,
  type SimpleAgentConfig,
} from "@/utils/agentConfigMapper";
import {
  Button,
  Field,
  Label,
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
} from "@headlessui/react";
import {
  CodeBracketIcon,
  CubeTransparentIcon,
  PlusIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { McpServerItem } from "./McpServerItem";

interface EditAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  agent: Agent | null;
}

const EditAgentModal: React.FC<EditAgentModalProps> = ({
  isOpen,
  onClose,
  agent: agentToEdit,
}) => {
  const { t } = useTranslation();
  const { updateAgent, mcpServers, fetchMcpServers, openAddMcpServerModal } =
    useXyzen();
  const [agent, setAgent] = useState<Agent | null>(agentToEdit);
  const [mcpServerIds, setMcpServerIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);

  // Graph config state - initialize from prop to avoid null on first render
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
  const [activeTab, setActiveTab] = useState(0);

  // Simple config state (extracted from graph_config for form editing)
  const [simpleConfig, setSimpleConfig] = useState<SimpleAgentConfig | null>(
    () => {
      if (agentToEdit?.graph_config) {
        const config = agentToEdit.graph_config as unknown as GraphConfig;
        return extractSimpleConfig(config, agentToEdit.prompt);
      }
      return extractSimpleConfig(null, agentToEdit?.prompt);
    },
  );

  // Check if the graph uses standard ReAct pattern (safe to edit via simple form)
  const canUseSimpleForm = useMemo(
    () => isStandardReactPattern(graphConfig),
    [graphConfig],
  );

  useEffect(() => {
    setAgent(agentToEdit);
    if (agentToEdit) {
      setMcpServerIds(agentToEdit.mcp_servers?.map((s) => s.id) || []);

      // Initialize graph config
      if (agentToEdit.graph_config) {
        // Safe type conversion - graph_config from backend may not fully match GraphConfig
        const config = agentToEdit.graph_config as unknown as GraphConfig;
        setGraphConfig(config);
        setGraphConfigJson(JSON.stringify(config, null, 2));
        // Extract simple config from graph_config
        setSimpleConfig(extractSimpleConfig(config, agentToEdit.prompt));
      } else {
        setGraphConfig(null);
        setGraphConfigJson("");
        // Use agent's prompt field as fallback for simple config
        setSimpleConfig(extractSimpleConfig(null, agentToEdit.prompt));
      }
      setGraphConfigError(null);
    }
    if (isOpen) {
      fetchMcpServers();
    }
  }, [agentToEdit, isOpen, fetchMcpServers]);

  // Handle simple form field changes (name, description)
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (!agent) return;
    const { name, value } = e.target;
    setAgent({ ...agent, [name]: value });
  };

  // Handle prompt change - syncs to both agent.prompt and simpleConfig
  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!agent || !simpleConfig) return;
      const newPrompt = e.target.value;

      // Update agent.prompt (for backwards compatibility)
      setAgent({ ...agent, prompt: newPrompt });

      // Update simple config
      setSimpleConfig({ ...simpleConfig, prompt: newPrompt });
    },
    [agent, simpleConfig],
  );

  const handleMcpServerChange = (serverId: string) => {
    setMcpServerIds((prevIds) =>
      prevIds.includes(serverId)
        ? prevIds.filter((id) => id !== serverId)
        : [...prevIds, serverId],
    );
  };

  // Handle visual editor changes - sync back to simple config
  const handleGraphConfigChange = useCallback(
    (config: GraphConfig) => {
      setGraphConfig(config);
      setGraphConfigJson(JSON.stringify(config, null, 2));
      setGraphConfigError(null);

      // Sync back to simple config if using standard pattern
      if (isStandardReactPattern(config)) {
        const extracted = extractSimpleConfig(config);
        setSimpleConfig(extracted);
        // Also update agent.prompt for backwards compatibility
        if (agent) {
          setAgent({ ...agent, prompt: extracted.prompt });
        }
      }
    },
    [agent],
  );

  // Handle JSON editor changes - sync back to simple config
  const handleJsonChange = useCallback(
    (value: string) => {
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

        // Sync back to simple config if using standard pattern
        if (isStandardReactPattern(parsed)) {
          const extracted = extractSimpleConfig(parsed);
          setSimpleConfig(extracted);
          // Also update agent.prompt for backwards compatibility
          if (agent) {
            setAgent({ ...agent, prompt: extracted.prompt });
          }
        }
      } catch {
        setGraphConfigError("Invalid JSON format");
      }
    },
    [agent],
  );

  // Handle JSON validation callback
  const handleJsonValidation = useCallback(
    (isValid: boolean, errors: string[]) => {
      setGraphConfigError(isValid ? null : errors[0] || "Invalid JSON");
    },
    [],
  );

  // Sync JSON to visual editor when switching tabs
  const handleTabChange = useCallback(
    (index: number) => {
      // If switching from JSON to Visual, parse the JSON
      if (activeTab === 1 && index === 0 && graphConfigJson.trim()) {
        try {
          const parsed = JSON.parse(graphConfigJson) as GraphConfig;
          setGraphConfig(parsed);
          setGraphConfigError(null);
        } catch {
          // Keep the error, user will see it
        }
      }
      setActiveTab(index);
    },
    [activeTab, graphConfigJson],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agent) return;
    if (isSaving) return;
    if (graphConfigError) {
      alert("Please fix the JSON configuration errors before saving.");
      return;
    }

    // Build the final graph_config
    let finalGraphConfig: Record<string, unknown> | null = null;

    // If we have simple config and are using standard pattern, merge it into graph_config
    if (simpleConfig && canUseSimpleForm) {
      // Merge simple config changes into graph_config (creates new if none exists)
      const mergedConfig = mergeSimpleConfigToGraphConfig(
        graphConfig,
        simpleConfig,
      );
      finalGraphConfig = mergedConfig as unknown as Record<string, unknown>;
    } else if (graphConfigJson.trim()) {
      // Use JSON editor value directly if graph has been customized
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
        ...agent,
        mcp_server_ids: mcpServerIds,
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

  if (!agent) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("agents.editTitle", { name: agent.name })}
      maxWidth="max-w-7xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col h-[75vh]">
        {/* Main content - split layout */}
        <div className="flex-1 flex gap-6 min-h-0 overflow-hidden">
          {/* Left sidebar - Agent info */}
          <div className="w-80 flex-shrink-0 flex flex-col gap-4 overflow-y-auto pr-2">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {t("agents.updateDescription")}
            </p>

            {/* Name */}
            <Field>
              <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {t("agents.fields.name.label")}
              </Label>
              <Input
                name="name"
                value={agent.name}
                onChange={handleChange}
                placeholder={t("agents.fields.name.placeholder")}
                required
              />
            </Field>

            {/* Description */}
            <Field>
              <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {t("agents.fields.description.label")}
              </Label>
              <Input
                name="description"
                value={agent.description}
                onChange={handleChange}
                placeholder={t("agents.fields.description.placeholder")}
              />
            </Field>

            {/* System Prompt */}
            <Field>
              <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {t("agents.fields.prompt.label")}
              </Label>
              <textarea
                name="prompt"
                value={simpleConfig?.prompt ?? agent.prompt ?? ""}
                onChange={handlePromptChange}
                placeholder={t("agents.fields.prompt.placeholder")}
                rows={6}
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500"
              />
              {!canUseSimpleForm && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  Note: This agent has a custom workflow. Prompt changes may not
                  apply to all nodes.
                </p>
              )}
            </Field>

            {/* MCP Servers */}
            <Field className="flex-1 min-h-0">
              <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {t("agents.fields.mcpServers.connected")}
              </Label>
              <div className="mt-2 flex-1 max-h-48 space-y-1 overflow-y-auto rounded-md border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-800/50">
                {mcpServers.length > 0 ? (
                  mcpServers.map((server) => (
                    <McpServerItem
                      key={server.id}
                      mcp={server}
                      isSelected={mcpServerIds.includes(server.id)}
                      onSelectionChange={() => handleMcpServerChange(server.id)}
                    />
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center p-4 text-center">
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      {t("agents.fields.mcpServers.empty")}
                    </p>
                    <Button
                      type="button"
                      onClick={() => {
                        onClose();
                        openAddMcpServerModal();
                      }}
                      className="mt-2 inline-flex items-center gap-2 rounded-md bg-indigo-100 py-1.5 px-3 text-sm font-medium text-indigo-600 hover:bg-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-300 dark:hover:bg-indigo-900"
                    >
                      <PlusIcon className="h-4 w-4" />
                      {t("agents.fields.mcpServers.createButton")}
                    </Button>
                  </div>
                )}
              </div>
            </Field>
          </div>

          {/* Divider */}
          <div className="w-px bg-neutral-200 dark:bg-neutral-700 flex-shrink-0" />

          {/* Right side - Graph Editor */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            <TabGroup
              selectedIndex={activeTab}
              onChange={handleTabChange}
              className="flex-1 flex flex-col min-h-0"
            >
              <TabList className="flex-shrink-0 flex gap-1 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-lg">
                <Tab className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 data-[selected]:bg-white data-[selected]:text-indigo-600 data-[selected]:shadow-sm dark:data-[selected]:bg-neutral-700 dark:data-[selected]:text-indigo-400 transition-all outline-none">
                  <CubeTransparentIcon className="w-4 h-4" />
                  Visual Editor
                </Tab>
                <Tab className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 data-[selected]:bg-white data-[selected]:text-indigo-600 data-[selected]:shadow-sm dark:data-[selected]:bg-neutral-700 dark:data-[selected]:text-indigo-400 transition-all outline-none">
                  <CodeBracketIcon className="w-4 h-4" />
                  JSON Editor
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
                  />
                </TabPanel>

                {/* JSON Editor Panel */}
                <TabPanel className="h-full flex flex-col">
                  <p className="flex-shrink-0 mb-3 text-xs text-neutral-500 dark:text-neutral-400">
                    Configure advanced agent behavior using JSON. Leave empty to
                    use defaults.
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
                    <p className="flex-shrink-0 mt-2 text-xs text-red-600 dark:text-red-400">
                      {graphConfigError}
                    </p>
                  )}
                </TabPanel>
              </TabPanels>
            </TabGroup>
          </div>
        </div>

        {/* Footer - Actions */}
        <div className="flex-shrink-0 mt-6 flex justify-between pt-4 border-t border-neutral-200 dark:border-neutral-700">
          <Button
            type="button"
            onClick={() => setShowPublishModal(true)}
            disabled={!agent.prompt}
            className="inline-flex items-center gap-2 rounded-md bg-purple-100 py-2 px-4 text-sm font-medium text-purple-700 hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50 transition-colors"
            title={
              !agent.prompt
                ? t("agents.actions.publishTooltip")
                : t("agents.actions.publish")
            }
          >
            <SparklesIcon className="h-4 w-4" />
            {t("agents.actions.publish")}
          </Button>
          <div className="flex gap-3">
            <Button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-md bg-neutral-100 py-2 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            >
              {t("agents.actions.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
              className={`inline-flex items-center gap-2 rounded-md py-2 px-4 text-sm font-medium transition-colors ${
                isSaving
                  ? "bg-indigo-400 text-white cursor-not-allowed"
                  : "bg-indigo-600 text-white hover:bg-indigo-500"
              }`}
            >
              {isSaving ? t("agents.actions.saving") : t("agents.actions.save")}
            </Button>
          </div>
        </div>
      </form>

      {/* Publish to Marketplace Modal */}
      <PublishAgentModal
        open={showPublishModal}
        onOpenChange={setShowPublishModal}
        agentId={agent.id}
        agentName={agent.name}
        agentDescription={agent.description}
        agentPrompt={agent.prompt}
        mcpServers={agent.mcp_servers?.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description || undefined,
        }))}
        onPublishSuccess={(marketplaceId) => {
          console.log("Agent published to marketplace:", marketplaceId);
          setShowPublishModal(false);
        }}
      />
    </Modal>
  );
};

export default EditAgentModal;

import { Modal } from "@/components/animate-ui/components/animate/modal";
import { Input } from "@/components/base/Input";
import { useXyzen } from "@/store";
import type { Agent, SystemAgentTemplate } from "@/types/agents";
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
  BeakerIcon,
  PlusIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { McpServerItem } from "./McpServerItem";

interface AddAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (agentId: string) => void;
}

type TabMode = "custom" | "system";

function AddAgentModal({ isOpen, onClose, onCreated }: AddAgentModalProps) {
  const { t } = useTranslation();
  const {
    createAgent,
    createAgentFromTemplate,
    isCreatingAgent,
    mcpServers,
    fetchMcpServers,
    openAddMcpServerModal,
    systemAgentTemplates,
    templatesLoading,
    fetchSystemAgentTemplates,
  } = useXyzen();

  const [tabMode, setTabMode] = useState<TabMode>("custom");
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string | null>(
    null,
  );
  const [customName, setCustomName] = useState<string>("");

  const [agent, setAgent] = useState<
    Omit<
      Agent,
      | "id"
      | "user_id"
      | "mcp_servers"
      | "mcp_server_ids"
      | "created_at"
      | "updated_at"
    >
  >({
    name: "",
    description: "",
    prompt: "",
  });
  const [mcpServerIds, setMcpServerIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch MCP servers and system agent templates when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchMcpServers();
      fetchSystemAgentTemplates();
    }
  }, [isOpen, fetchMcpServers, fetchSystemAgentTemplates]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setAgent((prev) => ({ ...prev, [name]: value }));
  };

  const handleMcpServerChange = (serverId: string) => {
    setMcpServerIds((prevIds) =>
      prevIds.includes(serverId)
        ? prevIds.filter((id) => id !== serverId)
        : [...prevIds, serverId],
    );
  };

  const handleTemplateSelect = (template: SystemAgentTemplate) => {
    setSelectedTemplateKey(template.key);
    // Pre-fill name with template name if custom name is empty
    if (!customName) {
      setCustomName(template.metadata.name);
    }
  };

  // Build payload for custom agent - backend will generate graph_config
  const buildCustomAgentPayload = () => ({
    ...agent,
    mcp_server_ids: mcpServerIds,
    // Note: graph_config is NOT sent - backend generates it using ReActAgent
    // This ensures single source of truth for the ReAct pattern
    user_id: "temp", // Backend will get this from auth token
    mcp_servers: [], // Backend will handle associations
    created_at: new Date().toISOString(), // Will be overridden by backend
    updated_at: new Date().toISOString(), // Will be overridden by backend
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      let newAgentId: string | undefined;
      if (tabMode === "custom") {
        if (!agent.name) {
          alert(t("agents.errors.nameRequired"));
          return;
        }
        newAgentId = await createAgent(buildCustomAgentPayload());
      } else {
        if (!selectedTemplateKey) {
          alert(t("agents.errors.templateRequired"));
          return;
        }
        // Use the new from-template endpoint
        newAgentId = await createAgentFromTemplate(
          selectedTemplateKey,
          customName || undefined,
        );
      }
      handleClose();
      // Notify parent about the created agent
      if (newAgentId && onCreated) {
        onCreated(newAgentId);
      }
    } catch (error) {
      console.error("Failed to create agent:", error);
      alert(t("agents.errors.createFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitDisabled =
    tabMode === "custom"
      ? isSubmitting || isCreatingAgent || !agent.name
      : isSubmitting || isCreatingAgent || !selectedTemplateKey;

  const submitLabel =
    isSubmitting || isCreatingAgent
      ? t("agents.actions.creating")
      : t("agents.actions.create");

  const handleClose = () => {
    setAgent({
      name: "",
      description: "",
      prompt: "",
    });
    setMcpServerIds([]);
    setSelectedTemplateKey(null);
    setCustomName("");
    setTabMode("custom");
    onClose();
  };

  const handleTabChange = (index: number) => {
    setTabMode(index === 0 ? "custom" : "system");
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t("agents.createTitle")}
    >
      <TabGroup onChange={handleTabChange}>
        <TabList className="flex space-x-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
          <Tab
            className={({ selected }) =>
              `w-full rounded-md py-2 text-sm font-medium leading-5 transition-colors
            ${
              selected
                ? "bg-white text-indigo-600 shadow dark:bg-neutral-700 dark:text-indigo-400"
                : "text-neutral-600 hover:bg-white/50 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700/50 dark:hover:text-neutral-200"
            }`
            }
          >
            <span className="flex items-center justify-center gap-2">
              <SparklesIcon className="h-4 w-4" />
              {t("agents.tabs.custom")}
            </span>
          </Tab>
          <Tab
            className={({ selected }) =>
              `w-full rounded-md py-2 text-sm font-medium leading-5 transition-colors
            ${
              selected
                ? "bg-white text-indigo-600 shadow dark:bg-neutral-700 dark:text-indigo-400"
                : "text-neutral-600 hover:bg-white/50 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700/50 dark:hover:text-neutral-200"
            }`
            }
          >
            <span className="flex items-center justify-center gap-2">
              <BeakerIcon className="h-4 w-4" />
              {t("agents.tabs.system")}
            </span>
          </Tab>
        </TabList>

        <TabPanels className="mt-4">
          {/* Custom Agent Tab */}
          <TabPanel>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              {t("agents.createDescription")}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field>
                <Label className="text-sm/6 font-medium text-neutral-700 dark:text-white">
                  {t("agents.fields.name.required")}
                </Label>
                <Input
                  name="name"
                  value={agent.name}
                  onChange={handleChange}
                  placeholder={t("agents.fields.name.placeholder")}
                  className="mt-1"
                  required
                />
              </Field>

              <Field>
                <Label className="text-sm/6 font-medium text-neutral-700 dark:text-white">
                  {t("agents.fields.description.label")}
                </Label>
                <Input
                  name="description"
                  value={agent.description}
                  onChange={handleChange}
                  placeholder={t("agents.fields.description.placeholder")}
                  className="mt-1"
                />
              </Field>

              <Field>
                <Label className="text-sm/6 font-medium text-neutral-700 dark:text-white">
                  {t("agents.fields.prompt.label")}
                </Label>
                <textarea
                  name="prompt"
                  value={agent.prompt}
                  onChange={handleChange}
                  placeholder={t("agents.fields.prompt.placeholder")}
                  rows={4}
                  className="mt-1 block w-full rounded-sm border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400"
                />
              </Field>

              <Field>
                <Label className="text-sm/6 font-medium text-neutral-700 dark:text-white">
                  {t("agents.fields.mcpServers.label")}
                </Label>
                <div className="mt-2 space-y-2">
                  {mcpServers.length === 0 ? (
                    <div className="rounded-sm border border-dashed border-neutral-300 bg-neutral-50 p-4 text-center dark:border-neutral-700 dark:bg-neutral-800/50">
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        {t("agents.fields.mcpServers.emptyDescription")}
                      </p>
                      <Button
                        type="button"
                        onClick={() => {
                          handleClose(); // Close current modal with cleanup
                          openAddMcpServerModal(); // Open add server modal
                        }}
                        className="mt-2 inline-flex items-center gap-2 rounded-sm bg-indigo-100 py-1.5 px-3 text-sm/6 font-semibold text-indigo-600 focus:outline-none data-[hover]:bg-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-300 dark:data-[hover]:bg-indigo-900"
                      >
                        <PlusIcon className="h-4 w-4" />
                        {t("agents.fields.mcpServers.createButton")}
                      </Button>
                    </div>
                  ) : (
                    <div className="max-h-60 overflow-y-auto space-y-2 rounded-sm border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-800">
                      {mcpServers.map((server) => (
                        <McpServerItem
                          key={server.id}
                          mcp={server}
                          isSelected={mcpServerIds.includes(server.id)}
                          onSelectionChange={() =>
                            handleMcpServerChange(server.id)
                          }
                        />
                      ))}
                      <Button
                        type="button"
                        onClick={() => {
                          handleClose(); // Close current modal with cleanup
                          openAddMcpServerModal(); // Open add server modal
                        }}
                        className="mt-2 inline-flex items-center gap-2 rounded-sm bg-indigo-100 py-1.5 px-3 text-sm/6 font-semibold text-indigo-600 focus:outline-none data-[hover]:bg-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-300 dark:data-[hover]:bg-indigo-900"
                      >
                        <PlusIcon className="h-4 w-4" />
                        {t("agents.fields.mcpServers.createButton")}
                      </Button>
                    </div>
                  )}
                </div>
              </Field>

              <div className="mt-6 flex justify-end gap-4">
                <Button
                  type="button"
                  onClick={handleClose}
                  className="inline-flex items-center gap-2 rounded-sm bg-neutral-100 py-1.5 px-3 text-sm/6 font-semibold text-neutral-700 shadow-sm focus:outline-none data-hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:data-[hover]:bg-neutral-700"
                >
                  {t("agents.actions.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={submitDisabled}
                  className={`inline-flex items-center gap-2 rounded-sm py-1.5 px-3 text-sm/6 font-semibold shadow-inner shadow-white/10 focus:outline-none ${
                    submitDisabled
                      ? "bg-gray-400 text-gray-200 cursor-not-allowed dark:bg-gray-600 dark:text-gray-400"
                      : "bg-indigo-600 text-white data-[hover]:bg-indigo-500 data-[open]:bg-indigo-700 data-[focus]:outline-1 data-[focus]:outline-white dark:bg-indigo-500 dark:data-[hover]:bg-indigo-400"
                  }`}
                >
                  {submitLabel}
                </Button>
              </div>
            </form>
          </TabPanel>

          {/* System Agent Tab */}
          <TabPanel>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              {t("agents.systemDescription")}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field>
                <Label className="text-sm/6 font-medium text-neutral-700 dark:text-white">
                  {t("agents.fields.selectSystemAgent")}
                </Label>
                <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
                  {templatesLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                      <span className="ml-2 text-sm text-neutral-500">
                        {t("common.loading")}
                      </span>
                    </div>
                  ) : systemAgentTemplates.length === 0 ? (
                    <div className="rounded-sm border border-dashed border-neutral-300 bg-neutral-50 p-4 text-center dark:border-neutral-700 dark:bg-neutral-800/50">
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        {t("agents.noSystemAgents")}
                      </p>
                    </div>
                  ) : (
                    systemAgentTemplates.map((template) => (
                      <SystemAgentCard
                        key={template.key}
                        template={template}
                        isSelected={selectedTemplateKey === template.key}
                        onSelect={() => handleTemplateSelect(template)}
                      />
                    ))
                  )}
                </div>
              </Field>

              {selectedTemplateKey && (
                <Field>
                  <Label className="text-sm/6 font-medium text-neutral-700 dark:text-white">
                    {t("agents.fields.customName")}
                  </Label>
                  <Input
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder={
                      systemAgentTemplates.find(
                        (t) => t.key === selectedTemplateKey,
                      )?.metadata.name
                    }
                    className="mt-1"
                  />
                </Field>
              )}

              <div className="mt-6 flex justify-end gap-4">
                <Button
                  type="button"
                  onClick={handleClose}
                  className="inline-flex items-center gap-2 rounded-sm bg-neutral-100 py-1.5 px-3 text-sm/6 font-semibold text-neutral-700 shadow-sm focus:outline-none data-[hover]:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:data-[hover]:bg-neutral-700"
                >
                  {t("agents.actions.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={submitDisabled}
                  className={`inline-flex items-center gap-2 rounded-sm py-1.5 px-3 text-sm/6 font-semibold shadow-inner shadow-white/10 focus:outline-none ${
                    submitDisabled
                      ? "bg-gray-400 text-gray-200 cursor-not-allowed dark:bg-gray-600 dark:text-gray-400"
                      : "bg-indigo-600 text-white data-[hover]:bg-indigo-500 data-[open]:bg-indigo-700 data-[focus]:outline-1 data-[focus]:outline-white dark:bg-indigo-500 dark:data-[hover]:bg-indigo-400"
                  }`}
                >
                  {submitLabel}
                </Button>
              </div>
            </form>
          </TabPanel>
        </TabPanels>
      </TabGroup>
    </Modal>
  );
}

// System Agent Card Component
interface SystemAgentCardProps {
  template: SystemAgentTemplate;
  isSelected: boolean;
  onSelect: () => void;
}

function SystemAgentCard({
  template,
  isSelected,
  onSelect,
}: SystemAgentCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-lg border-2 p-4 transition-all ${
        isSelected
          ? "border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-900/20"
          : "border-neutral-200 bg-white hover:border-indigo-300 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:border-indigo-600 dark:hover:bg-neutral-750"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex-shrink-0 rounded-lg p-2 ${
            isSelected
              ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-800 dark:text-indigo-300"
              : "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
          }`}
        >
          <BeakerIcon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-neutral-900 dark:text-white">
              {template.metadata.name}
            </h3>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              v{template.metadata.version}
            </span>
          </div>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2">
            {template.metadata.description}
          </p>
          {template.metadata.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {template.metadata.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        {isSelected && (
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-indigo-600 dark:text-indigo-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        )}
      </div>
    </button>
  );
}

export default AddAgentModal;

import { Modal } from "@/components/animate-ui/primitives/headless/modal";
import { Input } from "@/components/base/Input";
import PublishAgentModal from "@/components/features/PublishAgentModal";
import { useXyzen } from "@/store";
import type { Agent } from "@/types/agents";
import {
  Button,
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  Field,
  Label,
} from "@headlessui/react";
import {
  ChevronDownIcon,
  PlusIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import React, { useEffect, useState } from "react";
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
  const [graphConfigJson, setGraphConfigJson] = useState<string>("");
  const [graphConfigError, setGraphConfigError] = useState<string | null>(null);

  useEffect(() => {
    setAgent(agentToEdit);
    if (agentToEdit) {
      setMcpServerIds(agentToEdit.mcp_servers?.map((s) => s.id) || []);
      setGraphConfigJson(
        agentToEdit.graph_config
          ? JSON.stringify(agentToEdit.graph_config, null, 2)
          : "",
      );
      setGraphConfigError(null);
    }
    if (isOpen) {
      fetchMcpServers();
    }
  }, [agentToEdit, isOpen, fetchMcpServers]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (!agent) return;
    const { name, value } = e.target;
    setAgent({ ...agent, [name]: value });
  };

  const handleMcpServerChange = (serverId: string) => {
    setMcpServerIds((prevIds) =>
      prevIds.includes(serverId)
        ? prevIds.filter((id) => id !== serverId)
        : [...prevIds, serverId],
    );
  };

  const handleGraphConfigChange = (value: string) => {
    setGraphConfigJson(value);
    if (!value.trim()) {
      setGraphConfigError(null);
      return;
    }
    try {
      JSON.parse(value);
      setGraphConfigError(null);
    } catch {
      setGraphConfigError("Invalid JSON format");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agent) return;
    if (isSaving) return;
    if (graphConfigError) {
      alert("Please fix the JSON configuration errors before saving.");
      return;
    }

    // Parse graph_config if provided
    let parsedGraphConfig: Record<string, unknown> | null = null;
    if (graphConfigJson.trim()) {
      try {
        parsedGraphConfig = JSON.parse(graphConfigJson);
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
        graph_config: parsedGraphConfig,
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
    >
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        {t("agents.updateDescription")}
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
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
        <Field>
          <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {t("agents.fields.description.label")}
          </Label>
          <textarea
            name="description"
            value={agent.description}
            onChange={handleChange}
            placeholder={t("agents.fields.description.placeholder")}
            className="w-full rounded-sm border-neutral-300 bg-neutral-100 px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-indigo-500 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500"
          />
        </Field>
        <Field>
          <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {t("agents.fields.prompt.label")}
          </Label>
          <textarea
            name="prompt"
            value={agent.prompt}
            onChange={handleChange}
            placeholder={t("agents.fields.prompt.placeholder")}
            rows={4}
            className="w-full rounded-sm border-neutral-300 bg-neutral-100 px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-indigo-500 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500"
          />
        </Field>
        <Disclosure
          as="div"
          className="rounded-sm border border-neutral-200 dark:border-neutral-700"
        >
          <DisclosureButton className="group flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800">
            <span>Advanced Configuration (JSON)</span>
            <ChevronDownIcon className="h-4 w-4 text-neutral-500 transition-transform duration-200 group-data-[open]:rotate-180" />
          </DisclosureButton>
          <DisclosurePanel className="px-3 pb-3">
            <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
              Configure advanced agent behavior using JSON. Leave empty to use
              defaults.
            </p>
            <textarea
              value={graphConfigJson}
              onChange={(e) => handleGraphConfigChange(e.target.value)}
              placeholder='{"key": "value"}'
              rows={6}
              className={`w-full font-mono text-xs rounded-sm border px-3 py-2 text-neutral-900 placeholder-neutral-400 focus:ring-1 dark:text-neutral-100 dark:placeholder-neutral-500 ${
                graphConfigError
                  ? "border-red-500 bg-red-50 focus:border-red-500 focus:ring-red-500 dark:bg-red-900/20"
                  : "border-neutral-300 bg-neutral-100 focus:border-indigo-500 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-800"
              }`}
            />
            {graphConfigError && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {graphConfigError}
              </p>
            )}
          </DisclosurePanel>
        </Disclosure>
        <Field>
          <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {t("agents.fields.mcpServers.connected")}
          </Label>
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-sm border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-800/50">
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
                    onClose(); // Close current modal
                    openAddMcpServerModal(); // Open add server modal
                  }}
                  className="mt-2 inline-flex items-center gap-2 rounded-sm bg-indigo-100 py-1.5 px-3 text-sm/6 font-semibold text-indigo-600 focus:outline-none data-hover:bg-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-300 dark:data-hover:bg-indigo-900"
                >
                  <PlusIcon className="h-4 w-4" />
                  {t("agents.fields.mcpServers.createButton")}
                </Button>
              </div>
            )}
          </div>
        </Field>
        <div className="mt-6 flex justify-between">
          <Button
            type="button"
            onClick={() => setShowPublishModal(true)}
            disabled={!agent.prompt}
            className="inline-flex items-center gap-2 rounded-sm bg-purple-100 py-1.5 px-3 text-sm/6 font-semibold text-purple-700 shadow-sm focus:outline-none data-[hover]:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-purple-900/30 dark:text-purple-300 dark:data-[hover]:bg-purple-900/50"
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
              className="inline-flex items-center gap-2 rounded-sm bg-neutral-100 py-1.5 px-3 text-sm/6 font-semibold text-neutral-700 shadow-sm focus:outline-none data-hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:data-hover:bg-neutral-700"
            >
              {t("agents.actions.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
              className={`inline-flex items-center gap-2 rounded-sm py-1.5 px-3 text-sm/6 font-semibold shadow-inner shadow-white/10 focus:outline-none ${
                isSaving
                  ? "bg-indigo-400 text-white cursor-not-allowed dark:bg-indigo-700"
                  : "bg-indigo-600 text-white data-hover:bg-indigo-500 data-open:bg-indigo-700 data-focus:outline-1 data-focus:outline-white dark:bg-indigo-500 dark:data-hover:bg-indigo-400"
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
          // Optionally show a success notification
        }}
      />
    </Modal>
  );
};

export default EditAgentModal;

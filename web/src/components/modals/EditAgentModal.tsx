import { Modal } from "@/components/animate-ui/primitives/headless/modal";
import { Input } from "@/components/base/Input";
import { useXyzen } from "@/store";
import type { Agent } from "@/types/agents";
import { Button, Field, Label } from "@headlessui/react";
import { PlusIcon } from "@heroicons/react/24/outline";
import React, { useEffect, useState } from "react";
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
  const { updateAgent, mcpServers, fetchMcpServers, openAddMcpServerModal } =
    useXyzen();
  const [agent, setAgent] = useState<Agent | null>(agentToEdit);
  const [mcpServerIds, setMcpServerIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setAgent(agentToEdit);
    if (agentToEdit) {
      setMcpServerIds(agentToEdit.mcp_servers?.map((s) => s.id) || []);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agent) return;
    if (isSaving) return;
    setIsSaving(true);
    try {
      await updateAgent({ ...agent, mcp_server_ids: mcpServerIds });
      onClose();
    } catch (error) {
      console.error("Failed to update agent:", error);
      alert("保存失败，请稍后重试。");
    } finally {
      setIsSaving(false);
    }
  };

  if (!agent) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit ${agent.name}`}>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Update the details for your agent.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <Field>
          <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Name
          </Label>
          <Input
            name="name"
            value={agent.name}
            onChange={handleChange}
            placeholder="e.g., Research Assistant"
            required
          />
        </Field>
        <Field>
          <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Description
          </Label>
          <textarea
            name="description"
            value={agent.description}
            onChange={handleChange}
            placeholder="A brief description of the agent's purpose"
            className="w-full rounded-sm border-neutral-300 bg-neutral-100 px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-indigo-500 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500"
          />
        </Field>
        <Field>
          <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            System Prompt
          </Label>
          <textarea
            name="prompt"
            value={agent.prompt}
            onChange={handleChange}
            placeholder="Define the agent's behavior and personality"
            rows={4}
            className="w-full rounded-sm border-neutral-300 bg-neutral-100 px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-indigo-500 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500"
          />
        </Field>
        <Field>
          <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Connected MCP Servers
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
                  No MCP servers available.
                </p>
                <Button
                  type="button"
                  onClick={() => {
                    onClose(); // Close current modal
                    openAddMcpServerModal(); // Open add server modal
                  }}
                  className="mt-2 inline-flex items-center gap-2 rounded-sm bg-indigo-100 py-1.5 px-3 text-sm/6 font-semibold text-indigo-600 focus:outline-none data-[hover]:bg-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-300 dark:data-[hover]:bg-indigo-900"
                >
                  <PlusIcon className="h-4 w-4" />
                  Create MCP Server
                </Button>
              </div>
            )}
          </div>
        </Field>
        <div className="mt-6 flex justify-end gap-4">
          <Button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-sm bg-neutral-100 py-1.5 px-3 text-sm/6 font-semibold text-neutral-700 shadow-sm focus:outline-none data-[hover]:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:data-[hover]:bg-neutral-700"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSaving}
            className={`inline-flex items-center gap-2 rounded-sm py-1.5 px-3 text-sm/6 font-semibold shadow-inner shadow-white/10 focus:outline-none ${
              isSaving
                ? "bg-indigo-400 text-white cursor-not-allowed dark:bg-indigo-700"
                : "bg-indigo-600 text-white data-[hover]:bg-indigo-500 data-[open]:bg-indigo-700 data-[focus]:outline-1 data-[focus]:outline-white dark:bg-indigo-500 dark:data-[hover]:bg-indigo-400"
            }`}
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default EditAgentModal;

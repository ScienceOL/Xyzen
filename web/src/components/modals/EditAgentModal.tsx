import { Modal } from "@/components/animate-ui/primitives/headless/modal";
import { Input } from "@/components/base/Input";
import { AvatarEditor } from "@/components/shared/AvatarEditor";
import { useXyzen } from "@/store";
import type { Agent } from "@/types/agents";
import { Button, Field, Label } from "@headlessui/react";
import { PlusIcon, SparklesIcon } from "@heroicons/react/24/outline";
import React, { useEffect, useState } from "react";
import { McpServerItem } from "./McpServerItem";
import PublishAgentModal from "@/components/features/PublishAgentModal";

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
  const [showPublishModal, setShowPublishModal] = useState(false);

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
      <div className="max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Update the details for your agent.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Avatar Section */}
          <Field>
            <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Avatar
            </Label>
            <div className="mt-1">
              <AvatarEditor
                avatarName={agent.avatar ?? "smirk"}
                avatarBackgroundColor={
                  agent.avatar_background_color ?? undefined
                }
                onAvatarChange={(value) =>
                  setAgent({ ...agent, avatar: value })
                }
                onBackgroundColorChange={(color) =>
                  setAgent({ ...agent, avatar_background_color: color })
                }
              />
            </div>
          </Field>

          {/* Background Color Section */}
          <Field>
            <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Background Color
            </Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                { id: "white", name: "白色", color: "#ffffff" },
                { id: "black", name: "黑色", color: "#000000" },
                { id: "pink", name: "粉色", color: "#ec4899" },
                { id: "red", name: "红色", color: "#ef4444" },
                { id: "yellow", name: "黄色", color: "#eab308" },
                { id: "green", name: "绿色", color: "#22c55e" },
                { id: "teal", name: "青色", color: "#14b8a6" },
                { id: "cyan", name: "青蓝", color: "#06b6d4" },
                {
                  id: "gradient-sunset",
                  name: "夕阳",
                  gradientStart: "#f97316",
                  gradientEnd: "#f43f5e",
                },
                {
                  id: "gradient-ocean",
                  name: "海洋",
                  gradientStart: "#0ea5e9",
                  gradientEnd: "#3b82f6",
                },
                {
                  id: "gradient-forest",
                  name: "森林",
                  gradientStart: "#10b981",
                  gradientEnd: "#059669",
                },
                {
                  id: "gradient-royal",
                  name: "皇家",
                  gradientStart: "#a855f7",
                  gradientEnd: "#7c3aed",
                },
              ].map((bgColor) => (
                <button
                  type="button"
                  key={bgColor.id}
                  onClick={() => {
                    const colorValue =
                      "gradientEnd" in bgColor
                        ? `linear-gradient(135deg, ${bgColor.gradientStart}, ${bgColor.gradientEnd})`
                        : bgColor.color;
                    setAgent({
                      ...agent,
                      avatar_background_color: colorValue,
                    });
                  }}
                  className={`h-10 w-10 rounded-full ring-2 transition-all ${
                    agent.avatar_background_color?.includes(
                      "gradientStart" in bgColor
                        ? bgColor.gradientStart!
                        : bgColor.color,
                    )
                      ? "ring-blue-500 ring-offset-2 scale-110"
                      : "ring-neutral-300 hover:scale-105 dark:ring-neutral-600"
                  }`}
                  style={{
                    background:
                      "gradientEnd" in bgColor
                        ? `linear-gradient(135deg, ${bgColor.gradientStart}, ${bgColor.gradientEnd})`
                        : bgColor.color,
                  }}
                  title={bgColor.name}
                  aria-label={`选择 ${bgColor.name} 背景色`}
                />
              ))}
            </div>
          </Field>

          {/* Name Section */}
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
              className="mt-1"
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
        </Field>
        <div className="mt-6 flex justify-between">
          <Button
            type="button"
            onClick={() => setShowPublishModal(true)}
            disabled={!agent.prompt}
            className="inline-flex items-center gap-2 rounded-sm bg-purple-100 py-1.5 px-3 text-sm/6 font-semibold text-purple-700 shadow-sm focus:outline-none data-[hover]:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-purple-900/30 dark:text-purple-300 dark:data-[hover]:bg-purple-900/50"
            title={
              !agent.prompt
                ? "Add a prompt before publishing"
                : "Publish to Marketplace"
            }
          >
            <SparklesIcon className="h-4 w-4" />
            Publish to Marketplace
          </Button>
          <div className="flex gap-3">
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

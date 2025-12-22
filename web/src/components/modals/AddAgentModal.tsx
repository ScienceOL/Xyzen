import { Modal } from "@/components/animate-ui/primitives/headless/modal";
import { Input } from "@/components/base/Input";
import { useXyzen } from "@/store";
import type { Agent } from "@/types/agents";
import { Button, Field, Label } from "@headlessui/react";
import { PlusIcon } from "@heroicons/react/24/outline";
import React, { useEffect, useState } from "react";
import { McpServerItem } from "./McpServerItem";

interface AddAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function AddAgentModal({ isOpen, onClose }: AddAgentModalProps) {
  const {
    createAgent,
    isCreatingAgent,
    mcpServers,
    fetchMcpServers,
    openAddMcpServerModal,
  } = useXyzen();

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

  // Fetch MCP servers when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchMcpServers();
    }
  }, [isOpen, fetchMcpServers]);

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

  const buildAgentPayload = () => ({
    ...agent,
    mcp_server_ids: mcpServerIds,
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
      if (!agent.name) {
        alert("助手名称不能为空");
        return;
      }
      await createAgent(buildAgentPayload());
      handleClose();
    } catch (error) {
      console.error("Failed to create agent:", error);
      alert("创建助手失败，请查看控制台获取更多信息。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitDisabled = isSubmitting || isCreatingAgent || !agent.name;
  const submitLabel =
    isSubmitting || isCreatingAgent ? "创建中..." : "创建助手";

  const handleClose = () => {
    setAgent({
      name: "",
      description: "",
      prompt: "",
    });
    setMcpServerIds([]);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="创建助手">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        创建一个新的 AI 助手，可以配置专属提示词和工具。
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <Field>
          <Label className="text-sm/6 font-medium text-neutral-700 dark:text-white">
            助手名称 *
          </Label>
          <Input
            name="name"
            value={agent.name}
            onChange={handleChange}
            placeholder="例如：我的研究助手"
            className="mt-1"
            required
          />
        </Field>

        <Field>
          <Label className="text-sm/6 font-medium text-neutral-700 dark:text-white">
            描述
          </Label>
          <Input
            name="description"
            value={agent.description}
            onChange={handleChange}
            placeholder="简短描述助手的用途"
            className="mt-1"
          />
        </Field>

        <Field>
          <Label className="text-sm/6 font-medium text-neutral-700 dark:text-white">
            系统提示词
          </Label>
          <textarea
            name="prompt"
            value={agent.prompt}
            onChange={handleChange}
            placeholder="定义助手的行为和知识范围"
            rows={4}
            className="mt-1 block w-full rounded-sm border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400"
          />
        </Field>

        <Field>
          <Label className="text-sm/6 font-medium text-neutral-700 dark:text-white">
            MCP 工具服务器
          </Label>
          <div className="mt-2 space-y-2">
            {mcpServers.length === 0 ? (
              <div className="rounded-sm border border-dashed border-neutral-300 bg-neutral-50 p-4 text-center dark:border-neutral-700 dark:bg-neutral-800/50">
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  暂无可用的 MCP 服务器
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
                  创建 MCP 服务器
                </Button>
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-2 rounded-sm border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-800">
                {mcpServers.map((server) => (
                  <McpServerItem
                    key={server.id}
                    mcp={server}
                    isSelected={mcpServerIds.includes(server.id)}
                    onSelectionChange={() => handleMcpServerChange(server.id)}
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
                  创建 MCP 服务器
                </Button>
              </div>
            )}
          </div>
        </Field>

        <div className="mt-6 flex justify-end gap-4">
          <Button
            type="button"
            onClick={handleClose}
            className="inline-flex items-center gap-2 rounded-sm bg-neutral-100 py-1.5 px-3 text-sm/6 font-semibold text-neutral-700 shadow-sm focus:outline-none data-[hover]:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:data-[hover]:bg-neutral-700"
          >
            取消
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
    </Modal>
  );
}

export default AddAgentModal;

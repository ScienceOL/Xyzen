import { Modal } from "@/components/animate-ui/primitives/headless/modal";
import { Input } from "@/components/base/Input";
import { AvatarEditor } from "@/components/shared/AvatarEditor";
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
  const [mode, setMode] = useState<"create" | "add">("create");

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
    <Modal isOpen={isOpen} onClose={handleClose} title="添加助手">
      <div className="max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          创建普通助手或从 Agent Explorer 中添加图形助手到您的侧边栏。
        </p>

        {/* Mode Selection */}
        <div className="mt-4 flex gap-2 border-b border-neutral-200 dark:border-neutral-700">
          <button
            type="button"
            onClick={() => setMode("create")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              mode === "create"
                ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
            }`}
          >
            💬 创建普通助手
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Create Mode - Regular Agent Only */}

          {/* Avatar Section */}
          <Field>
            <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              头像选择
            </Label>
            <div className="mt-1">
              <AvatarEditor
                avatarName={agent.avatar ?? undefined}
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
              背景颜色
            </Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                {
                  id: "white",
                  color: "#ffffff",
                  border: "border-neutral-300",
                },
                { id: "black", color: "#000000" },
                { id: "pink", color: "#ec4899" },
                { id: "red", color: "#ef4444" },
                { id: "yellow", color: "#fbbf24" },
                { id: "green", color: "#10b981" },
                { id: "cyan", color: "#06b6d4" },
                { id: "sky", color: "#0ea5e9" },
                { id: "orange", color: "#f97316" },
                { id: "blue", color: "#3b82f6" },
                { id: "emerald", color: "#10b981" },
                { id: "purple", color: "#a855f7" },
              ].map((bgColor) => (
                <button
                  key={bgColor.id}
                  type="button"
                  className={`h-8 w-8 rounded-full border-2 transition-all ${
                    agent.avatar_background_color === bgColor.color
                      ? "border-blue-500"
                      : bgColor.border || "border-neutral-300"
                  }`}
                  style={{ backgroundColor: bgColor.color }}
                  onClick={() =>
                    setAgent({
                      ...agent,
                      avatar_background_color: bgColor.color,
                    })
                  }
                  title={bgColor.id}
                />
              ))}
            </div>
          </Field>

          {/* Name Section */}
          <Field>
            <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              名称
            </Label>
            <Input
              name="name"
              value={agent.name}
              onChange={handleChange}
              placeholder="例如：研究助手"
              required
            />
          </Field>

          <Field>
            <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              描述
            </Label>
            <textarea
              name="description"
              value={agent.description}
              onChange={handleChange}
              placeholder="助手的目的简要描述"
              className="w-full rounded-sm border-neutral-300 bg-neutral-100 px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-indigo-500 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500"
            />
          </Field>

          <Field>
            <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              系统提示
            </Label>
            <textarea
              name="prompt"
              value={agent.prompt}
              onChange={handleChange}
              placeholder="定义助手的行为和个性"
              rows={4}
              className="w-full rounded-sm border-neutral-300 bg-neutral-100 px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-indigo-500 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500"
            />
          </Field>

          <Field>
            <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              连接的 MCP 服务器
            </Label>
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto custom-scrollbar rounded-sm border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-800/50">
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
                  {/*TODO: Tag 2*/}
                  <Button
                    type="button"
                    onClick={() => {
                      handleClose(); // Close current modal with cleanup
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
      </div>
    </Modal>
  );
}

export default AddAgentModal;

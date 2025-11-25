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
    fetchAgents,
    isCreatingAgent,
    agents,
    addGraphAgentToSidebar,
    hiddenGraphAgentIds,
    mcpServers,
    fetchMcpServers,
    openAddMcpServerModal,
    publishedAgents,
    officialAgents,
    fetchPublishedGraphAgents,
    fetchOfficialGraphAgents,
  } = useXyzen();
  const [mode, setMode] = useState<"create" | "add">("create");
  const [selectedExistingAgent, setSelectedExistingAgent] =
    useState<Agent | null>(null);
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
    agent_type: "regular" as const,
  });
  const [mcpServerIds, setMcpServerIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Combine user's own + published + official agents (similar to main AgentExplorer)
  const availableGraphAgents = React.useMemo(() => {
    const agentMap = new Map<string, Agent>();

    // Add user's own graph agents
    agents.forEach((agent) => {
      if (agent.agent_type === "graph" && agent.id !== "default-chat") {
        agentMap.set(agent.id, agent);
      }
    });

    // Add published graph agents
    publishedAgents.forEach((agent) => {
      if (agent.agent_type === "graph" && agent.id !== "default-chat") {
        agentMap.set(agent.id, agent);
      }
    });

    // Add official graph agents
    officialAgents.forEach((agent) => {
      if (agent.agent_type === "graph" && agent.id !== "default-chat") {
        agentMap.set(agent.id, agent);
      }
    });

    return Array.from(agentMap.values()).sort((a, b) => {
      // Sort by: official first, then published, then user's own
      if (a.is_official && !b.is_official) return -1;
      if (!a.is_official && b.is_official) return 1;
      if (a.is_published && !b.is_published) return -1;
      if (!a.is_published && b.is_published) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [agents, publishedAgents, officialAgents]);

  // Fetch all agent data when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchAgents();
      fetchPublishedGraphAgents();
      fetchOfficialGraphAgents();
      fetchMcpServers();
    }
  }, [
    isOpen,
    fetchAgents,
    fetchPublishedGraphAgents,
    fetchOfficialGraphAgents,
    fetchMcpServers,
  ]);

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
    user_id: "temp", // TODO: 应该由后端从认证token中获取
    mcp_servers: [], // 后端会自动处理关联
    created_at: new Date().toISOString(), // Will be overridden by backend
    updated_at: new Date().toISOString(), // Will be overridden by backend
  });
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      if (mode === "add") {
        if (!selectedExistingAgent) {
          alert("请选择要添加的助手");
          return;
        }
        addGraphAgentToSidebar(selectedExistingAgent.id);
        return;
      } else {
        if (!agent.name) {
          alert("助手名称不能为空");
          return;
        }
        await createAgent(buildAgentPayload());
      }
      handleClose();
    } catch (error) {
      console.error("Failed to create agent:", error);
      alert("创建助手失败，请查看控制台获取更多信息。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isAddDisabled =
    !selectedExistingAgent ||
    (agents.some((a) => a.id === selectedExistingAgent.id) &&
      !hiddenGraphAgentIds.includes(selectedExistingAgent.id));

  const isCreateDisabled = !agent.name;

  const submitDisabled =
    isSubmitting ||
    isCreatingAgent ||
    (mode === "add" ? isAddDisabled : isCreateDisabled);
  const submitLabel =
    mode === "add"
      ? selectedExistingAgent
        ? isAddDisabled
          ? `${selectedExistingAgent.name} - Already Added`
          : `Add ${selectedExistingAgent.name}`
        : "Select Agent"
      : isSubmitting || isCreatingAgent
        ? "创建中..."
        : "创建普通助手";

  const handleClose = () => {
    setMode("create");
    setAgent({
      name: "",
      description: "",
      prompt: "",
      agent_type: "regular" as const,
    });
    setSelectedExistingAgent(null);
    setMcpServerIds([]);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="添加助手">
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
        <button
          type="button"
          onClick={() => setMode("add")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            mode === "add"
              ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
              : "border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
          }`}
        >
          📊 Agent Explorer
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {mode === "create" ? (
          <>
            {/* Create Mode - Regular Agent Only */}

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
          </>
        ) : (
          <>
            {/* Agent Explorer Mode */}
            <div className="space-y-4">
              {availableGraphAgents.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-neutral-500 dark:text-neutral-400">
                    No Published Graph Agents Available
                  </p>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                    Published graph agents from the community and official
                    agents will appear here
                  </p>
                  <button
                    type="button"
                    onClick={() => setMode("create")}
                    className="mt-3 text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 text-sm"
                  >
                    Create Regular Agent Instead
                  </button>
                </div>
              ) : (
                <div>
                  <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">
                    📊 Published Graph Agents
                  </h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {availableGraphAgents.map((agent) => (
                      <div
                        key={agent.id}
                        onClick={() => setSelectedExistingAgent(agent)}
                        className={`p-3 rounded-sm border cursor-pointer transition-colors ${
                          selectedExistingAgent?.id === agent.id
                            ? "border-indigo-200 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-900/20"
                            : "border-neutral-200 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">
                                {agent.name}
                              </h4>
                              {agent.is_official && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 font-medium">
                                  ✓ Official
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-2">
                              {agent.description}
                            </p>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              {/*<span className="text-xs text-indigo-600 dark:text-indigo-400">
                                {agent.node_count || 0} 节点
                              </span>
                              <span className="text-xs text-indigo-600 dark:text-indigo-400">
                                {agent.edge_count || 0} 边
                              </span>*/}
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded ${
                                  agent.is_active
                                    ? "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300"
                                    : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300"
                                }`}
                              >
                                {agent.is_active ? "Ready" : "Building"}
                              </span>
                              {/* Show "已添加" only if agent is actually in the sidebar (in main agents list) */}
                              {agents.some((a) => a.id === agent.id) &&
                                !hiddenGraphAgentIds.includes(agent.id) && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300">
                                    已添加
                                  </span>
                                )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

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

import { Input } from "@/components/base/Input";
import { Modal } from "@/components/base/Modal";
import { useXyzen } from "@/store";
import { Button, Field, Label } from "@headlessui/react";
import { PlusIcon } from "@heroicons/react/24/outline";
import React, { useEffect, useState } from "react";
import type { Agent } from "../layouts/XyzenAgent";
import { McpServerItem } from "./McpServerItem";

interface AddAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AddAgentModal: React.FC<AddAgentModalProps> = ({ isOpen, onClose }) => {
  const {
    createAgent,
    mcpServers,
    builtinMcpServers,
    fetchMcpServers,
    fetchBuiltinMcpServers,
    quickAddBuiltinServer,
    openAddMcpServerModal,
  } = useXyzen();
  const [agent, setAgent] = useState<
    Omit<Agent, "id" | "user_id" | "mcp_servers" | "mcp_server_ids">
  >({
    name: "",
    description: "",
    prompt: "",
  });
  const [mcpServerIds, setMcpServerIds] = useState<string[]>([]);
  const [isAutoAddingDefaultMcp, setIsAutoAddingDefaultMcp] = useState(false);

  // Fetch MCP servers and built-in servers when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchMcpServers();
      fetchBuiltinMcpServers();
    }
  }, [isOpen, fetchMcpServers, fetchBuiltinMcpServers]);

  // Auto-add and select default MCP server (DynamicMCPServer)
  useEffect(() => {
    if (!isOpen || isAutoAddingDefaultMcp) return;

    const autoAddDefaultMcp = async () => {
      // Check if dynamic MCP server already exists in user's servers
      const existingDynamicMcp = mcpServers.find(
        (s) =>
          s.name === "DynamicMCPServer" ||
          s.url.includes("/mcp/dynamic_mcp_server"),
      );

      if (existingDynamicMcp) {
        // Already exists, just select it if not already selected
        if (mcpServerIds.length === 0) {
          setMcpServerIds([existingDynamicMcp.id]);
        }
        return;
      }

      // Check if it's in builtin servers and marked as default
      const defaultBuiltinMcp = builtinMcpServers.find(
        (bs) => bs.is_default && bs.module_name === "dynamic_mcp_server",
      );

      if (defaultBuiltinMcp && !isAutoAddingDefaultMcp) {
        // Auto-add the default MCP server
        setIsAutoAddingDefaultMcp(true);
        try {
          console.log("Auto-adding default Dynamic MCP Server...");
          await quickAddBuiltinServer(defaultBuiltinMcp);

          // After adding, find it in the updated list and select it
          const addedServer = mcpServers.find((s) =>
            s.url.includes("/mcp/dynamic_mcp_server"),
          );
          if (addedServer && mcpServerIds.length === 0) {
            setMcpServerIds([addedServer.id]);
          }
        } catch (error) {
          console.error("Failed to auto-add default MCP server:", error);
        } finally {
          setIsAutoAddingDefaultMcp(false);
        }
      }
    };

    autoAddDefaultMcp();
  }, [
    isOpen,
    mcpServers,
    builtinMcpServers,
    mcpServerIds.length,
    quickAddBuiltinServer,
    isAutoAddingDefaultMcp,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agent.name) {
      alert("助手名称不能为空");
      return;
    }
    try {
      await createAgent({
        ...agent,
        mcp_server_ids: mcpServerIds,
        user_id: "temp", // TODO: 应该由后端从认证token中获取
        mcp_servers: [], // 后端会自动处理关联
      });
      handleClose();
    } catch (error) {
      console.error("Failed to create agent:", error);
      alert("创建助手失败，请查看控制台获取更多信息。");
    }
  };

  const handleClose = () => {
    setAgent({ name: "", description: "", prompt: "" });
    setMcpServerIds([]);
    setIsAutoAddingDefaultMcp(false);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="添加新助手">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        创建一个新的助手来协助您完成任务。
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
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
            className="w-full rounded-md border-neutral-300 bg-neutral-100 px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-indigo-500 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500"
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
            className="w-full rounded-md border-neutral-300 bg-neutral-100 px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-indigo-500 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500"
          />
        </Field>
        <Field>
          <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            连接的 MCP 服务器
          </Label>
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-md border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-800/50">
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
                    handleClose(); // Close current modal with cleanup
                    openAddMcpServerModal(); // Open add server modal
                  }}
                  className="mt-2 inline-flex items-center gap-2 rounded-md bg-indigo-100 py-1.5 px-3 text-sm/6 font-semibold text-indigo-600 focus:outline-none data-[hover]:bg-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-300 dark:data-[hover]:bg-indigo-900"
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
            className="inline-flex items-center gap-2 rounded-md bg-neutral-100 py-1.5 px-3 text-sm/6 font-semibold text-neutral-700 shadow-sm focus:outline-none data-[hover]:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:data-[hover]:bg-neutral-700"
          >
            取消
          </Button>
          <Button
            type="submit"
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 py-1.5 px-3 text-sm/6 font-semibold text-white shadow-inner shadow-white/10 focus:outline-none data-[hover]:bg-indigo-500 data-[open]:bg-indigo-700 data-[focus]:outline-1 data-[focus]:outline-white dark:bg-indigo-500 dark:data-[hover]:bg-indigo-400"
          >
            创建助手
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default AddAgentModal;

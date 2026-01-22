/**
 * MCP Tools Button with interactive Popover
 *
 * Allows users to toggle MCP servers on/off for the current agent.
 */

import McpIcon from "@/assets/McpIcon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Agent } from "@/types/agents";
import type { McpServer } from "@/types/mcp";
import { CheckIcon, Cog6ToothIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface McpInfo {
  agent: Agent;
  servers: McpServer[];
}

interface McpToolsButtonProps {
  mcpInfo: McpInfo;
  allMcpServers: McpServer[];
  agent: Agent;
  onUpdateAgent: (agent: Agent) => Promise<void>;
  onOpenSettings?: () => void;
  buttonClassName?: string;
}

export function McpToolsButton({
  mcpInfo,
  allMcpServers,
  agent,
  onUpdateAgent,
  onOpenSettings,
  buttonClassName,
}: McpToolsButtonProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  const totalTools = mcpInfo.servers.reduce(
    (total, server) => total + (server.tools?.length || 0),
    0,
  );

  // Get connected server IDs from agent
  const connectedServerIds = new Set(
    agent.mcp_server_ids || agent.mcp_servers?.map((s) => s.id) || [],
  );

  // Separate servers into connected and available
  const connectedServers = allMcpServers.filter((server) =>
    connectedServerIds.has(server.id),
  );
  const availableServers = allMcpServers.filter(
    (server) => !connectedServerIds.has(server.id),
  );

  const handleMcpServerToggle = async (serverId: string, connect: boolean) => {
    if (!agent || isUpdating) return;

    setIsUpdating(serverId);
    try {
      const currentIds =
        agent.mcp_server_ids || agent.mcp_servers?.map((s) => s.id) || [];
      const newIds = connect
        ? [...currentIds, serverId]
        : currentIds.filter((id) => id !== serverId);

      await onUpdateAgent({
        ...agent,
        mcp_server_ids: newIds,
      });
    } catch (error) {
      console.error("Failed to update MCP server:", error);
    } finally {
      setIsUpdating(null);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(buttonClassName, "w-auto px-2 gap-1.5")}
          title={t("app.toolbar.mcpTools")}
        >
          <McpIcon className="h-4 w-4" />
          {totalTools > 0 && (
            <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">
              {totalTools}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <div className="space-y-2">
          {/* Header */}
          <div className="px-2 py-1">
            <div className="flex items-center space-x-2">
              <McpIcon className="h-4 w-4 text-indigo-500" />
              <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {t("app.toolbar.mcpTools")}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              {t("app.chat.assistantsTitle")}: {agent.name}
            </div>
          </div>

          {/* Connected Servers Section */}
          {connectedServers.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-neutral-500 dark:text-neutral-400 px-2 py-1">
                {t("app.toolbar.mcpConnected", "Connected")}
              </h4>
              <div className="space-y-0.5">
                {connectedServers.map((server) => (
                  <McpServerToggleItem
                    key={server.id}
                    server={server}
                    isConnected={true}
                    isUpdating={isUpdating === server.id}
                    onToggle={() => handleMcpServerToggle(server.id, false)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Available Servers Section */}
          {availableServers.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-neutral-500 dark:text-neutral-400 px-2 py-1">
                {t("app.toolbar.mcpAvailable", "Available")}
              </h4>
              <div className="space-y-0.5">
                {availableServers.map((server) => (
                  <McpServerToggleItem
                    key={server.id}
                    server={server}
                    isConnected={false}
                    isUpdating={isUpdating === server.id}
                    onToggle={() => handleMcpServerToggle(server.id, true)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {allMcpServers.length === 0 && (
            <div className="px-2 py-4 text-center">
              <div className="text-sm text-neutral-500 dark:text-neutral-400">
                {t("app.toolbar.mcpNoServers", "No MCP servers configured")}
              </div>
              <button
                onClick={() => {
                  setIsOpen(false);
                  onOpenSettings?.();
                }}
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                <Cog6ToothIcon className="h-3.5 w-3.5" />
                {t("app.toolbar.mcpOpenSettings", "Open Settings")}
              </button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Individual MCP server toggle item
 */
interface McpServerToggleItemProps {
  server: McpServer;
  isConnected: boolean;
  isUpdating: boolean;
  onToggle: () => void;
}

function McpServerToggleItem({
  server,
  isConnected,
  isUpdating,
  onToggle,
}: McpServerToggleItemProps) {
  const { t } = useTranslation();
  const isOnline = server.status === "online";
  const isDisabled = !isOnline || isUpdating;

  return (
    <button
      onClick={onToggle}
      disabled={isDisabled}
      className={cn(
        "w-full flex items-center justify-between px-2 py-2 rounded-md transition-colors",
        "hover:bg-neutral-100 dark:hover:bg-neutral-800",
        isConnected && "bg-indigo-50 dark:bg-indigo-900/20",
        isDisabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        {/* Status indicator */}
        <div
          className={cn(
            "h-2 w-2 rounded-full flex-shrink-0",
            isOnline ? "bg-green-500" : "bg-neutral-400",
          )}
        />
        <div className="min-w-0 text-left">
          <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
            {server.name}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {isOnline
              ? `${server.tools?.length || 0} ${t("app.toolbar.mcpToolsCount", "tools")}`
              : t("app.toolbar.mcpOffline", "offline")}
          </div>
        </div>
      </div>
      <div className="flex-shrink-0 ml-2">
        {isUpdating ? (
          <div className="h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        ) : isConnected ? (
          <CheckIcon className="h-4 w-4 text-indigo-500" />
        ) : null}
      </div>
    </button>
  );
}

export default McpToolsButton;

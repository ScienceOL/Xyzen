/**
 * Mobile More Menu
 *
 * A popup menu shown on mobile with tool selector and MCP management.
 */

import McpIcon from "@/assets/McpIcon";
import { cn } from "@/lib/utils";
import type { Agent } from "@/types/agents";
import type { McpServer } from "@/types/mcp";
import {
  CheckIcon,
  ChevronDownIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ToolSelector } from "./ToolSelector";

interface McpInfo {
  agent: Agent;
  servers: McpServer[];
}

interface MobileMoreMenuProps {
  isOpen: boolean;
  agent: Agent | null;
  onUpdateAgent: (agent: Agent) => Promise<void>;
  mcpInfo: McpInfo | null;
  allMcpServers?: McpServer[];
  onOpenSettings?: () => void;
  sessionKnowledgeSetId?: string | null;
  onUpdateSessionKnowledge?: (knowledgeSetId: string | null) => Promise<void>;
}

export function MobileMoreMenu({
  isOpen,
  agent,
  onUpdateAgent,
  mcpInfo,
  allMcpServers = [],
  onOpenSettings,
  sessionKnowledgeSetId,
  onUpdateSessionKnowledge,
}: MobileMoreMenuProps) {
  const { t } = useTranslation();
  const [showMcpList, setShowMcpList] = useState(false);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  const handleUpdateAgent = async (updatedAgent: Agent) => {
    await onUpdateAgent(updatedAgent);
    // Don't close on toggle - let user configure multiple tools
  };

  // Get connected server IDs from agent
  const connectedServerIds = new Set(
    agent?.mcp_server_ids || agent?.mcp_servers?.map((s) => s.id) || [],
  );

  // Separate servers into connected and available
  const connectedServers = allMcpServers.filter((server) =>
    connectedServerIds.has(server.id),
  );
  const availableServers = allMcpServers.filter(
    (server) => !connectedServerIds.has(server.id),
  );

  const totalTools =
    mcpInfo?.servers.reduce(
      (total, server) => total + (server.tools?.length || 0),
      0,
    ) || 0;

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
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="absolute bottom-full left-0 right-0 mx-2 mb-2 z-50 rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-900 p-1.5"
        >
          <div className="flex flex-col gap-1">
            {/* Tool Selector */}
            {agent && (
              <div className="w-full">
                <ToolSelector
                  agent={agent}
                  onUpdateAgent={handleUpdateAgent}
                  hasKnowledgeSet={
                    !!agent.knowledge_set_id || !!sessionKnowledgeSetId
                  }
                  sessionKnowledgeSetId={sessionKnowledgeSetId}
                  onUpdateSessionKnowledge={onUpdateSessionKnowledge}
                />
              </div>
            )}

            {/* MCP Tool Section - Expandable */}
            {agent && (
              <div className="w-full">
                <button
                  onClick={() => setShowMcpList(!showMcpList)}
                  className="w-full px-2.5 py-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs font-medium text-neutral-600 dark:text-neutral-400">
                    <div className="flex items-center gap-1.5">
                      <McpIcon className="h-3.5 w-3.5" />
                      <span>{t("app.toolbar.mcpTools")}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {totalTools > 0 && (
                        <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">
                          {totalTools}
                        </span>
                      )}
                      <ChevronDownIcon
                        className={cn(
                          "h-3 w-3 transition-transform",
                          showMcpList && "rotate-180",
                        )}
                      />
                    </div>
                  </div>
                </button>

                {/* Expandable MCP Server List */}
                <AnimatePresence>
                  {showMcpList && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="ml-2 mt-1 space-y-2 border-l-2 border-indigo-200 dark:border-indigo-800 pl-2">
                        {/* Empty State */}
                        {allMcpServers.length === 0 && (
                          <div className="px-2 py-3 text-center">
                            <div className="text-xs text-neutral-500 dark:text-neutral-400">
                              {t(
                                "app.toolbar.mcpNoServers",
                                "No MCP servers configured",
                              )}
                            </div>
                            <button
                              onClick={() => onOpenSettings?.()}
                              className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                            >
                              <Cog6ToothIcon className="h-3 w-3" />
                              {t(
                                "app.toolbar.mcpOpenSettings",
                                "Open Settings",
                              )}
                            </button>
                          </div>
                        )}

                        {/* Connected Servers */}
                        {connectedServers.length > 0 && (
                          <div>
                            <div className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 px-2 py-0.5">
                              {t("app.toolbar.mcpConnected", "Connected")}
                            </div>
                            <div className="space-y-0.5">
                              {connectedServers.map((server) => (
                                <MobileMcpServerItem
                                  key={server.id}
                                  server={server}
                                  isConnected={true}
                                  isUpdating={isUpdating === server.id}
                                  onToggle={() =>
                                    handleMcpServerToggle(server.id, false)
                                  }
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Available Servers */}
                        {availableServers.length > 0 && (
                          <div>
                            <div className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 px-2 py-0.5">
                              {t("app.toolbar.mcpAvailable", "Available")}
                            </div>
                            <div className="space-y-0.5">
                              {availableServers.map((server) => (
                                <MobileMcpServerItem
                                  key={server.id}
                                  server={server}
                                  isConnected={false}
                                  isUpdating={isUpdating === server.id}
                                  onToggle={() =>
                                    handleMcpServerToggle(server.id, true)
                                  }
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Mobile MCP Server toggle item
 */
interface MobileMcpServerItemProps {
  server: McpServer;
  isConnected: boolean;
  isUpdating: boolean;
  onToggle: () => void;
}

function MobileMcpServerItem({
  server,
  isConnected,
  isUpdating,
  onToggle,
}: MobileMcpServerItemProps) {
  const { t } = useTranslation();
  const isOnline = server.status === "online";
  const isDisabled = !isOnline || isUpdating;

  return (
    <button
      onClick={onToggle}
      disabled={isDisabled}
      className={cn(
        "w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors",
        "hover:bg-neutral-100 dark:hover:bg-neutral-800",
        isConnected && "bg-indigo-50 dark:bg-indigo-900/20",
        isDisabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div
          className={cn(
            "h-1.5 w-1.5 rounded-full flex-shrink-0",
            isOnline ? "bg-green-500" : "bg-neutral-400",
          )}
        />
        <div className="min-w-0 text-left">
          <div className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
            {server.name}
          </div>
          <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
            {isOnline
              ? `${server.tools?.length || 0} ${t("app.toolbar.mcpToolsCount", "tools")}`
              : t("app.toolbar.mcpOffline", "offline")}
          </div>
        </div>
      </div>
      <div className="flex-shrink-0 ml-2">
        {isUpdating ? (
          <div className="h-3 w-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        ) : isConnected ? (
          <CheckIcon className="h-3 w-3 text-indigo-500" />
        ) : null}
      </div>
    </button>
  );
}

export default MobileMoreMenu;

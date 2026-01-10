/**
 * MCP Tools Button with hover tooltip
 *
 * Displays connected MCP servers and their available tools.
 */

import McpIcon from "@/assets/McpIcon";
import { cn } from "@/lib/utils";
import type { Agent } from "@/types/agents";
import { useTranslation } from "react-i18next";

interface McpServer {
  id: string;
  name: string;
  status?: string; // "online" | "offline" or other statuses
  tools?: Array<{ name: string }>;
}

interface McpInfo {
  agent: Agent;
  servers: McpServer[];
}

interface McpToolsButtonProps {
  mcpInfo: McpInfo;
  buttonClassName?: string;
}

export function McpToolsButton({
  mcpInfo,
  buttonClassName,
}: McpToolsButtonProps) {
  const { t } = useTranslation();
  const totalTools = mcpInfo.servers.reduce(
    (total, server) => total + (server.tools?.length || 0),
    0,
  );

  return (
    <div className="relative group/mcp w-fit">
      <button
        className={cn(buttonClassName, "w-auto px-2 gap-1.5")}
        title={t("app.toolbar.mcpTools")}
      >
        <McpIcon className="h-4 w-4" />
        {mcpInfo.servers.length > 0 && (
          <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">
            {totalTools}
          </span>
        )}
      </button>

      {/* MCP Tooltip */}
      <div className="transition-opacity overflow-hidden hidden w-80 group-hover/mcp:block absolute bottom-full left-0 mb-2 rounded-sm border border-neutral-200 bg-white p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-800 z-50">
        <McpTooltipContent mcpInfo={mcpInfo} />
        {/* Arrow */}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-white dark:border-t-neutral-800" />
      </div>
    </div>
  );
}

/**
 * MCP Tooltip content component
 */
function McpTooltipContent({ mcpInfo }: { mcpInfo: McpInfo }) {
  const { t } = useTranslation();

  return (
    <>
      <div className="mb-2">
        <div className="flex items-center space-x-2">
          <McpIcon className="h-4 w-4 text-indigo-500" />
          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            {t("app.toolbar.mcpTools")}
          </span>
        </div>
        <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
          {t("app.chat.assistantsTitle")}: {mcpInfo.agent.name}
        </div>
      </div>

      <div className="space-y-2">
        {mcpInfo.servers.map((server) => (
          <McpServerCard key={server.id} server={server} />
        ))}
      </div>
    </>
  );
}

/**
 * Individual MCP server card
 */
function McpServerCard({ server }: { server: McpServer }) {
  return (
    <div className="rounded-sm bg-neutral-50 p-2 dark:bg-neutral-700/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div
            className={`h-2 w-2 rounded-full ${
              server.status === "online" ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            {server.name}
          </span>
        </div>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {server.tools?.length || 0} 工具
        </span>
      </div>

      {server.tools && server.tools.length > 0 && (
        <div className="mt-2">
          <div className="flex flex-wrap gap-1">
            {server.tools.slice(0, 5).map((tool, index) => (
              <span
                key={index}
                className="inline-block rounded bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
              >
                {tool.name}
              </span>
            ))}
            {server.tools.length > 5 && (
              <span className="inline-block rounded bg-neutral-200 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-600 dark:text-neutral-300">
                +{server.tools.length - 5}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default McpToolsButton;

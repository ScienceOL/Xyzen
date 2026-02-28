import type { Agent, AgentWithLayout } from "@/types/agents";
import type { McpServer } from "@/types/mcp";

export interface ToolbarMcpInfo {
  agent: AgentWithLayout;
  servers: McpServer[];
}

export function getConnectedMcpServerIds(
  agent: Pick<Agent, "mcp_server_ids" | "mcp_servers"> | null,
): string[] {
  if (!agent) return [];

  // Prefer explicit ids when present, even when empty.
  if (agent.mcp_server_ids !== undefined) {
    return agent.mcp_server_ids;
  }

  return agent.mcp_servers?.map((server) => server.id) ?? [];
}

export function selectCurrentToolbarAgent(
  agents: AgentWithLayout[],
  activeChatChannel: string | null,
  agentId: string | null,
): AgentWithLayout | null {
  if (!activeChatChannel || !agentId) return null;
  return agents.find((agent) => agent.id === agentId) ?? null;
}

export function selectCurrentToolbarMcpInfo(
  activeChatChannel: string | null,
  agent: AgentWithLayout | null,
  mcpServers: McpServer[],
): ToolbarMcpInfo | null {
  if (!activeChatChannel || !agent) return null;

  const connectedIds = getConnectedMcpServerIds(agent);
  if (connectedIds.length === 0) return null;

  const connectedServerIdSet = new Set(connectedIds);
  const servers = mcpServers.filter((server) =>
    connectedServerIdSet.has(server.id),
  );

  return { agent, servers };
}

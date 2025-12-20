/**
 * Default MCP server mappings for system agents
 * Maps system agent IDs to their default MCP server names
 */

// System Agent IDs (from the codebase)
export const SYSTEM_AGENT_IDS = {
  CHAT: "00000000-0000-0000-0000-000000000001", // 随便聊聊 (Chat Agent)
} as const;

// Default MCP server names for each system agent (confirmed from backend)
export const SYSTEM_AGENT_DEFAULT_MCPS = {
  [SYSTEM_AGENT_IDS.CHAT]: ["DynamicMCPServer"], // 随便聊聊 gets DynamicMCPServer
} as const;

// MCP server name patterns to match against (for finding servers in user's list)
export const MCP_SERVER_PATTERNS = {
  DYNAMIC_MCP: [
    "DynamicMCPServer",
    "dynamic_mcp_server",
    "/mcp/dynamic_mcp_server",
  ],
} as const;

/**
 * Get default MCP server names for a system agent
 */
export function getDefaultMcpsForSystemAgent(agentId: string): string[] {
  const defaultMcps =
    SYSTEM_AGENT_DEFAULT_MCPS[
      agentId as keyof typeof SYSTEM_AGENT_DEFAULT_MCPS
    ];
  return defaultMcps ? [...defaultMcps] : [];
}

/**
 * Check if an agent is a system agent that should have default MCPs
 */
export function isSystemAgentWithDefaultMcps(agentId: string): boolean {
  return Object.values(SYSTEM_AGENT_IDS).includes(
    agentId as (typeof SYSTEM_AGENT_IDS)[keyof typeof SYSTEM_AGENT_IDS],
  );
}

/**
 * Find MCP server IDs from user's MCP servers list by matching name patterns
 */
export function findMcpServerIdsByNames(
  mcpServers: Array<{ id: string; name: string; url?: string }>,
  targetNames: string[],
): string[] {
  const foundIds: string[] = [];

  for (const targetName of targetNames) {
    // Get patterns for this target name
    let patterns: string[] = [];
    if (targetName === "DynamicMCPServer") {
      patterns = [...MCP_SERVER_PATTERNS.DYNAMIC_MCP];
    } else {
      patterns = [targetName]; // Fallback to exact match
    }

    // Find matching server
    const matchingServer = mcpServers.find((server) =>
      patterns.some(
        (pattern) =>
          server.name === pattern ||
          server.name.includes(pattern) ||
          (server.url && server.url.includes(pattern)),
      ),
    );

    if (matchingServer) {
      foundIds.push(matchingServer.id);
    }
  }

  return foundIds;
}

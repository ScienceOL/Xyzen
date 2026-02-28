import type { AgentWithLayout } from "@/types/agents";
import type { McpServer } from "@/types/mcp";
import { describe, expect, it } from "vitest";

import {
  getConnectedMcpServerIds,
  selectCurrentToolbarAgent,
  selectCurrentToolbarMcpInfo,
} from "../toolbarSelectors";

function makeAgent(overrides: Partial<AgentWithLayout> = {}): AgentWithLayout {
  return {
    id: "agent-1",
    name: "Agent One",
    description: "test agent",
    user_id: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    spatial_layout: {
      position: { x: 0, y: 0 },
    },
    ...overrides,
  };
}

function makeMcpServer(
  id: string,
  overrides: Partial<McpServer> = {},
): McpServer {
  return {
    id,
    name: `Server ${id}`,
    description: `Server ${id}`,
    url: `https://example.com/${id}`,
    token: "token",
    status: "online",
    tools: [],
    user_id: "user-1",
    ...overrides,
  };
}

describe("toolbarSelectors", () => {
  describe("getConnectedMcpServerIds", () => {
    it("prefers mcp_server_ids when present", () => {
      const agent = makeAgent({
        mcp_server_ids: ["mcp-1", "mcp-2"],
        mcp_servers: [{ id: "legacy", name: "Legacy", description: "Legacy" }],
      });

      expect(getConnectedMcpServerIds(agent)).toEqual(["mcp-1", "mcp-2"]);
    });

    it("does not fall back when mcp_server_ids is an empty array", () => {
      const agent = makeAgent({
        mcp_server_ids: [],
        mcp_servers: [{ id: "legacy", name: "Legacy", description: "Legacy" }],
      });

      expect(getConnectedMcpServerIds(agent)).toEqual([]);
    });

    it("falls back to legacy mcp_servers ids when mcp_server_ids is missing", () => {
      const agent = makeAgent({
        mcp_servers: [
          { id: "legacy-1", name: "Legacy 1", description: "Legacy 1" },
          { id: "legacy-2", name: "Legacy 2", description: "Legacy 2" },
        ],
      });

      expect(getConnectedMcpServerIds(agent)).toEqual(["legacy-1", "legacy-2"]);
    });
  });

  describe("selectCurrentToolbarAgent", () => {
    it("returns null when no active chat channel", () => {
      const agent = makeAgent();
      expect(selectCurrentToolbarAgent([agent], null, agent.id)).toBeNull();
    });

    it("returns latest agent object from updated agents list", () => {
      const oldAgent = makeAgent({
        graph_config: { graph: { nodes: [] } },
      });
      const updatedAgent = makeAgent({
        graph_config: {
          graph: { nodes: [{ id: "agent", kind: "llm", config: {} }] },
        },
      });

      const current = selectCurrentToolbarAgent(
        [updatedAgent],
        "channel-1",
        oldAgent.id,
      );

      expect(current).toBe(updatedAgent);
      expect(current?.graph_config).toEqual(updatedAgent.graph_config);
    });
  });

  describe("selectCurrentToolbarMcpInfo", () => {
    it("returns null when there are no connected MCP ids", () => {
      const agent = makeAgent({ mcp_server_ids: [] });
      const mcpInfo = selectCurrentToolbarMcpInfo("channel-1", agent, [
        makeMcpServer("mcp-1"),
      ]);

      expect(mcpInfo).toBeNull();
    });

    it("filters servers by connected ids", () => {
      const agent = makeAgent({ mcp_server_ids: ["mcp-2"] });
      const mcpInfo = selectCurrentToolbarMcpInfo("channel-1", agent, [
        makeMcpServer("mcp-1"),
        makeMcpServer("mcp-2"),
      ]);

      expect(mcpInfo).not.toBeNull();
      expect(mcpInfo?.agent.id).toBe("agent-1");
      expect(mcpInfo?.servers.map((server) => server.id)).toEqual(["mcp-2"]);
    });
  });
});

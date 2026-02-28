import type { AgentWithLayout } from "@/types/agents";
import type { McpServer } from "@/types/mcp";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";

import { useToolbarState } from "../useToolbarState";

const useXyzenMock = vi.fn();
const useActiveChannelStatusMock = vi.fn();
const useSubscriptionInfoMock = vi.fn();
const useIsMobileMock = vi.fn();

vi.mock("@/store", () => ({
  useXyzen: (selector?: (state: unknown) => unknown) =>
    useXyzenMock(selector),
}));

vi.mock("@/hooks/useChannelSelectors", () => ({
  useActiveChannelStatus: () => useActiveChannelStatusMock(),
}));

vi.mock("@/hooks/ee", () => ({
  useSubscriptionInfo: () => useSubscriptionInfoMock(),
}));

vi.mock("@/hooks/useMediaQuery", () => ({
  useIsMobile: () => useIsMobileMock(),
}));

type MockStoreState = {
  createDefaultChannel: Mock;
  fetchAgents: Mock;
  updateSessionConfig: Mock;
  updateAgent: Mock;
  openSettingsModal: Mock;
  agents: AgentWithLayout[];
  mcpServers: McpServer[];
  uploadedFiles: unknown[];
  isUploading: boolean;
};

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

function makeMcpServer(id: string): McpServer {
  return {
    id,
    name: `Server ${id}`,
    description: `Server ${id}`,
    url: `https://example.com/${id}`,
    token: "token",
    status: "online",
    tools: [],
    user_id: "user-1",
  };
}

describe("useToolbarState", () => {
  let storeState: MockStoreState;
  let container: HTMLDivElement;
  let root: Root;
  let latest: ReturnType<typeof useToolbarState> | null;

  function HookHarness() {
    latest = useToolbarState();
    return null;
  }

  const renderHarness = () => {
    act(() => {
      root.render(<HookHarness />);
    });
  };

  beforeEach(() => {
    latest = null;
    container = document.createElement("div");
    root = createRoot(container);

    storeState = {
      createDefaultChannel: vi.fn(),
      fetchAgents: vi.fn(),
      updateSessionConfig: vi.fn(),
      updateAgent: vi.fn(),
      openSettingsModal: vi.fn(),
      agents: [],
      mcpServers: [],
      uploadedFiles: [],
      isUploading: false,
    };

    useXyzenMock.mockImplementation(
      (selector?: (state: MockStoreState) => unknown) =>
        selector ? selector(storeState) : storeState,
    );

    useActiveChannelStatusMock.mockReturnValue({
      channelId: "channel-1",
      agentId: "agent-1",
      model_tier: "lite",
      sessionId: "session-1",
      knowledge_set_id: null,
    });

    useSubscriptionInfoMock.mockReturnValue({
      maxTier: "lite",
      userPlan: "free",
    });
    useIsMobileMock.mockReturnValue(false);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
  });

  it("reflects updated agent immediately when store agents change", () => {
    const initialAgent = makeAgent({
      graph_config: { graph: { nodes: [{ id: "agent", kind: "llm" }] } },
    });
    const updatedAgent = makeAgent({
      graph_config: {
        graph: { nodes: [{ id: "agent", kind: "llm", config: { foo: 1 } }] },
      },
    });
    storeState.agents = [initialAgent];

    renderHarness();
    expect(latest?.currentAgent?.graph_config).toEqual(initialAgent.graph_config);

    storeState.agents = [updatedAgent];
    renderHarness();

    expect(latest?.currentAgent).toBe(updatedAgent);
    expect(latest?.currentAgent?.graph_config).toEqual(updatedAgent.graph_config);
  });

  it("reflects rollback when agent update is reverted in store", () => {
    const previousAgent = makeAgent({
      graph_config: { graph: { nodes: [{ id: "agent", kind: "llm" }] } },
    });
    const optimisticAgent = makeAgent({
      graph_config: {
        graph: { nodes: [{ id: "agent", kind: "llm", config: { optimistic: true } }] },
      },
    });

    storeState.agents = [previousAgent];
    renderHarness();
    expect(latest?.currentAgent?.graph_config).toEqual(previousAgent.graph_config);

    storeState.agents = [optimisticAgent];
    renderHarness();
    expect(latest?.currentAgent?.graph_config).toEqual(optimisticAgent.graph_config);

    storeState.agents = [previousAgent];
    renderHarness();
    expect(latest?.currentAgent).toBe(previousAgent);
    expect(latest?.currentAgent?.graph_config).toEqual(previousAgent.graph_config);
  });

  it("uses mcp_server_ids precedence for currentMcpInfo inside hook", () => {
    const legacyAgent = makeAgent({
      mcp_servers: [
        { id: "mcp-legacy", name: "Legacy", description: "Legacy server" },
      ],
    });

    storeState.agents = [legacyAgent];
    storeState.mcpServers = [makeMcpServer("mcp-legacy"), makeMcpServer("mcp-2")];
    renderHarness();

    expect(latest?.currentMcpInfo?.servers.map((s) => s.id)).toEqual([
      "mcp-legacy",
    ]);

    const explicitIdsAgent = makeAgent({
      mcp_server_ids: [],
      mcp_servers: [
        { id: "mcp-legacy", name: "Legacy", description: "Legacy server" },
      ],
    });
    storeState.agents = [explicitIdsAgent];
    renderHarness();

    expect(latest?.currentMcpInfo).toBeNull();
  });
});

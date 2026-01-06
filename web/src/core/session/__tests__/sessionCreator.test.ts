/**
 * Tests for sessionCreator module
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createChannelFromSession,
  createHistoryItemFromSession,
  resolveProviderAndModel,
  buildSessionPayload,
} from "../sessionCreator";
import type {
  SessionResponse,
  TopicResponse,
  AgentSessionInfo,
} from "../types";

// Mock the providerCore module
vi.mock("@/core/provider", () => ({
  providerCore: {
    getDefaultProviderAndModel: vi.fn().mockResolvedValue({
      providerId: "default-provider-id",
      model: "default-model",
    }),
  },
}));

// Mock authService
vi.mock("@/service/authService", () => ({
  authService: {
    getToken: vi.fn().mockReturnValue("test-token"),
  },
}));

describe("createChannelFromSession", () => {
  const mockSession: SessionResponse = {
    id: "session-123",
    name: "Test Session",
    agent_id: "agent-456",
    user_id: "user-789",
    provider_id: "provider-001",
    model: "gpt-4",
    google_search_enabled: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };

  const mockTopic: TopicResponse = {
    id: "topic-111",
    name: "Test Topic",
    session_id: "session-123",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };

  it("creates a channel with correct properties", () => {
    const channel = createChannelFromSession(mockSession, mockTopic);

    expect(channel.id).toBe("topic-111");
    expect(channel.sessionId).toBe("session-123");
    expect(channel.title).toBe("Test Topic");
    expect(channel.agentId).toBe("agent-456");
    expect(channel.provider_id).toBe("provider-001");
    expect(channel.model).toBe("gpt-4");
    expect(channel.google_search_enabled).toBe(true);
    expect(channel.connected).toBe(false);
    expect(channel.error).toBeNull();
    expect(channel.messages).toEqual([]);
  });

  it("handles session without provider/model", () => {
    const sessionWithoutProvider: SessionResponse = {
      ...mockSession,
      provider_id: undefined,
      model: undefined,
    };

    const channel = createChannelFromSession(sessionWithoutProvider, mockTopic);

    expect(channel.provider_id).toBeUndefined();
    expect(channel.model).toBeUndefined();
  });
});

describe("createHistoryItemFromSession", () => {
  const mockSession: SessionResponse = {
    id: "session-123",
    name: "Test Session",
    agent_id: "agent-456",
    user_id: "user-789",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T12:00:00Z",
  };

  const mockTopic: TopicResponse = {
    id: "topic-111",
    name: "Test Topic",
    session_id: "session-123",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T12:00:00Z",
  };

  it("creates a history item with correct properties", () => {
    const historyItem = createHistoryItemFromSession(
      mockSession,
      mockTopic,
      "Test Agent",
    );

    expect(historyItem.id).toBe("topic-111");
    expect(historyItem.sessionId).toBe("session-123");
    expect(historyItem.title).toBe("Test Topic");
    expect(historyItem.updatedAt).toBe("2024-01-01T12:00:00Z");
    expect(historyItem.assistantTitle).toBe("Test Agent");
    expect(historyItem.lastMessage).toBe("");
    expect(historyItem.isPinned).toBe(false);
  });

  it("uses default assistant name when not provided", () => {
    const historyItem = createHistoryItemFromSession(mockSession, mockTopic);

    expect(historyItem.assistantTitle).toBe("Assistant");
  });
});

describe("resolveProviderAndModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns agent provider/model when available", async () => {
    const agent: AgentSessionInfo = {
      id: "agent-1",
      provider_id: "agent-provider",
      model: "agent-model",
    };

    const result = await resolveProviderAndModel(agent, []);

    expect(result.providerId).toBe("agent-provider");
    expect(result.model).toBe("agent-model");
  });

  it("falls back to system default when agent has no provider", async () => {
    const agent: AgentSessionInfo = {
      id: "agent-1",
      provider_id: null,
      model: null,
    };

    const mockProviders = [
      { id: "p1", provider_type: "openai", is_system: true },
    ];

    const result = await resolveProviderAndModel(agent, mockProviders);

    // Uses mocked default values
    expect(result.providerId).toBe("default-provider-id");
    expect(result.model).toBe("default-model");
  });

  it("handles null agent", async () => {
    const mockProviders = [
      { id: "p1", provider_type: "openai", is_system: true },
    ];

    const result = await resolveProviderAndModel(null, mockProviders);

    expect(result.providerId).toBe("default-provider-id");
    expect(result.model).toBe("default-model");
  });
});

describe("buildSessionPayload", () => {
  it("builds basic payload", () => {
    const payload = buildSessionPayload(null, "provider-1", "model-1");

    expect(payload.name).toBe("New Session");
    expect(payload.agent_id).toBeUndefined();
    expect(payload.provider_id).toBe("provider-1");
    expect(payload.model).toBe("model-1");
  });

  it("includes agent ID when provided", () => {
    const agent: AgentSessionInfo = {
      id: "agent-123",
    };

    const payload = buildSessionPayload(agent, "p1", "m1");

    expect(payload.agent_id).toBe("agent-123");
  });

  it("includes MCP server IDs when agent has them", () => {
    const agent: AgentSessionInfo = {
      id: "agent-123",
      mcp_servers: [
        { id: "mcp-1", name: "Server 1" },
        { id: "mcp-2", name: "Server 2" },
      ],
    };

    const payload = buildSessionPayload(agent, null, null);

    expect(payload.mcp_server_ids).toEqual(["mcp-1", "mcp-2"]);
  });

  it("omits provider/model when null", () => {
    const payload = buildSessionPayload(null, null, null);

    expect(payload.provider_id).toBeUndefined();
    expect(payload.model).toBeUndefined();
  });
});

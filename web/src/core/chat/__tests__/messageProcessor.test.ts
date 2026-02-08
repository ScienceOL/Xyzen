/**
 * Tests for messageProcessor module
 *
 * Tests the core message processing utilities that were extracted
 * from chatSlice.ts during the frontend refactor.
 */

import { describe, it, expect, vi } from "vitest";
import {
  generateClientId,
  isValidUuid,
  groupToolMessagesWithAssistant,
  createLoadingMessage,
  convertToStreamingMessage,
  finalizeStreamingMessage,
  reconstructAgentExecutionFromMetadata,
} from "../messageProcessor";
import type { Message } from "@/store/types";

// Mock parseToolMessage
vi.mock("@/utils/toolMessageParser", () => ({
  parseToolMessage: vi.fn((content: string) => {
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  }),
}));

describe("generateClientId", () => {
  it("generates a unique ID with correct prefix", () => {
    const id = generateClientId();
    expect(id).toMatch(/^msg-\d+-[a-z0-9]+$/);
  });

  it("generates different IDs on each call", () => {
    const id1 = generateClientId();
    const id2 = generateClientId();
    expect(id1).not.toBe(id2);
  });
});

describe("isValidUuid", () => {
  it("returns true for valid UUID v4", () => {
    expect(isValidUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isValidUuid("6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(true);
    expect(isValidUuid("f47ac10b-58cc-4372-a567-0e02b2c3d479")).toBe(true);
  });

  it("returns true for valid UUIDs with uppercase letters", () => {
    expect(isValidUuid("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
    expect(isValidUuid("F47AC10B-58CC-4372-A567-0E02B2C3D479")).toBe(true);
  });

  it("returns false for client-generated IDs", () => {
    // Client IDs from generateClientId()
    expect(isValidUuid("msg-1706745600000-abc123")).toBe(false);
    expect(isValidUuid("loading-1706745600000")).toBe(false);
  });

  it("returns false for strings with wrong format", () => {
    // All hyphens (36 chars but not valid UUID)
    expect(isValidUuid("------------------------------------")).toBe(false);
    // Wrong segment lengths
    expect(isValidUuid("550e8400e29b-41d4-a716-446655440000")).toBe(false);
    // Too short
    expect(isValidUuid("550e8400-e29b-41d4-a716")).toBe(false);
    // Too long
    expect(isValidUuid("550e8400-e29b-41d4-a716-4466554400001")).toBe(false);
  });

  it("returns false for invalid version numbers", () => {
    // Version 0 (invalid)
    expect(isValidUuid("550e8400-e29b-01d4-a716-446655440000")).toBe(false);
    // Version 6+ (invalid for standard UUIDs)
    expect(isValidUuid("550e8400-e29b-61d4-a716-446655440000")).toBe(false);
  });

  it("returns false for invalid variant bits", () => {
    // Variant 0-7 (not RFC 4122)
    expect(isValidUuid("550e8400-e29b-41d4-0716-446655440000")).toBe(false);
    expect(isValidUuid("550e8400-e29b-41d4-7716-446655440000")).toBe(false);
    // Variant c-f (reserved)
    expect(isValidUuid("550e8400-e29b-41d4-c716-446655440000")).toBe(false);
  });

  it("returns false for empty string and non-hex characters", () => {
    expect(isValidUuid("")).toBe(false);
    expect(isValidUuid("gggggggg-gggg-4ggg-8ggg-gggggggggggg")).toBe(false);
  });
});

describe("groupToolMessagesWithAssistant", () => {
  it("returns empty array for empty input", () => {
    const result = groupToolMessagesWithAssistant([]);
    expect(result).toEqual([]);
  });

  it("passes through non-tool messages unchanged", () => {
    const messages: Message[] = [
      {
        id: "1",
        role: "user",
        content: "Hello",
        created_at: "2024-01-01T00:00:00Z",
      },
      {
        id: "2",
        role: "assistant",
        content: "Hi there!",
        created_at: "2024-01-01T00:00:01Z",
      },
    ];

    const result = groupToolMessagesWithAssistant(messages);

    expect(result).toHaveLength(2);
    expect(result[0].role).toBe("user");
    expect(result[0].content).toBe("Hello");
    expect(result[1].role).toBe("assistant");
    expect(result[1].content).toBe("Hi there!");
  });

  it("clones top-level message properties to avoid mutation", () => {
    const original: Message[] = [
      {
        id: "1",
        role: "user",
        content: "Hello",
        created_at: "2024-01-01T00:00:00Z",
        citations: [
          {
            url: "https://example.com",
            title: "Example",
          },
        ],
      },
    ];

    const result = groupToolMessagesWithAssistant(original);

    // Modify top-level string property
    result[0].content = "Modified";

    // Original top-level content should be unchanged
    expect(original[0].content).toBe("Hello");

    // Arrays are shallow cloned - modifying array reference works
    expect(result[0].citations).not.toBe(original[0].citations);
  });

  it("maps backend thinking_content to frontend thinkingContent", () => {
    // Simulate backend response with snake_case field
    const messagesFromBackend = [
      {
        id: "1",
        role: "assistant" as const,
        content: "Response",
        created_at: "2024-01-01T00:00:00Z",
        thinking_content: "Let me think about this...",
      },
    ];

    // Cast to unknown first to simulate backend data with different shape
    const result = groupToolMessagesWithAssistant(
      messagesFromBackend as unknown as Message[],
    );

    expect(result[0].thinkingContent).toBe("Let me think about this...");
  });

  it("handles unparseable tool messages by keeping them as-is", () => {
    const messages: Message[] = [
      {
        id: "1",
        role: "tool",
        content: "not valid json",
        created_at: "2024-01-01T00:00:00Z",
      },
    ];

    const result = groupToolMessagesWithAssistant(messages);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("tool");
    expect(result[0].content).toBe("not valid json");
  });

  it("converts tool_call_request to assistant message with toolCalls", () => {
    const messages: Message[] = [
      {
        id: "tool-msg-1",
        role: "tool",
        content: JSON.stringify({
          event: "tool_call_request",
          id: "tc-1",
          name: "search",
          description: "Search the web",
          arguments: { query: "vitest tutorial" },
          status: "waiting_confirmation",
        }),
        created_at: "2024-01-01T00:00:00Z",
      },
    ];

    const result = groupToolMessagesWithAssistant(messages);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("assistant");
    expect(result[0].toolCalls).toHaveLength(1);
    expect(result[0].toolCalls![0].name).toBe("search");
    expect(result[0].toolCalls![0].arguments).toEqual({
      query: "vitest tutorial",
    });
  });

  it("updates tool call with response data", () => {
    const messages: Message[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        created_at: "2024-01-01T00:00:00Z",
        toolCalls: [
          {
            id: "tc-1",
            name: "search",
            arguments: { query: "test" },
            status: "executing",
            timestamp: "2024-01-01T00:00:00Z",
          },
        ],
      },
      {
        id: "tool-response-1",
        role: "tool",
        content: JSON.stringify({
          toolCallId: "tc-1",
          status: "completed",
          result: "Search results here",
        }),
        created_at: "2024-01-01T00:00:01Z",
      },
    ];

    const result = groupToolMessagesWithAssistant(messages);

    expect(result).toHaveLength(1);
    expect(result[0].toolCalls![0].status).toBe("completed");
    expect(result[0].toolCalls![0].result).toBe("Search results here");
  });

  it("handles tool call errors", () => {
    const messages: Message[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        created_at: "2024-01-01T00:00:00Z",
        toolCalls: [
          {
            id: "tc-1",
            name: "search",
            arguments: {},
            status: "executing",
            timestamp: "2024-01-01T00:00:00Z",
          },
        ],
      },
      {
        id: "tool-error-1",
        role: "tool",
        content: JSON.stringify({
          toolCallId: "tc-1",
          error: "Network error",
        }),
        created_at: "2024-01-01T00:00:01Z",
      },
    ];

    const result = groupToolMessagesWithAssistant(messages);

    expect(result[0].toolCalls![0].status).toBe("failed");
    expect(result[0].toolCalls![0].error).toBe("Network error");
  });
});

describe("createLoadingMessage", () => {
  it("creates a message with loading state", () => {
    const message = createLoadingMessage();

    expect(message.role).toBe("assistant");
    expect(message.content).toBe("");
    expect(message.isLoading).toBe(true);
    expect(message.isStreaming).toBe(false);
    expect(message.isNewMessage).toBe(true);
    expect(message.id).toMatch(/^loading-\d+$/);
    expect(message.clientId).toMatch(/^msg-\d+-[a-z0-9]+$/);
  });

  it("creates messages with unique clientIds", () => {
    const msg1 = createLoadingMessage();
    // Small delay to ensure different timestamp for ID
    const msg2 = createLoadingMessage();

    // clientIds should always be unique due to random component
    expect(msg1.clientId).not.toBe(msg2.clientId);
  });
});

describe("convertToStreamingMessage", () => {
  it("converts loading message to streaming message", () => {
    const loadingMessage: Message = {
      id: "loading-123",
      clientId: "msg-123-abc",
      role: "assistant",
      content: "",
      created_at: "2024-01-01T00:00:00Z",
      isLoading: true,
      isStreaming: false,
    };

    const result = convertToStreamingMessage(loadingMessage, "server-id-456");

    expect(result.id).toBe("server-id-456");
    expect(result.isStreaming).toBe(true);
    expect(result.isLoading).toBeUndefined();
    expect(result.clientId).toBe("msg-123-abc");
    expect(result.content).toBe("");
  });
});

describe("finalizeStreamingMessage", () => {
  it("removes transient flags from message", () => {
    const streamingMessage: Message = {
      id: "msg-1",
      role: "assistant",
      content: "Hello world",
      created_at: "2024-01-01T00:00:00Z",
      isLoading: false,
      isStreaming: true,
    };

    const result = finalizeStreamingMessage(streamingMessage);

    expect(result.content).toBe("Hello world");
    expect(result.isLoading).toBeUndefined();
    expect(result.isStreaming).toBeUndefined();
  });

  it("sets created_at from parameter if provided", () => {
    const streamingMessage: Message = {
      id: "msg-1",
      role: "assistant",
      content: "Test",
      created_at: "2024-01-01T00:00:00Z",
      isStreaming: true,
    };

    const result = finalizeStreamingMessage(
      streamingMessage,
      "2024-01-02T00:00:00Z",
    );

    expect(result.created_at).toBe("2024-01-02T00:00:00Z");
  });

  it("generates new created_at if not provided", () => {
    const streamingMessage: Message = {
      id: "msg-1",
      role: "assistant",
      content: "Test",
      created_at: "2024-01-01T00:00:00Z",
      isStreaming: true,
    };

    const before = new Date().toISOString();
    const result = finalizeStreamingMessage(streamingMessage);
    const after = new Date().toISOString();

    expect(result.created_at >= before).toBe(true);
    expect(result.created_at <= after).toBe(true);
  });
});

describe("reconstructAgentExecutionFromMetadata", () => {
  it("preserves running status from persisted metadata", () => {
    const result = reconstructAgentExecutionFromMetadata({
      execution_id: "exec-running",
      agent_id: "agent-1",
      agent_name: "Agent",
      agent_type: "react",
      status: "running",
      node_outputs: {
        response: "Partial response",
      },
      node_order: ["response"],
      node_names: {
        response: "Response",
      },
    });

    expect(result).toBeDefined();
    expect(result?.status).toBe("running");
  });

  it("uses terminal agent_end status over direct status", () => {
    const result = reconstructAgentExecutionFromMetadata({
      execution_id: "exec-ended",
      agent_id: "agent-1",
      agent_name: "Agent",
      agent_type: "react",
      status: "running",
      timeline: [
        {
          event_type: "agent_end",
          status: "completed",
        },
      ],
      node_outputs: {
        response: "Final response",
      },
      node_order: ["response"],
      node_names: {
        response: "Response",
      },
    });

    expect(result).toBeDefined();
    expect(result?.status).toBe("completed");
  });
});

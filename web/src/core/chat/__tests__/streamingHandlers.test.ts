import { describe, expect, it } from "vitest";
import type { ChatChannel, Message } from "@/store/types";
import type { AgentExecutionState } from "@/types/agentEvents";
import {
  handleMessage,
  handleMessageSaved,
  handleProcessingOrLoading,
  handleStreamingEnd,
  handleStreamingStart,
  handleThinkingEnd,
  handleThinkingStart,
} from "../handlers/streamingHandlers";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeChannel(overrides?: Partial<ChatChannel>): ChatChannel {
  return {
    id: "topic-1",
    sessionId: "session-1",
    title: "Topic",
    messages: [],
    connected: true,
    error: null,
    ...overrides,
  };
}

function makeMessage(overrides?: Partial<Message>): Message {
  return {
    id: `msg-${Math.random().toString(36).slice(2, 10)}`,
    role: "assistant",
    content: "",
    created_at: new Date().toISOString(),
    status: "completed",
    ...overrides,
  };
}

function makeExecution(
  overrides?: Partial<AgentExecutionState>,
): AgentExecutionState {
  return {
    agentId: "agent-1",
    agentName: "Agent",
    agentType: "react",
    executionId: "exec-1",
    status: "running",
    startedAt: Date.now(),
    phases: [],
    subagents: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// handleProcessingOrLoading
// ---------------------------------------------------------------------------

describe("handleProcessingOrLoading", () => {
  it("creates a pending assistant message when none exists", () => {
    const channel = makeChannel();
    handleProcessingOrLoading(channel, "stream-1");

    expect(channel.responding).toBe(true);
    expect(channel.messages).toHaveLength(1);
    expect(channel.messages[0].status).toBe("pending");
    expect(channel.messages[0].isLoading).toBe(true);
    expect(channel.messages[0].streamId).toBe("stream-1");
  });

  it("does not duplicate when stream_id matches existing message", () => {
    const channel = makeChannel({
      messages: [makeMessage({ id: "stream-1", streamId: "stream-1" })],
    });
    handleProcessingOrLoading(channel, "stream-1");
    expect(channel.messages).toHaveLength(1);
  });

  it("does not duplicate when a loading message already exists", () => {
    const channel = makeChannel({
      messages: [makeMessage({ status: "pending", isLoading: true })],
    });
    handleProcessingOrLoading(channel, "stream-2");
    expect(channel.messages).toHaveLength(1);
  });

  it("uses stream_id as message id", () => {
    const channel = makeChannel();
    handleProcessingOrLoading(channel, "stream-42");
    expect(channel.messages[0].id).toBe("stream-42");
  });
});

// ---------------------------------------------------------------------------
// handleStreamingStart
// ---------------------------------------------------------------------------

describe("handleStreamingStart", () => {
  it("converts loading message to streaming", () => {
    const channel = makeChannel({
      messages: [makeMessage({ status: "pending", isLoading: true })],
    });
    handleStreamingStart(channel, { stream_id: "stream-1" });

    expect(channel.messages[0].status).toBe("streaming");
    expect(channel.messages[0].isStreaming).toBe(true);
    expect(channel.messages[0].id).toBe("stream-1");
    expect(channel.messages[0].isLoading).toBeUndefined();
  });

  it("creates new streaming message when no target exists", () => {
    const channel = makeChannel();
    handleStreamingStart(channel, { stream_id: "stream-1" });

    expect(channel.messages).toHaveLength(1);
    expect(channel.messages[0].status).toBe("streaming");
  });

  it("finds by execution_id when stream_id doesn't match", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          id: "agent-msg",
          agentExecution: makeExecution({ executionId: "exec-1" }),
        }),
      ],
    });
    handleStreamingStart(channel, {
      stream_id: "new-stream",
      execution_id: "exec-1",
    });

    // Should update the existing message rather than creating a new one
    expect(channel.messages).toHaveLength(1);
    expect(channel.messages[0].status).toBe("streaming");
  });
});

// ---------------------------------------------------------------------------
// handleStreamingEnd
// ---------------------------------------------------------------------------

describe("handleStreamingEnd", () => {
  it("finalizes streaming message without agent execution", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          id: "stream-1",
          streamId: "stream-1",
          status: "streaming",
          isStreaming: true,
        }),
      ],
    });
    handleStreamingEnd(channel, {
      stream_id: "stream-1",
      created_at: "2024-01-01T00:00:00Z",
    });

    expect(channel.messages[0].status).toBe("completed");
    expect(channel.messages[0].isStreaming).toBeUndefined();
    expect(channel.messages[0].created_at).toBe("2024-01-01T00:00:00Z");
  });

  it("preserves running agent execution (tool call cycle)", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          id: "stream-1",
          streamId: "stream-1",
          status: "streaming",
          isStreaming: true,
          content: "",
          agentExecution: makeExecution({
            status: "running",
            phases: [
              {
                id: "response",
                name: "Response",
                status: "running",
                nodes: [],
                streamedContent: "Using search tool...",
              },
            ],
          }),
        }),
      ],
    });
    handleStreamingEnd(channel, { stream_id: "stream-1" });

    // Agent execution stays alive for upcoming tool_call_request
    expect(channel.messages[0].agentExecution!.status).toBe("running");
    expect(channel.messages[0].agentExecution!.phases[0].status).toBe(
      "running",
    );
    // Streaming flag cleared
    expect(channel.messages[0].isStreaming).toBe(false);
    // Phase content copied to message.content
    expect(channel.messages[0].content).toBe("Using search tool...");
  });

  it("fully finalizes completed agent execution", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          id: "stream-1",
          streamId: "stream-1",
          status: "streaming",
          isStreaming: true,
          agentExecution: makeExecution({
            status: "completed",
            phases: [
              {
                id: "p1",
                name: "P1",
                status: "completed",
                nodes: [],
                streamedContent: "Done",
              },
            ],
          }),
        }),
      ],
    });
    handleStreamingEnd(channel, { stream_id: "stream-1" });

    // Non-running execution is fully finalized
    expect(channel.messages[0].status).toBe("completed");
    expect(channel.messages[0].isStreaming).toBeUndefined();
  });

  it("copies phase content to message.content when empty", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          id: "stream-1",
          streamId: "stream-1",
          status: "streaming",
          isStreaming: true,
          content: "",
          agentExecution: makeExecution({
            phases: [
              {
                id: "p1",
                name: "P1",
                status: "running",
                nodes: [],
                streamedContent: "Hello world",
              },
            ],
          }),
        }),
      ],
    });
    handleStreamingEnd(channel, { stream_id: "stream-1" });
    expect(channel.messages[0].content).toBe("Hello world");
  });

  it("falls back to sole streaming message when id doesn't match", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          id: "other-id",
          status: "streaming",
          isStreaming: true,
        }),
      ],
    });
    handleStreamingEnd(channel, { stream_id: "no-match" });
    expect(channel.messages[0].status).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// handleMessage
// ---------------------------------------------------------------------------

describe("handleMessage", () => {
  it("adds new message", () => {
    const channel = makeChannel();
    handleMessage(channel, makeMessage({ id: "msg-1", content: "Hello" }));
    expect(channel.messages).toHaveLength(1);
    expect(channel.messages[0].isNewMessage).toBe(true);
  });

  it("does not duplicate existing message", () => {
    const channel = makeChannel({
      messages: [makeMessage({ id: "msg-1" })],
    });
    handleMessage(channel, makeMessage({ id: "msg-1" }));
    expect(channel.messages).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// handleMessageSaved
// ---------------------------------------------------------------------------

describe("handleMessageSaved", () => {
  it("updates message id and created_at", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          id: "stream-1",
          streamId: "stream-1",
          status: "streaming",
        }),
      ],
    });
    handleMessageSaved(channel, {
      stream_id: "stream-1",
      db_id: "db-uuid",
      created_at: "2024-01-01T00:00:00Z",
    });

    expect(channel.messages[0].id).toBe("db-uuid");
    expect(channel.messages[0].dbId).toBe("db-uuid");
    expect(channel.messages[0].created_at).toBe("2024-01-01T00:00:00Z");
  });

  it("finds error message with non-UUID id as fallback", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          id: "error-12345",
          role: "assistant",
          status: "failed",
          error: {
            code: "system.internal_error",
            category: "system",
            message: "Error",
            recoverable: false,
          },
        }),
      ],
    });
    handleMessageSaved(channel, {
      stream_id: "some-uuid",
      db_id: "db-uuid",
      created_at: "2024-01-01T00:00:00Z",
    });
    expect(channel.messages[0].id).toBe("db-uuid");
  });
});

// ---------------------------------------------------------------------------
// handleThinkingStart
// ---------------------------------------------------------------------------

describe("handleThinkingStart", () => {
  it("converts loading message to thinking", () => {
    const channel = makeChannel({
      messages: [makeMessage({ status: "pending", isLoading: true })],
    });
    handleThinkingStart(channel, { stream_id: "stream-1" });

    expect(channel.messages[0].status).toBe("thinking");
    expect(channel.messages[0].isThinking).toBe(true);
    expect(channel.messages[0].thinkingContent).toBe("");
  });

  it("attaches thinking to running agent message", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          status: "pending",
          agentExecution: makeExecution({ status: "running" }),
        }),
      ],
    });
    // No loading message exists (agent already consumed it)
    handleThinkingStart(channel, { stream_id: "stream-1" });

    expect(channel.messages[0].isThinking).toBe(true);
  });

  it("creates new thinking message as fallback", () => {
    const channel = makeChannel();
    handleThinkingStart(channel, { stream_id: "stream-1" });

    expect(channel.messages).toHaveLength(1);
    expect(channel.messages[0].status).toBe("thinking");
    expect(channel.messages[0].isThinking).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleThinkingEnd
// ---------------------------------------------------------------------------

describe("handleThinkingEnd", () => {
  it("clears isThinking by stream_id", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({ id: "stream-1", isThinking: true, status: "thinking" }),
      ],
    });
    handleThinkingEnd(channel, { stream_id: "stream-1" });
    expect(channel.messages[0].isThinking).toBe(false);
  });

  it("falls back to agent message with isThinking", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          id: "agent-msg",
          isThinking: true,
          agentExecution: makeExecution({ status: "running" }),
        }),
      ],
    });
    handleThinkingEnd(channel, { stream_id: "no-match" });
    expect(channel.messages[0].isThinking).toBe(false);
  });
});

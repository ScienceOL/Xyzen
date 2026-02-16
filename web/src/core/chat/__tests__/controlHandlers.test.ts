import { describe, expect, it } from "vitest";
import type { ChatChannel, ChatHistoryItem, Message } from "@/store/types";
import type { AgentExecutionState } from "@/types/agentEvents";
import {
  handleError,
  handleGeneratedFiles,
  handleInsufficientBalance,
  handleParallelChatLimit,
  handleSearchCitations,
  handleStreamAborted,
  handleToolCallRequest,
  handleToolCallResponse,
  handleTopicUpdated,
} from "../handlers/controlHandlers";

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
// handleError
// ---------------------------------------------------------------------------

describe("handleError", () => {
  it("replaces loading message with error", () => {
    const channel = makeChannel({
      messages: [makeMessage({ status: "pending", isLoading: true })],
    });
    handleError(channel, {
      error: "Something went wrong",
      error_code: "provider.rate_limited",
      error_category: "provider",
      recoverable: true,
      stream_id: "stream-1",
    });

    expect(channel.messages[0].status).toBe("failed");
    expect(channel.messages[0].error!.code).toBe("provider.rate_limited");
    expect(channel.messages[0].error!.recoverable).toBe(true);
    expect(channel.responding).toBe(false);
  });

  it("creates error message when no target found", () => {
    const channel = makeChannel();
    handleError(channel, { error: "Oops", stream_id: "stream-1" });

    expect(channel.messages).toHaveLength(1);
    expect(channel.messages[0].status).toBe("failed");
    expect(channel.messages[0].error!.code).toBe("system.internal_error");
  });

  it("finds streaming message as target", () => {
    const channel = makeChannel({
      messages: [makeMessage({ status: "streaming", isStreaming: true })],
    });
    handleError(channel, { error: "Error", stream_id: "stream-1" });

    expect(channel.messages[0].status).toBe("failed");
  });

  it("finds running agent execution as target", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          agentExecution: makeExecution({ status: "running" }),
        }),
      ],
    });
    handleError(channel, { error: "Error", stream_id: "stream-1" });

    expect(channel.messages[0].status).toBe("failed");
  });

  it("finds by stream_id first", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({ id: "other", status: "pending", isLoading: true }),
        makeMessage({
          id: "stream-1",
          streamId: "stream-1",
          status: "streaming",
        }),
      ],
    });
    handleError(channel, { error: "Error", stream_id: "stream-1" });

    expect(channel.messages[1].status).toBe("failed");
    expect(channel.messages[0].status).toBe("pending"); // untouched
  });
});

// ---------------------------------------------------------------------------
// handleInsufficientBalance
// ---------------------------------------------------------------------------

describe("handleInsufficientBalance", () => {
  it("marks loading message as failed and returns notification", () => {
    const channel = makeChannel({
      messages: [makeMessage({ status: "pending", isLoading: true })],
    });
    const notification = handleInsufficientBalance(channel, {
      message: "No credits",
      stream_id: "stream-1",
    });

    expect(channel.responding).toBe(false);
    expect(channel.messages[0].status).toBe("failed");
    expect(channel.messages[0].error!.code).toBe(
      "billing.insufficient_balance",
    );
    expect(notification).toBeDefined();
    expect(notification!.type).toBe("warning");
    expect(notification!.actionUrl).toBeDefined();
  });

  it("returns notification even without loading message", () => {
    const channel = makeChannel();
    const notification = handleInsufficientBalance(channel, {
      stream_id: "stream-1",
    });
    expect(notification).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// handleParallelChatLimit
// ---------------------------------------------------------------------------

describe("handleParallelChatLimit", () => {
  it("removes loading message and returns notification", () => {
    const channel = makeChannel({
      messages: [makeMessage({ status: "pending", isLoading: true })],
    });
    const notification = handleParallelChatLimit(channel, {
      current: 3,
      limit: 3,
    });

    expect(channel.messages).toHaveLength(0);
    expect(channel.responding).toBe(false);
    expect(notification.type).toBe("warning");
    expect(notification.message).toContain("3/3");
  });
});

// ---------------------------------------------------------------------------
// handleStreamAborted
// ---------------------------------------------------------------------------

describe("handleStreamAborted", () => {
  it("clears abort timeout and cancels streaming message", () => {
    const timeoutIds = new Map<string, ReturnType<typeof setTimeout>>();
    const timeout = setTimeout(() => {}, 10000);
    timeoutIds.set("topic-1", timeout);

    const channel = makeChannel({
      id: "topic-1",
      aborting: true,
      responding: true,
      messages: [makeMessage({ status: "streaming", isStreaming: true })],
    });

    handleStreamAborted(channel, { reason: "user_abort" }, timeoutIds);

    expect(channel.responding).toBe(false);
    expect(channel.aborting).toBe(false);
    expect(channel.messages[0].status).toBe("cancelled");
    expect(timeoutIds.has("topic-1")).toBe(false);
  });

  it("cancels running agent execution", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          agentExecution: makeExecution({
            phases: [{ id: "p1", name: "P1", status: "running", nodes: [] }],
          }),
        }),
      ],
    });

    handleStreamAborted(channel, { reason: "user_abort" }, new Map());

    const exec = channel.messages[0].agentExecution!;
    expect(exec.status).toBe("cancelled");
    expect(exec.phases[0].status).toBe("cancelled");
  });

  it("converts loading message to cancelled execution", () => {
    const channel = makeChannel({
      messages: [makeMessage({ status: "pending", isLoading: true })],
    });

    handleStreamAborted(channel, { reason: "user_abort" }, new Map());

    expect(channel.messages[0].status).toBe("cancelled");
    expect(channel.messages[0].agentExecution).toBeDefined();
    expect(channel.messages[0].agentExecution!.status).toBe("cancelled");
  });
});

// ---------------------------------------------------------------------------
// handleToolCallRequest
// ---------------------------------------------------------------------------

describe("handleToolCallRequest", () => {
  it("adds tool call to running agent phase", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          agentExecution: makeExecution({
            currentNode: "response",
            phases: [
              {
                id: "response",
                name: "Response",
                status: "running",
                nodes: [],
              },
            ],
          }),
        }),
      ],
    });

    handleToolCallRequest(channel, {
      id: "tc-1",
      name: "search",
      arguments: { query: "test" },
      status: "waiting_confirmation",
      timestamp: Date.now(),
      stream_id: "stream-1",
    });

    const phase = channel.messages[0].agentExecution!.phases[0];
    expect(phase.toolCalls).toHaveLength(1);
    expect(phase.toolCalls![0].name).toBe("search");
  });

  it("creates standalone tool call message when no agent", () => {
    const channel = makeChannel();

    handleToolCallRequest(channel, {
      id: "tc-1",
      name: "search",
      arguments: {},
      status: "waiting_confirmation",
      timestamp: Date.now(),
      stream_id: "stream-1",
    });

    expect(channel.messages).toHaveLength(1);
    expect(channel.messages[0].toolCalls).toHaveLength(1);
  });

  it("removes loading message before adding tool call", () => {
    const channel = makeChannel({
      messages: [makeMessage({ status: "pending", isLoading: true })],
    });

    handleToolCallRequest(channel, {
      id: "tc-1",
      name: "search",
      arguments: {},
      status: "waiting_confirmation",
      timestamp: Date.now(),
      stream_id: "stream-1",
    });

    // Loading removed, tool call message added
    expect(channel.messages).toHaveLength(1);
    expect(channel.messages[0].toolCalls).toBeDefined();
  });

  it("does NOT remove pending agent execution message", () => {
    // Simulates: agent_start sets status="pending" with agentExecution,
    // then tool_call_request arrives before streaming_start (LLM calls tool without text)
    const channel = makeChannel({
      messages: [
        makeMessage({
          id: "agent-exec-1",
          streamId: "stream-1",
          status: "pending",
          agentExecution: makeExecution({
            status: "running",
            phases: [
              {
                id: "agent",
                name: "Response",
                status: "running",
                nodes: [],
              },
            ],
          }),
        }),
      ],
    });

    handleToolCallRequest(channel, {
      id: "tc-1",
      name: "web_search",
      arguments: {},
      status: "executing",
      timestamp: Date.now(),
      stream_id: "stream-1",
    });

    // Agent execution message preserved, tool call added to its phase
    expect(channel.messages).toHaveLength(1);
    expect(channel.messages[0].agentExecution).toBeDefined();
    expect(channel.messages[0].agentExecution!.status).toBe("running");
    const phase = channel.messages[0].agentExecution!.phases[0];
    expect(phase.toolCalls).toHaveLength(1);
    expect(phase.toolCalls![0].name).toBe("web_search");
  });

  it("finds agent message by stream_id when execution not running", () => {
    // Simulates the scenario after streaming_end cleared isStreaming
    // but the agent execution is still logically active
    const channel = makeChannel({
      messages: [
        makeMessage({
          id: "stream-1",
          streamId: "stream-1",
          status: "streaming",
          agentExecution: makeExecution({
            status: "running",
            phases: [
              {
                id: "response",
                name: "Response",
                status: "running",
                nodes: [],
              },
            ],
          }),
        }),
      ],
    });

    handleToolCallRequest(channel, {
      id: "tc-1",
      name: "search",
      arguments: {},
      status: "executing",
      timestamp: Date.now(),
      stream_id: "stream-1",
    });

    // Should add to existing agent phase, not create new message
    expect(channel.messages).toHaveLength(1);
    const phase = channel.messages[0].agentExecution!.phases[0];
    expect(phase.toolCalls).toHaveLength(1);
  });

  it("adds tool call to last phase when all phases completed", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          id: "stream-1",
          streamId: "stream-1",
          status: "streaming",
          agentExecution: makeExecution({
            status: "running",
            currentNode: "response",
            phases: [
              {
                id: "response",
                name: "Response",
                status: "completed",
                nodes: [],
              },
            ],
          }),
        }),
      ],
    });

    handleToolCallRequest(channel, {
      id: "tc-1",
      name: "search",
      arguments: {},
      status: "executing",
      timestamp: Date.now(),
      stream_id: "stream-1",
    });

    // Should fall back to last phase
    expect(channel.messages).toHaveLength(1);
    const phase = channel.messages[0].agentExecution!.phases[0];
    expect(phase.toolCalls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// handleToolCallResponse
// ---------------------------------------------------------------------------

describe("handleToolCallResponse", () => {
  it("updates tool call in agent phase", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          agentExecution: makeExecution({
            phases: [
              {
                id: "p1",
                name: "P1",
                status: "running",
                nodes: [],
                toolCalls: [
                  {
                    id: "tc-1",
                    name: "search",
                    arguments: {},
                    status: "executing",
                    timestamp: new Date().toISOString(),
                  },
                ],
              },
            ],
          }),
        }),
      ],
    });

    handleToolCallResponse(channel, {
      toolCallId: "tc-1",
      status: "completed",
      result: { answer: "42" },
    });

    const tc = channel.messages[0].agentExecution!.phases[0].toolCalls![0];
    expect(tc.status).toBe("completed");
    expect(tc.result).toBe('{"answer":"42"}');
  });

  it("updates standalone tool call message", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          toolCalls: [
            {
              id: "tc-1",
              name: "search",
              arguments: {},
              status: "executing",
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      ],
    });

    handleToolCallResponse(channel, {
      toolCallId: "tc-1",
      status: "failed",
      error: "Not found",
    });

    expect(channel.messages[0].toolCalls![0].status).toBe("failed");
    expect(channel.messages[0].toolCalls![0].error).toBe("Not found");
  });
});

// ---------------------------------------------------------------------------
// handleTopicUpdated
// ---------------------------------------------------------------------------

describe("handleTopicUpdated", () => {
  it("updates channel title and chat history", () => {
    const channel = makeChannel({ title: "Old" });
    const chatHistory: ChatHistoryItem[] = [
      {
        id: "topic-1",
        title: "Old",
        sessionId: "s1",
        assistantTitle: "Agent",
        updatedAt: "",
        isPinned: false,
      },
    ];

    handleTopicUpdated(
      channel,
      { id: "topic-1", name: "New Title", updated_at: "2024-01-01" },
      chatHistory,
    );

    expect(channel.title).toBe("New Title");
    expect(chatHistory[0].title).toBe("New Title");
    expect(chatHistory[0].updatedAt).toBe("2024-01-01");
  });
});

// ---------------------------------------------------------------------------
// handleSearchCitations
// ---------------------------------------------------------------------------

describe("handleSearchCitations", () => {
  it("attaches citations to streaming assistant message", () => {
    const channel = makeChannel({
      messages: [makeMessage({ isStreaming: true })],
    });
    handleSearchCitations(channel, {
      citations: [{ url: "https://example.com", title: "Example" }],
    });

    expect(channel.messages[0].citations).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// handleGeneratedFiles
// ---------------------------------------------------------------------------

describe("handleGeneratedFiles", () => {
  it("attaches files to streaming assistant message", () => {
    const channel = makeChannel({
      messages: [makeMessage({ isStreaming: true })],
    });
    handleGeneratedFiles(channel, {
      files: [
        {
          id: "f1",
          name: "test.png",
          type: "image/png",
          size: 1024,
          category: "images",
        },
      ],
    });

    expect(channel.messages[0].attachments).toHaveLength(1);
    expect(channel.messages[0].attachments![0].name).toBe("test.png");
  });

  it("does not duplicate existing files", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          isStreaming: true,
          attachments: [
            {
              id: "f1",
              name: "test.png",
              type: "image/png",
              size: 1024,
              category: "images",
            },
          ],
        }),
      ],
    });
    handleGeneratedFiles(channel, {
      files: [
        {
          id: "f1",
          name: "test.png",
          type: "image/png",
          size: 1024,
          category: "images",
        },
        {
          id: "f2",
          name: "test2.png",
          type: "image/png",
          size: 2048,
          category: "images",
        },
      ],
    });

    expect(channel.messages[0].attachments).toHaveLength(2);
  });
});

import { describe, expect, it } from "vitest";
import type { ChatChannel, Message } from "@/store/types";
import type { AgentExecutionState } from "@/types/agentEvents";
import {
  clearMessageTransientState,
  ensureFallbackResponsePhase,
  finalizeExecutionPhases,
  finalizeMessageExecution,
  findMessageIndexByStream,
  getNodeDisplayName,
  syncChannelResponding,
} from "../channelHelpers";

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
// getNodeDisplayName
// ---------------------------------------------------------------------------

describe("getNodeDisplayName", () => {
  it("humanizes underscored node IDs", () => {
    expect(getNodeDisplayName("clarify_with_user")).toBe("Clarify With User");
  });

  it("capitalizes single-word IDs", () => {
    expect(getNodeDisplayName("supervisor")).toBe("Supervisor");
  });

  it("handles already-capitalized IDs", () => {
    expect(getNodeDisplayName("Response")).toBe("Response");
  });
});

// ---------------------------------------------------------------------------
// ensureFallbackResponsePhase
// ---------------------------------------------------------------------------

describe("ensureFallbackResponsePhase", () => {
  it("creates a fallback phase when execution has no phases", () => {
    const msg = makeMessage({ agentExecution: makeExecution() });
    ensureFallbackResponsePhase(msg);

    expect(msg.agentExecution!.phases).toHaveLength(1);
    expect(msg.agentExecution!.phases[0].id).toBe("response");
    expect(msg.agentExecution!.phases[0].name).toBe("Response");
    expect(msg.agentExecution!.phases[0].status).toBe("running");
    expect(msg.agentExecution!.currentNode).toBe("response");
  });

  it("does nothing when phases already exist", () => {
    const msg = makeMessage({
      agentExecution: makeExecution({
        phases: [
          {
            id: "existing",
            name: "Existing",
            status: "running",
            nodes: [],
            streamedContent: "",
          },
        ],
      }),
    });
    ensureFallbackResponsePhase(msg);

    expect(msg.agentExecution!.phases).toHaveLength(1);
    expect(msg.agentExecution!.phases[0].id).toBe("existing");
  });

  it("does nothing when there is no agentExecution", () => {
    const msg = makeMessage();
    ensureFallbackResponsePhase(msg);
    expect(msg.agentExecution).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// findMessageIndexByStream
// ---------------------------------------------------------------------------

describe("findMessageIndexByStream", () => {
  it("finds by streamId field", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({ id: "a", streamId: "stream-1" }),
        makeMessage({ id: "b", streamId: "stream-2" }),
      ],
    });
    expect(findMessageIndexByStream(channel, "stream-2")).toBe(1);
  });

  it("finds by message id", () => {
    const channel = makeChannel({
      messages: [makeMessage({ id: "stream-1" })],
    });
    expect(findMessageIndexByStream(channel, "stream-1")).toBe(0);
  });

  it("falls back to executionId", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          id: "unrelated",
          agentExecution: makeExecution({ executionId: "exec-42" }),
        }),
      ],
    });
    expect(findMessageIndexByStream(channel, "no-match", "exec-42")).toBe(0);
  });

  it("falls back to last pending assistant message", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({ id: "done", status: "completed" }),
        makeMessage({ id: "pending", status: "pending" }),
      ],
    });
    expect(findMessageIndexByStream(channel, "no-match")).toBe(1);
  });

  it("falls back to sole running agent execution", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          id: "running-agent",
          status: "completed",
          agentExecution: makeExecution({ executionId: "other-exec" }),
        }),
      ],
    });
    expect(findMessageIndexByStream(channel, "no-match")).toBe(0);
  });

  it("returns -1 when multiple running agents exist (ambiguous)", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          agentExecution: makeExecution({ executionId: "exec-a" }),
        }),
        makeMessage({
          agentExecution: makeExecution({ executionId: "exec-b" }),
        }),
      ],
    });
    expect(findMessageIndexByStream(channel, "no-match")).toBe(-1);
  });

  it("returns -1 when no message matches", () => {
    const channel = makeChannel({
      messages: [makeMessage({ id: "x", status: "completed" })],
    });
    expect(findMessageIndexByStream(channel, "no-match")).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// clearMessageTransientState
// ---------------------------------------------------------------------------

describe("clearMessageTransientState", () => {
  it("clears all transient flags and sets completed", () => {
    const msg = makeMessage({
      status: "streaming",
      isLoading: true,
      isStreaming: true,
      isThinking: true,
    });
    clearMessageTransientState(msg);

    expect(msg.isLoading).toBeUndefined();
    expect(msg.isStreaming).toBeUndefined();
    expect(msg.isThinking).toBe(false);
    expect(msg.status).toBe("completed");
  });

  it("preserves failed status", () => {
    const msg = makeMessage({ status: "failed", isStreaming: true });
    clearMessageTransientState(msg);
    expect(msg.status).toBe("failed");
  });

  it("preserves cancelled status", () => {
    const msg = makeMessage({ status: "cancelled", isLoading: true });
    clearMessageTransientState(msg);
    expect(msg.status).toBe("cancelled");
  });
});

// ---------------------------------------------------------------------------
// finalizeExecutionPhases
// ---------------------------------------------------------------------------

describe("finalizeExecutionPhases", () => {
  it("marks running phases as completed with duration", () => {
    const now = Date.now();
    const msg = makeMessage({
      agentExecution: makeExecution({
        phases: [
          {
            id: "p1",
            name: "Phase 1",
            status: "running",
            startedAt: now - 1000,
            nodes: [],
          },
          {
            id: "p2",
            name: "Phase 2",
            status: "completed",
            nodes: [],
          },
        ],
      }),
    });

    finalizeExecutionPhases(msg, "completed", now);

    expect(msg.agentExecution!.phases[0].status).toBe("completed");
    expect(msg.agentExecution!.phases[0].endedAt).toBe(now);
    expect(msg.agentExecution!.phases[0].durationMs).toBe(1000);
    // Already completed phase is untouched
    expect(msg.agentExecution!.phases[1].status).toBe("completed");
    expect(msg.agentExecution!.phases[1].endedAt).toBeUndefined();
  });

  it("does nothing when no agentExecution", () => {
    const msg = makeMessage();
    finalizeExecutionPhases(msg, "completed", Date.now());
    // Should not throw
    expect(msg.agentExecution).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// finalizeMessageExecution
// ---------------------------------------------------------------------------

describe("finalizeMessageExecution", () => {
  it("finalizes execution and clears transient state", () => {
    const msg = makeMessage({
      status: "streaming",
      isStreaming: true,
      agentExecution: makeExecution({
        phases: [
          { id: "p1", name: "P1", status: "running", nodes: [] },
        ],
      }),
    });

    finalizeMessageExecution(msg, { status: "completed" });

    expect(msg.agentExecution!.status).toBe("completed");
    expect(msg.agentExecution!.endedAt).toBeDefined();
    expect(msg.agentExecution!.phases[0].status).toBe("completed");
    expect(msg.status).toBe("completed");
    expect(msg.isStreaming).toBeUndefined();
  });

  it("skips execution update when onlyIfRunning and execution is not running", () => {
    const msg = makeMessage({
      status: "streaming",
      agentExecution: makeExecution({ status: "completed" }),
    });

    finalizeMessageExecution(msg, {
      status: "failed",
      onlyIfRunning: true,
    });

    // Execution status should NOT be overwritten
    expect(msg.agentExecution!.status).toBe("completed");
    // But transient state is still cleared
    expect(msg.status).toBe("completed");
  });

  it("sets durationMs when provided", () => {
    const msg = makeMessage({
      agentExecution: makeExecution(),
    });

    finalizeMessageExecution(msg, { status: "completed", durationMs: 5000 });
    expect(msg.agentExecution!.durationMs).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// syncChannelResponding
// ---------------------------------------------------------------------------

describe("syncChannelResponding", () => {
  it("sets false when no assistant messages", () => {
    const channel = makeChannel({ responding: true, messages: [] });
    syncChannelResponding(channel);
    expect(channel.responding).toBe(false);
  });

  it("sets true for pending status", () => {
    const channel = makeChannel({
      messages: [makeMessage({ status: "pending" })],
    });
    syncChannelResponding(channel);
    expect(channel.responding).toBe(true);
  });

  it("sets true for streaming status", () => {
    const channel = makeChannel({
      messages: [makeMessage({ status: "streaming" })],
    });
    syncChannelResponding(channel);
    expect(channel.responding).toBe(true);
  });

  it("sets true for thinking status", () => {
    const channel = makeChannel({
      messages: [makeMessage({ status: "thinking" })],
    });
    syncChannelResponding(channel);
    expect(channel.responding).toBe(true);
  });

  it("sets true for legacy isStreaming flag", () => {
    const channel = makeChannel({
      messages: [makeMessage({ status: "completed", isStreaming: true })],
    });
    syncChannelResponding(channel);
    expect(channel.responding).toBe(true);
  });

  it("sets true for running agent execution", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          status: "completed",
          agentExecution: makeExecution({ status: "running" }),
        }),
      ],
    });
    syncChannelResponding(channel);
    expect(channel.responding).toBe(true);
  });

  it("sets true for active tool calls", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          status: "completed",
          toolCalls: [
            {
              id: "tc-1",
              name: "search",
              arguments: {},
              status: "waiting_confirmation",
            },
          ],
        }),
      ],
    });
    syncChannelResponding(channel);
    expect(channel.responding).toBe(true);
  });

  it("sets false when latest assistant is fully completed", () => {
    const channel = makeChannel({
      responding: true,
      messages: [makeMessage({ status: "completed" })],
    });
    syncChannelResponding(channel);
    expect(channel.responding).toBe(false);
  });

  it("uses latest assistant message (ignores user messages)", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({ status: "streaming" }),
        { id: "u1", role: "user", content: "hi", created_at: "", status: "completed" },
      ],
    });
    syncChannelResponding(channel);
    // Latest assistant is still streaming
    expect(channel.responding).toBe(true);
  });
});

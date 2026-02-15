import { describe, expect, it } from "vitest";
import type { ChatChannel, Message } from "@/store/types";
import type { AgentExecutionState } from "@/types/agentEvents";
import {
  handleAgentEnd,
  handleAgentError,
  handleAgentStart,
  handleNodeEnd,
  handleNodeStart,
  handleProgressUpdate,
  handleSubagentEnd,
  handleSubagentStart,
} from "../handlers/agentHandlers";

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

function makeContext(overrides?: Record<string, unknown>) {
  return {
    agent_id: "agent-1",
    agent_name: "Agent",
    agent_type: "react",
    execution_id: "exec-1",
    depth: 0,
    execution_path: ["Agent"],
    started_at: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// handleAgentStart
// ---------------------------------------------------------------------------

describe("handleAgentStart", () => {
  it("converts loading message to agent execution", () => {
    const channel = makeChannel({
      messages: [makeMessage({ status: "pending", isLoading: true })],
    });
    handleAgentStart(channel, { context: makeContext() });

    expect(channel.messages).toHaveLength(1);
    expect(channel.messages[0].agentExecution).toBeDefined();
    expect(channel.messages[0].agentExecution!.status).toBe("running");
    expect(channel.messages[0].id).toBe("agent-exec-1");
  });

  it("creates new message when no loading exists", () => {
    const channel = makeChannel();
    handleAgentStart(channel, {
      context: makeContext({ stream_id: "stream-1" }),
    });

    expect(channel.messages).toHaveLength(1);
    expect(channel.messages[0].agentExecution!.executionId).toBe("exec-1");
  });

  it("finds by stream_id from context", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          id: "stream-1",
          streamId: "stream-1",
          status: "pending",
        }),
      ],
    });
    handleAgentStart(channel, {
      context: makeContext({ stream_id: "stream-1" }),
    });

    expect(channel.messages).toHaveLength(1);
    expect(channel.messages[0].agentExecution).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// handleAgentEnd
// ---------------------------------------------------------------------------

describe("handleAgentEnd", () => {
  it("finalizes execution as completed", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          status: "streaming",
          isStreaming: true,
          agentExecution: makeExecution(),
        }),
      ],
    });
    handleAgentEnd(channel, {
      context: makeContext(),
      status: "completed",
      duration_ms: 5000,
    });

    expect(channel.messages[0].agentExecution!.status).toBe("completed");
    expect(channel.messages[0].agentExecution!.durationMs).toBe(5000);
    expect(channel.messages[0].status).toBe("completed");
    expect(channel.responding).toBe(false);
  });

  it("finalizes execution as failed", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          agentExecution: makeExecution(),
        }),
      ],
    });
    handleAgentEnd(channel, {
      context: makeContext(),
      status: "failed",
      duration_ms: 1000,
    });

    expect(channel.messages[0].agentExecution!.status).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// handleAgentError
// ---------------------------------------------------------------------------

describe("handleAgentError", () => {
  it("sets error on execution and marks as failed", () => {
    const channel = makeChannel({
      messages: [makeMessage({ agentExecution: makeExecution() })],
    });
    handleAgentError(channel, {
      context: makeContext(),
      error_type: "RuntimeError",
      error_message: "Something broke",
      recoverable: false,
    });

    const exec = channel.messages[0].agentExecution!;
    expect(exec.status).toBe("failed");
    expect(exec.error!.type).toBe("RuntimeError");
    expect(exec.error!.message).toBe("Something broke");
  });
});

// ---------------------------------------------------------------------------
// handleNodeStart
// ---------------------------------------------------------------------------

describe("handleNodeStart", () => {
  it("adds a new phase to execution", () => {
    const channel = makeChannel({
      messages: [makeMessage({ agentExecution: makeExecution() })],
    });
    handleNodeStart(channel, {
      node_id: "clarify_with_user",
      node_name: "Clarify",
      node_type: "llm",
      context: makeContext(),
    });

    const exec = channel.messages[0].agentExecution!;
    expect(exec.phases).toHaveLength(1);
    expect(exec.phases[0].id).toBe("clarify_with_user");
    expect(exec.phases[0].name).toBe("Clarify With User");
    expect(exec.phases[0].status).toBe("running");
    expect(exec.currentNode).toBe("clarify_with_user");
  });

  it("marks previous running phase as completed", () => {
    const now = Date.now();
    const channel = makeChannel({
      messages: [
        makeMessage({
          agentExecution: makeExecution({
            phases: [
              {
                id: "phase-1",
                name: "Phase 1",
                status: "running",
                startedAt: now - 1000,
                nodes: [],
              },
            ],
          }),
        }),
      ],
    });
    handleNodeStart(channel, {
      node_id: "phase_2",
      node_name: "Phase 2",
      node_type: "llm",
      context: makeContext(),
    });

    const exec = channel.messages[0].agentExecution!;
    expect(exec.phases[0].status).toBe("completed");
    expect(exec.phases[0].endedAt).toBeDefined();
    expect(exec.phases[1].status).toBe("running");
  });

  it("updates existing phase when it already exists", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          agentExecution: makeExecution({
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
    handleNodeStart(channel, {
      node_id: "response",
      node_name: "Response",
      node_type: "llm",
      component_key: "system:react",
      context: makeContext(),
    });

    const exec = channel.messages[0].agentExecution!;
    expect(exec.phases).toHaveLength(1);
    expect(exec.phases[0].status).toBe("running");
    expect(exec.phases[0].componentKey).toBe("system:react");
  });
});

// ---------------------------------------------------------------------------
// handleNodeEnd
// ---------------------------------------------------------------------------

describe("handleNodeEnd", () => {
  it("marks phase as completed", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          agentExecution: makeExecution({
            phases: [
              {
                id: "clarify",
                name: "Clarify",
                status: "running",
                nodes: [],
              },
            ],
          }),
        }),
      ],
    });
    handleNodeEnd(channel, {
      node_id: "clarify",
      node_name: "Clarify",
      node_type: "llm",
      status: "completed",
      duration_ms: 500,
      context: makeContext(),
    });

    const phase = channel.messages[0].agentExecution!.phases[0];
    expect(phase.status).toBe("completed");
    expect(phase.durationMs).toBe(500);
  });

  it("marks phase as skipped", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          agentExecution: makeExecution({
            phases: [{ id: "p1", name: "P1", status: "running", nodes: [] }],
          }),
        }),
      ],
    });
    handleNodeEnd(channel, {
      node_id: "p1",
      node_name: "P1",
      node_type: "llm",
      status: "skipped",
      duration_ms: 0,
      context: makeContext(),
    });

    expect(channel.messages[0].agentExecution!.phases[0].status).toBe(
      "skipped",
    );
  });
});

// ---------------------------------------------------------------------------
// handleSubagentStart / handleSubagentEnd
// ---------------------------------------------------------------------------

describe("handleSubagentStart", () => {
  it("adds subagent to execution", () => {
    const channel = makeChannel({
      messages: [makeMessage({ agentExecution: makeExecution() })],
    });
    handleSubagentStart(channel, {
      subagent_id: "sub-1",
      subagent_name: "WebSearch",
      subagent_type: "react",
      context: makeContext({ parent_execution_id: "exec-1" }),
    });

    expect(channel.messages[0].agentExecution!.subagents).toHaveLength(1);
    expect(channel.messages[0].agentExecution!.subagents[0].name).toBe(
      "WebSearch",
    );
  });
});

describe("handleSubagentEnd", () => {
  it("marks subagent as completed", () => {
    const channel = makeChannel({
      messages: [
        makeMessage({
          agentExecution: makeExecution({
            subagents: [
              {
                id: "sub-1",
                name: "WebSearch",
                type: "react",
                status: "running",
                depth: 1,
                executionPath: ["Agent", "WebSearch"],
                startedAt: Date.now(),
              },
            ],
          }),
        }),
      ],
    });
    handleSubagentEnd(channel, {
      subagent_id: "sub-1",
      subagent_name: "WebSearch",
      status: "completed",
      duration_ms: 3000,
      context: makeContext(),
    });

    const sub = channel.messages[0].agentExecution!.subagents[0];
    expect(sub.status).toBe("completed");
    expect(sub.durationMs).toBe(3000);
  });
});

// ---------------------------------------------------------------------------
// handleProgressUpdate
// ---------------------------------------------------------------------------

describe("handleProgressUpdate", () => {
  it("updates progress on execution", () => {
    const channel = makeChannel({
      messages: [makeMessage({ agentExecution: makeExecution() })],
    });
    handleProgressUpdate(channel, {
      progress_percent: 50,
      message: "Halfway done",
      context: makeContext(),
    });

    expect(channel.messages[0].agentExecution!.progressPercent).toBe(50);
    expect(channel.messages[0].agentExecution!.progressMessage).toBe(
      "Halfway done",
    );
  });
});

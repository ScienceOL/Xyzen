import { describe, expect, it } from "vitest";
import { deriveTopicStatus, isActiveTopicStatus } from "../channelStatus";
import type { ChatChannel, Message } from "@/store/types";

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

function makeAssistantMessage(
  status?: "running" | "completed" | "failed" | "cancelled",
): Message {
  return {
    id: `msg-${Math.random().toString(36).slice(2, 10)}`,
    role: "assistant",
    content: "",
    created_at: new Date().toISOString(),
    agentExecution: status
      ? {
          agentId: "agent-1",
          agentName: "Agent",
          agentType: "react",
          executionId: "exec-1",
          status,
          startedAt: Date.now(),
          phases: [],
          subagents: [],
        }
      : undefined,
  };
}

describe("deriveTopicStatus", () => {
  it("returns stopping when aborting is true", () => {
    expect(deriveTopicStatus(makeChannel({ aborting: true }))).toBe("stopping");
  });

  it("returns running when responding is true", () => {
    expect(deriveTopicStatus(makeChannel({ responding: true }))).toBe(
      "running",
    );
  });

  it("returns running when a message is streaming", () => {
    const channel = makeChannel({
      messages: [{ ...makeAssistantMessage(), isStreaming: true }],
    });
    expect(deriveTopicStatus(channel)).toBe("running");
  });

  it("returns running when latest execution is running", () => {
    const channel = makeChannel({
      messages: [
        makeAssistantMessage("completed"),
        makeAssistantMessage("running"),
      ],
    });
    expect(deriveTopicStatus(channel)).toBe("running");
  });

  it("returns failed when latest execution failed and nothing is active", () => {
    const channel = makeChannel({
      messages: [makeAssistantMessage("failed")],
    });
    expect(deriveTopicStatus(channel)).toBe("failed");
  });

  it("returns idle when there is no active or failed execution", () => {
    const channel = makeChannel({
      messages: [makeAssistantMessage("completed")],
    });
    expect(deriveTopicStatus(channel)).toBe("idle");
  });
});

describe("isActiveTopicStatus", () => {
  it("returns true for running and stopping", () => {
    expect(isActiveTopicStatus("running")).toBe(true);
    expect(isActiveTopicStatus("stopping")).toBe(true);
  });

  it("returns false for idle and failed", () => {
    expect(isActiveTopicStatus("idle")).toBe(false);
    expect(isActiveTopicStatus("failed")).toBe(false);
  });
});

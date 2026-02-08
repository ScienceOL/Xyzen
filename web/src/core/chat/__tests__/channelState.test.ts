import { describe, expect, it } from "vitest";
import { mergeChannelPreservingRuntime } from "../channelState";
import type { ChatChannel } from "@/store/types";

describe("mergeChannelPreservingRuntime", () => {
  it("returns incoming channel when existing channel does not exist", () => {
    const incoming: ChatChannel = {
      id: "topic-1",
      sessionId: "session-1",
      title: "New Topic",
      messages: [],
      agentId: "agent-1",
      provider_id: "provider-1",
      model: "model-1",
      model_tier: "pro",
      connected: false,
      error: null,
    };

    expect(mergeChannelPreservingRuntime(undefined, incoming)).toEqual(
      incoming,
    );
  });

  it("preserves runtime state while updating backend metadata", () => {
    const existing: ChatChannel = {
      id: "topic-1",
      sessionId: "session-old",
      title: "Old Title",
      messages: [
        {
          id: "msg-1",
          role: "assistant",
          content: "",
          created_at: new Date().toISOString(),
          isStreaming: true,
          agentExecution: {
            agentId: "agent-1",
            agentName: "Agent",
            agentType: "react",
            executionId: "exec-1",
            status: "running",
            startedAt: Date.now(),
            phases: [
              {
                id: "response",
                name: "Response",
                status: "running",
                streamedContent: "already streamed content",
                nodes: [],
              },
            ],
            subagents: [],
          },
        },
      ],
      agentId: "agent-old",
      provider_id: "provider-old",
      model: "model-old",
      model_tier: "standard",
      knowledge_set_id: "ks-old",
      connected: true,
      error: "transient-error",
      responding: true,
      aborting: true,
      knowledgeContext: {
        folderId: "folder-1",
        folderName: "Folder",
      },
    };

    const incoming: ChatChannel = {
      id: "topic-1",
      sessionId: "session-new",
      title: "New Title",
      messages: [],
      agentId: "agent-new",
      provider_id: "provider-new",
      model: "model-new",
      model_tier: "ultra",
      knowledge_set_id: "ks-new",
      connected: false,
      error: null,
    };

    const merged = mergeChannelPreservingRuntime(existing, incoming);

    expect(merged.sessionId).toBe("session-new");
    expect(merged.title).toBe("New Title");
    expect(merged.agentId).toBe("agent-new");
    expect(merged.provider_id).toBe("provider-new");
    expect(merged.model).toBe("model-new");
    expect(merged.model_tier).toBe("ultra");
    expect(merged.knowledge_set_id).toBe("ks-new");

    expect(merged.messages).toBe(existing.messages);
    expect(merged.messages[0].agentExecution?.phases[0].streamedContent).toBe(
      "already streamed content",
    );
    expect(merged.connected).toBe(true);
    expect(merged.error).toBe("transient-error");
    expect(merged.responding).toBe(true);
    expect(merged.aborting).toBe(true);
    expect(merged.knowledgeContext).toEqual(existing.knowledgeContext);
  });
});

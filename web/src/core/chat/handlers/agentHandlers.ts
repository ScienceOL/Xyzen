/**
 * Agent Execution Event Handlers
 *
 * Pure handler functions for agent lifecycle events:
 * agent_start, agent_end, agent_error, node_start, node_end,
 * subagent_start, subagent_end, progress_update.
 *
 * All functions operate on Immer draft objects (ChatChannel / Message)
 * and have zero store dependencies.
 */

import type { ChatChannel } from "@/store/types";
import type {
  AgentEndData,
  AgentErrorData,
  AgentExecutionState,
  AgentStartData,
  NodeEndData,
  NodeStartData,
  ProgressUpdateData,
  SubagentEndData,
  SubagentStartData,
} from "@/types/agentEvents";
import { generateClientId } from "../messageProcessor";
import {
  clearMessageTransientState,
  finalizeMessageExecution,
  findMessageIndexByStream,
  getNodeDisplayName,
} from "../channelHelpers";

// ---------------------------------------------------------------------------
// agent_start
// ---------------------------------------------------------------------------

export function handleAgentStart(
  channel: ChatChannel,
  data: AgentStartData,
): void {
  channel.responding = true;
  const { context } = data;

  // Find message using stream_id from context, or fallback to loading message
  let loadingIndex = -1;
  if (context.stream_id) {
    loadingIndex = findMessageIndexByStream(channel, context.stream_id);
  }
  if (loadingIndex === -1) {
    loadingIndex = channel.messages.findIndex(
      (m) => m.status === "pending" || m.isLoading,
    );
  }

  const executionState: AgentExecutionState = {
    agentId: context.agent_id,
    agentName: context.agent_name,
    agentType: context.agent_type,
    executionId: context.execution_id,
    status: "running",
    startedAt: context.started_at,
    phases: [],
    subagents: [],
  };

  if (loadingIndex !== -1) {
    // Convert loading message to agent execution message
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { isLoading: _, ...messageWithoutLoading } =
      channel.messages[loadingIndex];
    channel.messages[loadingIndex] = {
      ...messageWithoutLoading,
      id: `agent-${context.execution_id}`,
      status: "pending",
      agentExecution: executionState,
    };
  } else {
    // Create a new message with agent execution
    channel.messages.push({
      id: `agent-${context.execution_id}`,
      streamId: context.stream_id,
      clientId: generateClientId(),
      role: "assistant" as const,
      content: "",
      created_at: new Date().toISOString(),
      status: "pending",
      isNewMessage: true,
      agentExecution: executionState,
    });
  }
}

// ---------------------------------------------------------------------------
// agent_end
// ---------------------------------------------------------------------------

export function handleAgentEnd(channel: ChatChannel, data: AgentEndData): void {
  channel.responding = false;
  const { context } = data;

  const msgIndex = channel.messages.findIndex(
    (m) => m.agentExecution?.executionId === context.execution_id,
  );

  if (msgIndex !== -1) {
    const targetMessage = channel.messages[msgIndex];
    const execution = targetMessage.agentExecution;
    if (execution) {
      finalizeMessageExecution(targetMessage, {
        status:
          data.status === "completed"
            ? "completed"
            : data.status === "cancelled"
              ? "cancelled"
              : "failed",
        durationMs: data.duration_ms,
      });
    } else {
      clearMessageTransientState(targetMessage);
    }
  }
}

// ---------------------------------------------------------------------------
// agent_error
// ---------------------------------------------------------------------------

export function handleAgentError(
  channel: ChatChannel,
  data: AgentErrorData,
): void {
  channel.responding = false;
  const { context } = data;

  const msgIndex = channel.messages.findIndex(
    (m) => m.agentExecution?.executionId === context.execution_id,
  );

  if (msgIndex !== -1) {
    const targetMessage = channel.messages[msgIndex];
    const execution = targetMessage.agentExecution;
    if (execution) {
      execution.error = {
        type: data.error_type,
        message: data.error_message,
        recoverable: data.recoverable,
        nodeId: data.node_id,
      };
      finalizeMessageExecution(targetMessage, {
        status: "failed",
      });
    } else {
      clearMessageTransientState(targetMessage);
    }
  }
}

// ---------------------------------------------------------------------------
// node_start
// ---------------------------------------------------------------------------

export function handleNodeStart(
  channel: ChatChannel,
  data: NodeStartData,
): void {
  const { context } = data;

  const agentMsgIndex = channel.messages.findIndex(
    (m) => m.agentExecution?.executionId === context.execution_id,
  );

  if (agentMsgIndex !== -1) {
    const execution = channel.messages[agentMsgIndex].agentExecution;
    if (execution) {
      // Mark any currently running phase as completed
      const runningPhase = execution.phases.find((p) => p.status === "running");
      if (runningPhase) {
        runningPhase.status = "completed";
        runningPhase.endedAt = Date.now();
        if (runningPhase.startedAt) {
          runningPhase.durationMs = Date.now() - runningPhase.startedAt;
        }
      }

      const displayName = getNodeDisplayName(data.node_id);

      // Check if phase already exists (from phase_start event)
      const existingPhase = execution.phases.find((p) => p.id === data.node_id);
      if (existingPhase) {
        existingPhase.status = "running";
        existingPhase.name = displayName;
        existingPhase.componentKey = data.component_key;
        existingPhase.startedAt = Date.now();
        existingPhase.streamedContent = "";
      } else {
        execution.phases.push({
          id: data.node_id,
          name: displayName,
          componentKey: data.component_key,
          status: "running",
          startedAt: Date.now(),
          nodes: [],
          streamedContent: "",
        });
      }

      execution.currentPhase = displayName;
      execution.currentNode = data.node_id;
    }
  }
}

// ---------------------------------------------------------------------------
// node_end
// ---------------------------------------------------------------------------

export function handleNodeEnd(channel: ChatChannel, data: NodeEndData): void {
  const { context } = data;

  const agentMsgIndex = channel.messages.findIndex(
    (m) => m.agentExecution?.executionId === context.execution_id,
  );

  if (agentMsgIndex !== -1) {
    const execution = channel.messages[agentMsgIndex].agentExecution;
    if (execution) {
      const phase = execution.phases.find((p) => p.id === data.node_id);
      if (phase) {
        phase.status =
          data.status === "completed"
            ? "completed"
            : data.status === "skipped"
              ? "skipped"
              : "failed";
        phase.endedAt = Date.now();
        phase.durationMs = data.duration_ms;
        phase.outputSummary = data.output_summary;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// subagent_start
// ---------------------------------------------------------------------------

export function handleSubagentStart(
  channel: ChatChannel,
  data: SubagentStartData,
): void {
  const { context } = data;

  const msgIndex = channel.messages.findIndex(
    (m) =>
      m.agentExecution &&
      (m.agentExecution.executionId === context.parent_execution_id ||
        m.agentExecution.executionId === context.execution_id),
  );

  if (msgIndex !== -1) {
    const execution = channel.messages[msgIndex].agentExecution;
    if (execution) {
      execution.subagents.push({
        id: data.subagent_id,
        name: data.subagent_name,
        type: data.subagent_type,
        status: "running",
        depth: context.depth,
        executionPath: context.execution_path,
        startedAt: context.started_at,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// subagent_end
// ---------------------------------------------------------------------------

export function handleSubagentEnd(
  channel: ChatChannel,
  data: SubagentEndData,
): void {
  const msgIndex = channel.messages.findIndex((m) =>
    m.agentExecution?.subagents?.some((s) => s.id === data.subagent_id),
  );

  if (msgIndex !== -1) {
    const execution = channel.messages[msgIndex].agentExecution;
    if (execution) {
      const subagent = execution.subagents.find(
        (s) => s.id === data.subagent_id,
      );
      if (subagent) {
        subagent.status = data.status === "completed" ? "completed" : "failed";
        subagent.endedAt = Date.now();
        subagent.durationMs = data.duration_ms;
        subagent.outputSummary = data.output_summary;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// progress_update
// ---------------------------------------------------------------------------

export function handleProgressUpdate(
  channel: ChatChannel,
  data: ProgressUpdateData,
): void {
  const { context } = data;

  const msgIndex = channel.messages.findIndex(
    (m) => m.agentExecution?.executionId === context.execution_id,
  );

  if (msgIndex !== -1) {
    const execution = channel.messages[msgIndex].agentExecution;
    if (execution) {
      execution.progressPercent = data.progress_percent;
      execution.progressMessage = data.message;
    }
  }
}

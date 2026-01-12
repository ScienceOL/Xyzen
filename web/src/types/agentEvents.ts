/**
 * Agent Event Types
 *
 * TypeScript types matching backend agent event schemas.
 * These define the structure of agent execution events received via WebSocket.
 */

/**
 * Flat context metadata included with all agent events.
 * Allows frontend to track agent execution, depth, and timing.
 */
export interface AgentExecutionContext {
  // Agent identification
  agent_id: string;
  agent_name: string;
  agent_type: string; // system key (e.g., "react", "deep_research") or "graph"

  // Execution tracking (flat, not hierarchical)
  execution_id: string;
  parent_execution_id?: string; // Present if this is a subagent
  depth: number; // 0 for root agent, 1 for first subagent, etc.
  execution_path: string[]; // Path of agent names: ["root", "deep_research", "web_search"]

  // Current position in graph
  current_node?: string;
  current_phase?: string;

  // Timing
  started_at: number; // Unix timestamp
  elapsed_ms?: number;
}

// === Agent Lifecycle Events ===

export interface AgentStartData {
  context: AgentExecutionContext;
  total_nodes?: number;
  estimated_duration_ms?: number;
}

export interface AgentEndData {
  context: AgentExecutionContext;
  status: string; // "completed", "failed", "cancelled"
  duration_ms: number;
  output_summary?: string;
}

export interface AgentErrorData {
  context: AgentExecutionContext;
  error_type: string;
  error_message: string;
  recoverable: boolean;
  node_id?: string;
}

// === Phase Events ===

export interface PhaseStartData {
  phase_id: string;
  phase_name: string;
  description?: string;
  expected_duration_ms?: number;
  context: AgentExecutionContext;
}

export interface PhaseEndData {
  phase_id: string;
  phase_name: string;
  status: string; // "completed", "failed", "skipped"
  duration_ms: number;
  output_summary?: string;
  context: AgentExecutionContext;
}

// === Node Events ===

export interface NodeStartData {
  node_id: string;
  node_name: string;
  node_type: string; // "llm", "tool", "router", etc.
  input_summary?: string;
  context: AgentExecutionContext;
}

export interface NodeEndData {
  node_id: string;
  node_name: string;
  node_type: string;
  status: string; // "completed", "failed", "skipped"
  duration_ms: number;
  output_summary?: string;
  error_type?: string;
  error_message?: string;
  context: AgentExecutionContext;
}

// === Subagent Events ===

export interface SubagentStartData {
  subagent_id: string;
  subagent_name: string;
  subagent_type: string;
  input_summary?: string;
  context: AgentExecutionContext;
}

export interface SubagentEndData {
  subagent_id: string;
  subagent_name: string;
  status: string;
  duration_ms: number;
  output_summary?: string;
  context: AgentExecutionContext;
}

// === Progress Events ===

export interface ProgressUpdateData {
  progress_percent: number; // 0-100
  message: string;
  details?: Record<string, unknown>;
  context: AgentExecutionContext;
}

// === Iteration Events ===

export interface IterationStartData {
  iteration_number: number; // 1-indexed
  max_iterations: number;
  reason?: string;
  context: AgentExecutionContext;
}

export interface IterationEndData {
  iteration_number: number;
  will_continue: boolean;
  reason?: string;
  context: AgentExecutionContext;
}

// === State Events ===

export interface StateUpdateData {
  updated_keys: string[];
  summary: Record<string, string>;
  context: AgentExecutionContext;
}

// === Execution State Types (for UI state management) ===

export type ExecutionStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export interface PhaseExecution {
  id: string;
  name: string;
  description?: string;
  status: ExecutionStatus;
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
  outputSummary?: string;
  nodes: NodeExecution[];
  // Streamed content during this phase (for per-node output display)
  streamedContent?: string;
}

export interface NodeExecution {
  id: string;
  name: string;
  type: string;
  status: ExecutionStatus;
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
  inputSummary?: string;
  outputSummary?: string;
}

export interface SubagentExecution {
  id: string;
  name: string;
  type: string;
  status: "running" | "completed" | "failed";
  depth: number;
  executionPath: string[];
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  outputSummary?: string;
}

export interface IterationInfo {
  current: number;
  max: number;
  reason?: string;
}

export interface AgentExecutionState {
  // Agent identification
  agentId: string;
  agentName: string;
  agentType: string;
  executionId: string;

  // Execution status
  status: "running" | "completed" | "failed" | "cancelled";
  startedAt: number;
  endedAt?: number;
  durationMs?: number;

  // Current progress
  currentPhase?: string;
  currentNode?: string;
  progressPercent?: number;
  progressMessage?: string;

  // Iteration tracking
  iteration?: IterationInfo;

  // Execution history (for collapsed view)
  phases: PhaseExecution[];

  // Nested subagents
  subagents: SubagentExecution[];

  // Error info if failed
  error?: {
    type: string;
    message: string;
    recoverable: boolean;
    nodeId?: string;
  };
}

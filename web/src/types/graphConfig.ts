/**
 * GraphConfig TypeScript Types
 *
 * These types mirror the backend GraphConfig schema defined in:
 * service/app/schemas/graph_config.py
 *
 * They define the JSON structure for configuring agent workflows.
 */

// =============================================================================
// Enums
// =============================================================================

export type NodeType =
  | "llm"
  | "tool"
  | "router"
  | "subagent"
  | "transform"
  | "parallel"
  | "human"
  | "component";

// Matches backend ConditionOperator enum values
export type ConditionOperator =
  | "eq" // EQUALS
  | "neq" // NOT_EQUALS
  | "contains"
  | "not_contains"
  | "gt" // GREATER_THAN
  | "gte" // GREATER_THAN_OR_EQUAL
  | "lt" // LESS_THAN
  | "lte" // LESS_THAN_OR_EQUAL
  | "in"
  | "not_in"
  | "truthy"
  | "falsy"
  | "matches";

export type ReducerType = "replace" | "append" | "merge" | "add" | "messages";

export type RoutingStrategy = "condition" | "llm" | "state_check";

export type JoinStrategy = "wait_all" | "wait_any" | "wait_n";

export type MergeStrategy = "merge_dicts" | "list" | "first" | "custom";

export type HumanInputType = "text" | "choice" | "confirm" | "form";

export type ErrorHandling = "raise" | "continue" | "retry" | "fallback";

// =============================================================================
// State Schema Types
// =============================================================================

export interface StateFieldSchema {
  type: string; // 'string', 'int', 'float', 'bool', 'list', 'dict', 'messages', 'any'
  description?: string;
  default?: unknown;
  reducer?: ReducerType;
  required?: boolean;
}

export interface GraphStateSchema {
  fields: Record<string, StateFieldSchema>;
}

// =============================================================================
// Structured Output Types
// =============================================================================

export interface StructuredOutputField {
  type: string; // 'string', 'bool', 'int', 'float', 'list', 'dict'
  description?: string;
  default?: unknown;
  required?: boolean;
}

export interface StructuredOutputSchema {
  fields: Record<string, StructuredOutputField>;
  description?: string;
}

// =============================================================================
// Node Config Types
// =============================================================================

export interface LLMNodeConfig {
  prompt_template: string;
  output_key?: string;
  model_override?: string | null;
  temperature_override?: number | null;
  max_tokens?: number | null;
  tools_enabled?: boolean;
  tool_filter?: string[] | null;
  max_iterations?: number;
  stop_sequences?: string[] | null;
  structured_output?: StructuredOutputSchema | null;
  message_key?: string | null;
  message_key_condition?: {
    condition_field: string;
    true_key: string;
    false_key: string;
  } | null;
}

export interface ToolNodeConfig {
  // v1 fields
  tool_name?: string;
  arguments_template?: Record<string, string>;
  // v2 fields
  execute_all?: boolean;
  tool_filter?: string[] | null;
  // Common fields
  output_key?: string;
  timeout_seconds?: number;
  retry_count?: number;
}

export interface EdgeCondition {
  state_key: string;
  operator: ConditionOperator;
  value?: unknown;
  target: string;
}

export interface RouterNodeConfig {
  strategy?: RoutingStrategy;
  conditions?: EdgeCondition[];
  llm_prompt?: string | null;
  routes?: string[];
  default_route?: string;
}

export interface SubagentNodeConfig {
  agent_ref: string;
  input_mapping?: Record<string, string>;
  output_mapping?: Record<string, string>;
  inherit_context?: boolean;
  inherit_tools?: boolean;
  timeout_seconds?: number;
}

export interface ParallelNodeConfig {
  branches: string[];
  join_strategy?: JoinStrategy;
  wait_count?: number | null;
  merge_strategy?: MergeStrategy;
  merge_key?: string;
  timeout_seconds?: number;
}

export interface TransformNodeConfig {
  expression?: string | null;
  template?: string | null;
  output_key: string;
  input_keys?: string[];
}

export interface HumanNodeConfig {
  prompt_template: string;
  input_type?: HumanInputType;
  choices?: string[] | null;
  form_schema?: Record<string, unknown> | null;
  output_key?: string;
  timeout_seconds?: number | null;
}

// =============================================================================
// Graph Node Definition
// =============================================================================

export interface GraphNodeConfig {
  id: string;
  name: string;
  type: NodeType;
  description?: string | null;

  // Type-specific configurations (exactly one should be set based on type)
  llm_config?: LLMNodeConfig | null;
  tool_config?: ToolNodeConfig | null;
  router_config?: RouterNodeConfig | null;
  subagent_config?: SubagentNodeConfig | null;
  parallel_config?: ParallelNodeConfig | null;
  transform_config?: TransformNodeConfig | null;
  human_config?: HumanNodeConfig | null;

  // UI positioning for visual editor
  position?: { x: number; y: number } | null;

  // Error handling
  on_error?: ErrorHandling;
  retry_count?: number;
  fallback_node?: string | null;

  // Metadata
  tags?: string[];
}

// =============================================================================
// Graph Edge Definition
// =============================================================================

// v2 condition types (string-based)
export type ConditionType = "has_tool_calls" | "no_tool_calls";

export interface GraphEdgeConfig {
  from_node: string; // 'START' for entry point
  to_node: string; // 'END' for exit point
  // v1: EdgeCondition object, v2: ConditionType string or CustomCondition
  condition?: EdgeCondition | ConditionType | null;
  label?: string | null;
  priority?: number;
}

// =============================================================================
// Complete Graph Configuration
// =============================================================================

export interface GraphConfig {
  version?: string; // "1.0" or "2.0"

  // v1: State definition
  state_schema?: GraphStateSchema;

  // v2: Custom state fields (messages field is automatic)
  custom_state_fields?: Record<string, StateFieldSchema>;

  // Graph structure
  nodes: GraphNodeConfig[];
  edges: GraphEdgeConfig[];

  // Entry and exit
  entry_point?: string;
  exit_points?: string[];

  // v2: Tool configuration
  tool_config?: {
    tool_filter?: string[] | null;
    timeout_seconds?: number;
    max_parallel?: number;
  };

  // Reusable prompt templates
  prompt_templates?: Record<string, string>;

  // Component references
  imported_components?: string[];

  // Metadata
  metadata?: Record<string, unknown>;

  // Execution settings
  max_execution_time_seconds?: number;
  enable_checkpoints?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a default empty GraphConfig (v2)
 */
export function createEmptyGraphConfig(): GraphConfig {
  return {
    version: "2.0",
    nodes: [],
    edges: [],
    entry_point: "",
    metadata: {},
  };
}

/**
 * Create a default empty GraphConfig (v1 - legacy)
 */
export function createEmptyGraphConfigV1(): GraphConfig {
  return {
    version: "1.0",
    state_schema: { fields: {} },
    nodes: [],
    edges: [],
    entry_point: "",
    exit_points: ["END"],
    prompt_templates: {},
    metadata: {},
  };
}

/**
 * Create a default LLM node
 */
export function createDefaultLLMNode(
  id: string,
  name: string = "LLM Node",
): GraphNodeConfig {
  return {
    id,
    name,
    type: "llm",
    llm_config: {
      prompt_template: "{{ state.messages }}",
      output_key: "response",
      tools_enabled: true,
    },
  };
}

/**
 * Create a default Tool node
 */
export function createDefaultToolNode(
  id: string,
  name: string = "Tool Node",
): GraphNodeConfig {
  return {
    id,
    name,
    type: "tool",
    tool_config: {
      tool_name: "",
      output_key: "tool_result",
    },
  };
}

/**
 * Create a default Router node
 */
export function createDefaultRouterNode(
  id: string,
  name: string = "Router",
): GraphNodeConfig {
  return {
    id,
    name,
    type: "router",
    router_config: {
      strategy: "condition",
      conditions: [],
      default_route: "END",
    },
  };
}

/**
 * Validate a GraphConfig and return errors
 */
export function validateGraphConfig(config: GraphConfig): string[] {
  const errors: string[] = [];

  // Check that entry_point exists
  const nodeIds = new Set(config.nodes.map((n) => n.id));
  if (config.entry_point && !nodeIds.has(config.entry_point)) {
    errors.push(`Entry point '${config.entry_point}' not found in nodes`);
  }

  // Check that all edge references are valid
  const validRefs = new Set([...nodeIds, "START", "END"]);
  for (const edge of config.edges) {
    if (!validRefs.has(edge.from_node)) {
      errors.push(`Edge from_node '${edge.from_node}' not found`);
    }
    if (!validRefs.has(edge.to_node)) {
      errors.push(`Edge to_node '${edge.to_node}' not found`);
    }
  }

  // Check that each node has the correct config for its type
  for (const node of config.nodes) {
    switch (node.type) {
      case "llm":
        if (!node.llm_config) {
          errors.push(`Node '${node.id}' is type LLM but missing llm_config`);
        }
        break;
      case "tool":
        if (!node.tool_config) {
          errors.push(`Node '${node.id}' is type TOOL but missing tool_config`);
        }
        break;
      case "router":
        if (!node.router_config) {
          errors.push(
            `Node '${node.id}' is type ROUTER but missing router_config`,
          );
        }
        break;
      case "subagent":
        if (!node.subagent_config) {
          errors.push(
            `Node '${node.id}' is type SUBAGENT but missing subagent_config`,
          );
        }
        break;
      case "parallel":
        if (!node.parallel_config) {
          errors.push(
            `Node '${node.id}' is type PARALLEL but missing parallel_config`,
          );
        }
        break;
      case "transform":
        if (!node.transform_config) {
          errors.push(
            `Node '${node.id}' is type TRANSFORM but missing transform_config`,
          );
        }
        break;
      case "human":
        if (!node.human_config) {
          errors.push(
            `Node '${node.id}' is type HUMAN but missing human_config`,
          );
        }
        break;
    }
  }

  return errors;
}

/**
 * Get node type display info
 */
export function getNodeTypeInfo(type: NodeType): {
  label: string;
  description: string;
  color: string;
  icon: string;
} {
  const info: Record<
    NodeType,
    { label: string; description: string; color: string; icon: string }
  > = {
    llm: {
      label: "LLM",
      description: "AI reasoning and generation",
      color: "#8b5cf6", // violet
      icon: "sparkles",
    },
    tool: {
      label: "Tool",
      description: "Execute external tools",
      color: "#3b82f6", // blue
      icon: "wrench",
    },
    router: {
      label: "Router",
      description: "Conditional branching",
      color: "#f59e0b", // amber
      icon: "arrows-split",
    },
    subagent: {
      label: "Subagent",
      description: "Invoke nested agent",
      color: "#10b981", // emerald
      icon: "user-group",
    },
    transform: {
      label: "Transform",
      description: "Data transformation",
      color: "#6366f1", // indigo
      icon: "arrows-exchange",
    },
    parallel: {
      label: "Parallel",
      description: "Parallel execution",
      color: "#ec4899", // pink
      icon: "arrows-parallel",
    },
    human: {
      label: "Human",
      description: "Human-in-the-loop",
      color: "#14b8a6", // teal
      icon: "user",
    },
    component: {
      label: "Component",
      description: "Reusable component reference",
      color: "#059669", // emerald-600
      icon: "puzzle",
    },
  };

  return info[type];
}

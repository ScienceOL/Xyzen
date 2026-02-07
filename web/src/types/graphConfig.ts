/**
 * GraphConfig TypeScript Types (v3 Canonical Schema)
 *
 * These types mirror the backend canonical schema defined in:
 * service/app/schemas/graph_config.py
 *
 * The backend backfills all agents to v3 at startup and validates on read,
 * so the frontend always receives and produces v3 configs.
 */

// =============================================================================
// Enums
// =============================================================================

/** Supported executable node kinds. Matches backend GraphNodeKind. */
export type GraphNodeKind = "llm" | "tool" | "transform" | "component";

/** Supported state field types. */
export type StateFieldType =
  | "string"
  | "int"
  | "float"
  | "bool"
  | "list"
  | "dict"
  | "any";

/** Supported state reducers. */
export type StateReducerType = "replace" | "add_messages";

/** Built-in edge conditions. */
export type BuiltinEdgeCondition = "has_tool_calls" | "no_tool_calls";

/** Supported custom predicate operators. */
export type PredicateOperator = "eq" | "neq" | "truthy" | "falsy";

// =============================================================================
// State Schema Types
// =============================================================================

export interface StateFieldSchema {
  type: StateFieldType;
  description?: string | null;
  default?: unknown;
}

export interface GraphStateConfig {
  schema?: Record<string, StateFieldSchema>;
  reducers?: Record<string, StateReducerType>;
}

// =============================================================================
// Execution Limits
// =============================================================================

export interface GraphExecutionLimits {
  max_time_s: number;
  max_steps: number;
  max_concurrency: number;
}

// =============================================================================
// Dependencies
// =============================================================================

export interface ModelDependencyRef {
  key: string;
  provider?: string | null;
  version?: string | null;
}

export interface PromptDependencyRef {
  key: string;
  version?: string | null;
}

export interface ComponentDependencyRef {
  key: string;
  version?: string;
}

export interface GraphDeps {
  models?: ModelDependencyRef[];
  tools?: string[];
  prompts?: PromptDependencyRef[];
  components?: ComponentDependencyRef[];
}

// =============================================================================
// Metadata
// =============================================================================

export interface GraphMetadata {
  display_name?: string | null;
  description?: string | null;
  tags?: string[];
  agent_version?: string | null;
}

// =============================================================================
// Node Config Types
// =============================================================================

export interface LLMNodeConfig {
  prompt_template: string;
  output_key: string;
  model_override?: string | null;
  temperature_override?: number | null;
  max_tokens?: number | null;
  tools_enabled: boolean;
  tool_filter?: string[] | null;
  max_iterations: number;
  message_key?: string | null;
}

export interface ToolNodeConfig {
  execute_all: boolean;
  tool_filter?: string[] | null;
  output_key: string;
  timeout_seconds: number;
}

export interface TransformNodeConfig {
  template: string;
  output_key: string;
  input_keys: string[];
}

export interface ComponentReference {
  key: string;
  version: string;
}

export interface ComponentNodeConfig {
  component_ref: ComponentReference;
  config_overrides: Record<string, unknown>;
}

// =============================================================================
// Graph Node Definitions (Discriminated Union)
// =============================================================================

export interface GraphNodeBase {
  id: string;
  name: string;
  description?: string | null;
  reads: string[];
  writes: string[];
}

export interface LLMGraphNode extends GraphNodeBase {
  kind: "llm";
  config: LLMNodeConfig;
}

export interface ToolGraphNode extends GraphNodeBase {
  kind: "tool";
  config: ToolNodeConfig;
}

export interface TransformGraphNode extends GraphNodeBase {
  kind: "transform";
  config: TransformNodeConfig;
}

export interface ComponentGraphNode extends GraphNodeBase {
  kind: "component";
  config: ComponentNodeConfig;
}

export type GraphNodeConfig =
  | LLMGraphNode
  | ToolGraphNode
  | TransformGraphNode
  | ComponentGraphNode;

// =============================================================================
// Graph Edge Definition
// =============================================================================

export interface EdgePredicate {
  state_path: string;
  operator: PredicateOperator;
  value?: unknown;
}

export interface GraphEdgeConfig {
  from_node: string; // Node ID, "START" is NOT stored in v3 edges
  to_node: string; // Node ID or "END"
  when?: BuiltinEdgeCondition | EdgePredicate | null;
  priority?: number;
  label?: string | null;
}

// =============================================================================
// Graph IR (Executable Body)
// =============================================================================

export interface GraphIR {
  nodes: GraphNodeConfig[];
  edges: GraphEdgeConfig[];
  entrypoints: string[];
}

// =============================================================================
// Prompt Configuration Types
// =============================================================================

export interface IdentityConfig {
  name?: string;
  description?: string;
  persona?: string | null;
}

export interface BrandingConfig {
  mask_provider?: boolean;
  mask_model?: boolean;
  branded_name?: string;
  forbidden_reveals?: string[];
}

export interface SecurityConfig {
  injection_defense?: boolean;
  refuse_prompt_reveal?: boolean;
  refuse_instruction_override?: boolean;
  confidential_sections?: string[];
}

export interface SafetyConfig {
  content_safety?: boolean;
  refuse_illegal?: boolean;
  refuse_harmful?: boolean;
  refuse_explicit?: boolean;
  refuse_violence?: boolean;
  refuse_hate?: boolean;
  refuse_self_harm?: boolean;
}

export interface FormattingConfig {
  use_markdown?: boolean;
  code_blocks?: boolean;
  language_identifiers?: boolean;
  custom_blocks?: string[];
}

export interface ContextConfig {
  include_date?: boolean;
  include_time?: boolean;
  date_format?: string;
  custom_context?: string | null;
}

export interface OverridesConfig {
  meta_instruction?: string | null;
  persona_instruction?: string | null;
  tool_instruction?: string | null;
  format_instruction?: string | null;
}

export interface PromptConfig {
  version?: string;
  identity?: IdentityConfig;
  branding?: BrandingConfig;
  security?: SecurityConfig;
  safety?: SafetyConfig;
  formatting?: FormattingConfig;
  context?: ContextConfig;
  custom_instructions?: string | null;
  overrides?: OverridesConfig;
}

// =============================================================================
// Complete Graph Configuration (v3 Canonical)
// =============================================================================

export interface GraphConfig {
  schema_version: "3.0";
  key: string;
  revision: number;
  graph: GraphIR;
  state: GraphStateConfig;
  deps?: GraphDeps | null;
  limits: GraphExecutionLimits;
  prompt_config?: PromptConfig | null;
  metadata?: GraphMetadata | null;
  /** UI-only metadata ignored by the compiler (e.g., node positions). */
  ui?: Record<string, unknown> | null;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a default empty GraphConfig (v3 canonical).
 */
export function createEmptyGraphConfig(
  key: string = "custom_graph",
): GraphConfig {
  return {
    schema_version: "3.0",
    key,
    revision: 1,
    graph: {
      nodes: [],
      edges: [],
      entrypoints: [],
    },
    state: {},
    limits: { max_time_s: 300, max_steps: 128, max_concurrency: 10 },
  };
}

/**
 * Create a default LLM node.
 */
export function createDefaultLLMNode(
  id: string,
  name: string = "LLM Node",
): LLMGraphNode {
  return {
    id,
    name,
    kind: "llm",
    reads: ["messages"],
    writes: ["messages", "response"],
    config: {
      prompt_template: "",
      output_key: "response",
      tools_enabled: true,
      max_iterations: 10,
    },
  };
}

/**
 * Create a default Tool node.
 */
export function createDefaultToolNode(
  id: string,
  name: string = "Tool Node",
): ToolGraphNode {
  return {
    id,
    name,
    kind: "tool",
    reads: ["messages"],
    writes: ["tool_results"],
    config: {
      execute_all: true,
      output_key: "tool_results",
      timeout_seconds: 60,
    },
  };
}

/**
 * Create a default Transform node.
 */
export function createDefaultTransformNode(
  id: string,
  name: string = "Transform Node",
): TransformGraphNode {
  return {
    id,
    name,
    kind: "transform",
    reads: [],
    writes: ["output"],
    config: {
      template: "",
      output_key: "output",
      input_keys: [],
    },
  };
}

/**
 * Create a default Component node.
 */
export function createDefaultComponentNode(
  id: string,
  name: string = "Component Node",
): ComponentGraphNode {
  return {
    id,
    name,
    kind: "component",
    reads: [],
    writes: [],
    config: {
      component_ref: { key: "", version: "*" },
      config_overrides: {},
    },
  };
}

/**
 * Validate a GraphConfig and return errors.
 */
export function validateGraphConfig(config: GraphConfig): string[] {
  const errors: string[] = [];

  if (!config.graph) {
    errors.push("Missing 'graph' field");
    return errors;
  }

  const nodeIds = new Set(config.graph.nodes.map((n) => n.id));

  // Check entrypoints exist
  for (const ep of config.graph.entrypoints) {
    if (!nodeIds.has(ep)) {
      errors.push(`Entrypoint '${ep}' not found in nodes`);
    }
  }

  // Check edge references are valid
  const validRefs = new Set([...nodeIds, "END"]);
  for (const edge of config.graph.edges) {
    if (!nodeIds.has(edge.from_node)) {
      errors.push(`Edge from_node '${edge.from_node}' not found`);
    }
    if (!validRefs.has(edge.to_node)) {
      errors.push(`Edge to_node '${edge.to_node}' not found`);
    }
  }

  // Check each node has a valid kind
  const validKinds = new Set<string>(["llm", "tool", "transform", "component"]);
  for (const node of config.graph.nodes) {
    if (!validKinds.has(node.kind)) {
      errors.push(`Node '${node.id}' has invalid kind '${node.kind}'`);
    }
  }

  return errors;
}

/**
 * Get node kind display info.
 */
export function getNodeTypeInfo(kind: GraphNodeKind): {
  label: string;
  description: string;
  color: string;
  icon: string;
} {
  const info: Record<
    GraphNodeKind,
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
    transform: {
      label: "Transform",
      description: "Data transformation",
      color: "#6366f1", // indigo
      icon: "arrows-exchange",
    },
    component: {
      label: "Component",
      description: "Reusable component reference",
      color: "#059669", // emerald-600
      icon: "puzzle",
    },
  };

  return info[kind];
}

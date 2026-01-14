/**
 * Agent Config Mapper v2
 *
 * Provides bidirectional sync between simple agent configuration
 * (prompt, model, temperature, tools) and the full graph_config JSON.
 *
 * ARCHITECTURE NOTE:
 * - For NEW agents: Backend generates graph_config (single source of truth)
 * - For EDITING agents: Frontend uses these utilities to update existing graph_config
 * - For LEGACY agents (no graph_config): Frontend creates graph_config on first edit
 *
 * The backend's ReActAgent.export_graph_config() is the canonical source.
 * createGraphConfigFromSimple() here mirrors that v2 structure for legacy support.
 *
 * v2 Schema Changes:
 * - No separate router nodes (routing via conditional edges)
 * - Uses ConditionType enum ("has_tool_calls", "no_tool_calls")
 * - Simplified state schema (messages field is automatic)
 * - Tool nodes use execute_all instead of tool_name="__all__"
 */

import type {
  GraphConfig,
  GraphNodeConfig,
  LLMNodeConfig,
} from "@/types/graphConfig";

/**
 * Simple agent configuration that maps to user-facing form fields.
 * This is what users actually edit.
 */
export interface SimpleAgentConfig {
  prompt: string;
  model: string | null;
  temperature: number | null;
  toolsEnabled: boolean;
  maxIterations: number;
}

/**
 * Default values for simple config
 */
export const DEFAULT_SIMPLE_CONFIG: SimpleAgentConfig = {
  prompt: "You are a helpful assistant.",
  model: null,
  temperature: null,
  toolsEnabled: true,
  maxIterations: 10,
};

/**
 * Find the main LLM node in a graph config.
 * The main node is typically named "agent" or is the first LLM node.
 */
function findMainLLMNode(graphConfig: GraphConfig): GraphNodeConfig | null {
  if (!graphConfig.nodes) return null;

  // First try to find a node with id "agent" (standard react pattern)
  const agentNode = graphConfig.nodes.find(
    (n) => n.id === "agent" && n.type === "llm",
  );
  if (agentNode) return agentNode;

  // Fall back to first LLM node
  return graphConfig.nodes.find((n) => n.type === "llm") || null;
}

/**
 * Extract simple configuration from a graph_config.
 *
 * This reads the main LLM node's settings and converts them
 * to the simple format for display in the form.
 *
 * @param graphConfig - The full graph configuration (can be null)
 * @param fallbackPrompt - Fallback prompt if not found in graph_config
 * @returns Simple configuration for the form
 */
export function extractSimpleConfig(
  graphConfig: GraphConfig | null,
  fallbackPrompt?: string,
): SimpleAgentConfig {
  if (!graphConfig) {
    return {
      ...DEFAULT_SIMPLE_CONFIG,
      prompt: fallbackPrompt || DEFAULT_SIMPLE_CONFIG.prompt,
    };
  }

  const llmNode = findMainLLMNode(graphConfig);
  const llmConfig = llmNode?.llm_config;

  return {
    prompt:
      llmConfig?.prompt_template ||
      fallbackPrompt ||
      DEFAULT_SIMPLE_CONFIG.prompt,
    model: llmConfig?.model_override || null,
    temperature: llmConfig?.temperature_override ?? null,
    toolsEnabled: llmConfig?.tools_enabled ?? true,
    maxIterations: llmConfig?.max_iterations ?? 10,
  };
}

/**
 * Update a graph_config with values from simple config.
 *
 * This finds the main LLM node and updates its configuration
 * while preserving all other nodes and graph structure.
 *
 * @param graphConfig - The existing graph configuration
 * @param simple - The simple configuration from the form
 * @returns Updated graph configuration
 */
export function updateGraphConfigFromSimple(
  graphConfig: GraphConfig,
  simple: SimpleAgentConfig,
): GraphConfig {
  return {
    ...graphConfig,
    nodes: graphConfig.nodes.map((node) => {
      // Only update the main LLM node
      if (node.type === "llm" && node.id === "agent" && node.llm_config) {
        return {
          ...node,
          llm_config: {
            ...node.llm_config,
            prompt_template: simple.prompt,
            model_override: simple.model,
            temperature_override: simple.temperature,
            tools_enabled: simple.toolsEnabled,
            max_iterations: simple.maxIterations,
          } satisfies LLMNodeConfig,
        };
      }
      // For other LLM nodes (if any), just update the first one found
      if (node.type === "llm" && node.llm_config && node.id !== "agent") {
        const mainNode = findMainLLMNode(graphConfig);
        if (mainNode?.id === node.id) {
          return {
            ...node,
            llm_config: {
              ...node.llm_config,
              prompt_template: simple.prompt,
              model_override: simple.model,
              temperature_override: simple.temperature,
              tools_enabled: simple.toolsEnabled,
              max_iterations: simple.maxIterations,
            } satisfies LLMNodeConfig,
          };
        }
      }
      return node;
    }),
  };
}

/**
 * Create a default ReAct-style graph config from simple settings.
 *
 * NOTE: This is primarily for LEGACY agents that don't have graph_config.
 * For NEW agents, the backend generates graph_config using ReActAgent.export_graph_config().
 *
 * This function mirrors the v2 structure produced by the backend's ReActAgent
 * to ensure consistency when editing legacy agents.
 *
 * v2 Changes:
 * - No router node (routing via conditional edges)
 * - No state_schema (messages field is automatic)
 * - Tool node uses execute_all instead of tool_name="__all__"
 * - Edges use condition type strings instead of EdgeCondition objects
 *
 * @param simple - Simple configuration from the form
 * @returns Complete v2 graph configuration matching ReActAgent structure
 */
export function createGraphConfigFromSimple(
  simple: SimpleAgentConfig,
): GraphConfig {
  return {
    version: "2.0",
    nodes: [
      {
        id: "agent",
        name: "Agent",
        type: "llm",
        description:
          "Reasons about the task and decides whether to use tools or respond",
        llm_config: {
          prompt_template: simple.prompt,
          output_key: "response",
          tools_enabled: simple.toolsEnabled,
          model_override: simple.model,
          temperature_override: simple.temperature,
          max_iterations: simple.maxIterations,
        },
        position: { x: 250, y: 100 },
      },
      {
        id: "tools",
        name: "Execute Tools",
        type: "tool",
        description: "Executes tool calls from the agent",
        tool_config: {
          execute_all: true,
          output_key: "tool_results",
        },
        position: { x: 450, y: 250 },
      },
    ],
    edges: [
      { from_node: "START", to_node: "agent" },
      {
        from_node: "agent",
        to_node: "tools",
        condition: "has_tool_calls",
      },
      {
        from_node: "agent",
        to_node: "END",
        condition: "no_tool_calls",
      },
      { from_node: "tools", to_node: "agent" },
    ],
    entry_point: "agent",
    metadata: {
      pattern: "react",
      description: "ReAct agent with tool-calling loop",
      generated_from: "simple_config",
    },
  };
}

/**
 * Check if a graph_config uses the standard ReAct pattern.
 *
 * This helps determine if we can safely use the simple form
 * or if the user has customized the graph structure.
 *
 * Supports both v1 and v2 configs:
 * - v1: Has agent, tools, should_continue nodes
 * - v2: Has agent, tools nodes (no router node)
 *
 * @param graphConfig - The graph configuration to check
 * @returns true if it's a standard ReAct pattern
 */
export function isStandardReactPattern(
  graphConfig: GraphConfig | null,
): boolean {
  if (!graphConfig) return true; // No config = can use simple form

  const version = graphConfig.version || "1.0";
  const nodeIds = new Set(graphConfig.nodes?.map((n) => n.id) || []);

  if (version.startsWith("2.")) {
    // v2 pattern: agent + tools (no router)
    const hasV2StandardNodes = nodeIds.has("agent") && nodeIds.has("tools");
    const extraNodes = graphConfig.nodes?.filter(
      (n) => !["agent", "tools"].includes(n.id),
    );
    const hasExtraNodes = extraNodes && extraNodes.length > 0;
    const isMarkedAsReact = graphConfig.metadata?.pattern === "react";

    return (hasV2StandardNodes && !hasExtraNodes) || isMarkedAsReact;
  }

  // v1 pattern: agent + tools + should_continue
  const hasStandardNodes =
    nodeIds.has("agent") &&
    nodeIds.has("tools") &&
    nodeIds.has("should_continue");

  const extraNodes = graphConfig.nodes?.filter(
    (n) => !["agent", "tools", "should_continue"].includes(n.id),
  );
  const hasExtraNodes = extraNodes && extraNodes.length > 0;
  const isMarkedAsReact = graphConfig.metadata?.pattern === "react";

  return (hasStandardNodes && !hasExtraNodes) || isMarkedAsReact;
}

/**
 * Merge simple config changes into an existing agent.
 *
 * If the agent has no graph_config, creates one.
 * If it has one, updates the relevant fields.
 *
 * @param existingGraphConfig - Current graph_config (may be null)
 * @param simple - New simple configuration
 * @returns Updated or new graph configuration
 */
export function mergeSimpleConfigToGraphConfig(
  existingGraphConfig: GraphConfig | null,
  simple: SimpleAgentConfig,
): GraphConfig {
  if (!existingGraphConfig) {
    // Create new graph_config from simple settings
    return createGraphConfigFromSimple(simple);
  }

  // Update existing graph_config
  return updateGraphConfigFromSimple(existingGraphConfig, simple);
}

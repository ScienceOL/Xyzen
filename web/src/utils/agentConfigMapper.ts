/**
 * Agent Config Mapper (v3 Canonical Schema)
 *
 * Provides bidirectional sync between simple agent configuration
 * (prompt, model, temperature, tools) and the full v3 graph_config JSON.
 *
 * ARCHITECTURE NOTE:
 * - Backend backfills all agents to v3 at startup and validates on read.
 * - The frontend always receives and produces v3 configs.
 * - For NEW agents: Backend generates graph_config (single source of truth)
 * - For EDITING agents: Frontend uses these utilities to update existing graph_config
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
 * Find the main LLM node in a v3 graph config.
 * The main node is typically named "agent" or is the first LLM node.
 */
function findMainLLMNode(graphConfig: GraphConfig): GraphNodeConfig | null {
  const nodes = graphConfig.graph?.nodes;
  if (!nodes) return null;

  // First try to find a node with id "agent"
  const agentNode = nodes.find((n) => n.id === "agent" && n.kind === "llm");
  if (agentNode) return agentNode;

  // Fall back to first LLM node
  return nodes.find((n) => n.kind === "llm") || null;
}

/**
 * Extract simple configuration from a v3 graph_config.
 *
 * Reads the prompt from prompt_config.custom_instructions (preferred)
 * or falls back to the LLM node's config.prompt_template.
 * Other settings come from the main LLM node.
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
  const llmConfig = llmNode?.kind === "llm" ? llmNode.config : null;

  // Read prompt from prompt_config.custom_instructions (preferred)
  // Fall back to llm config.prompt_template
  const prompt =
    graphConfig.prompt_config?.custom_instructions ||
    llmConfig?.prompt_template ||
    fallbackPrompt ||
    DEFAULT_SIMPLE_CONFIG.prompt;

  return {
    prompt,
    model: llmConfig?.model_override || null,
    temperature: llmConfig?.temperature_override ?? null,
    toolsEnabled: llmConfig?.tools_enabled ?? true,
    maxIterations: llmConfig?.max_iterations ?? 10,
  };
}

/**
 * Update a v3 graph_config with values from simple config.
 *
 * Writes the prompt to prompt_config.custom_instructions and
 * updates the main LLM node's config settings.
 */
export function updateGraphConfigFromSimple(
  graphConfig: GraphConfig,
  simple: SimpleAgentConfig,
): GraphConfig {
  return {
    ...graphConfig,
    prompt_config: {
      ...graphConfig.prompt_config,
      custom_instructions: simple.prompt,
    },
    graph: {
      ...graphConfig.graph,
      nodes: graphConfig.graph.nodes.map((node) => {
        if (node.kind !== "llm") return node;

        // Only update the main LLM node
        const mainNode = findMainLLMNode(graphConfig);
        if (mainNode?.id !== node.id) return node;

        return {
          ...node,
          config: {
            ...node.config,
            model_override: simple.model,
            temperature_override: simple.temperature,
            tools_enabled: simple.toolsEnabled,
            max_iterations: simple.maxIterations,
          } satisfies LLMNodeConfig,
        };
      }),
    },
  };
}

/**
 * Create a default ReAct-style v3 graph config from simple settings.
 *
 * NOTE: This is primarily for LEGACY agents that don't have graph_config.
 * For NEW agents, the backend generates graph_config.
 */
export function createGraphConfigFromSimple(
  simple: SimpleAgentConfig,
): GraphConfig {
  return {
    schema_version: "3.0",
    key: "react",
    revision: 1,
    graph: {
      nodes: [
        {
          id: "agent",
          name: "Agent",
          kind: "llm",
          description:
            "Reasons about the task and decides whether to use tools or respond",
          reads: ["messages"],
          writes: ["messages", "response"],
          config: {
            prompt_template: "",
            output_key: "response",
            tools_enabled: simple.toolsEnabled,
            model_override: simple.model,
            temperature_override: simple.temperature,
            max_iterations: simple.maxIterations,
          },
        },
        {
          id: "tools",
          name: "Execute Tools",
          kind: "tool",
          description: "Executes tool calls from the agent",
          reads: ["messages"],
          writes: ["tool_results"],
          config: {
            execute_all: true,
            output_key: "tool_results",
            timeout_seconds: 60,
          },
        },
      ],
      edges: [
        {
          from_node: "agent",
          to_node: "tools",
          when: "has_tool_calls",
        },
        {
          from_node: "agent",
          to_node: "END",
          when: "no_tool_calls",
        },
        { from_node: "tools", to_node: "agent" },
      ],
      entrypoints: ["agent"],
    },
    state: {},
    limits: { max_time_s: 300, max_steps: 128, max_concurrency: 10 },
    prompt_config: {
      custom_instructions: simple.prompt,
    },
    metadata: {
      tags: ["react"],
      description: "ReAct agent with tool-calling loop",
    },
  };
}

/**
 * Check if a v3 graph_config uses the standard ReAct pattern.
 *
 * Helps determine if we can safely use the simple form
 * or if the user has customized the graph structure.
 */
export function isStandardReactPattern(
  graphConfig: GraphConfig | null,
): boolean {
  if (!graphConfig) return true; // No config = can use simple form

  // Check key or metadata tags
  if (graphConfig.key === "react") return true;
  if (graphConfig.metadata?.tags?.includes("react")) return true;

  // Check node structure
  const nodes = graphConfig.graph?.nodes;
  if (!nodes) return true;

  const nodeIds = new Set(nodes.map((n) => n.id));
  const hasStandardNodes = nodeIds.has("agent") && nodeIds.has("tools");
  const extraNodes = nodes.filter((n) => !["agent", "tools"].includes(n.id));
  const hasExtraNodes = extraNodes.length > 0;

  return hasStandardNodes && !hasExtraNodes;
}

/**
 * Merge simple config changes into an existing agent.
 *
 * If the agent has no graph_config, creates one.
 * If it has one, updates the relevant fields.
 */
export function mergeSimpleConfigToGraphConfig(
  existingGraphConfig: GraphConfig | null,
  simple: SimpleAgentConfig,
): GraphConfig {
  if (!existingGraphConfig) {
    return createGraphConfigFromSimple(simple);
  }
  return updateGraphConfigFromSimple(existingGraphConfig, simple);
}

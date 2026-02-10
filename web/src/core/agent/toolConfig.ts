/**
 * Tool configuration utilities for managing agent's graph_config node-level tool_filter
 *
 * In v3 GraphConfig, tool filters live on each LLM node's config.tool_filter,
 * not as a top-level tool_config.
 *
 * Tool filter semantics:
 * - null: All available tools are enabled
 * - []: No tools enabled
 * - ["web_search", "web_fetch"]: Only web search tools enabled (always bundled)
 */

import type { Agent } from "@/types/agents";

// Available builtin tool IDs
export const BUILTIN_TOOLS = {
  WEB_SEARCH: "web_search",
  WEB_FETCH: "web_fetch",
  KNOWLEDGE_LIST: "knowledge_list",
  KNOWLEDGE_READ: "knowledge_read",
  KNOWLEDGE_WRITE: "knowledge_write",
  KNOWLEDGE_SEARCH: "knowledge_search",
  GENERATE_IMAGE: "generate_image",
  READ_IMAGE: "read_image",
  MEMORY_SEARCH: "memory_search",
  LITERATURE_SEARCH: "literature_search",
} as const;

// Web search tools as a group (search + fetch always together)
export const WEB_SEARCH_TOOLS = [
  BUILTIN_TOOLS.WEB_SEARCH,
  BUILTIN_TOOLS.WEB_FETCH,
] as const;

// Knowledge tools as a group
export const KNOWLEDGE_TOOLS = [
  BUILTIN_TOOLS.KNOWLEDGE_LIST,
  BUILTIN_TOOLS.KNOWLEDGE_READ,
  BUILTIN_TOOLS.KNOWLEDGE_WRITE,
  BUILTIN_TOOLS.KNOWLEDGE_SEARCH,
] as const;

// All builtin tool IDs as array
export const ALL_BUILTIN_TOOL_IDS = [
  ...WEB_SEARCH_TOOLS,
  ...KNOWLEDGE_TOOLS,
  BUILTIN_TOOLS.GENERATE_IMAGE,
  BUILTIN_TOOLS.READ_IMAGE,
  BUILTIN_TOOLS.MEMORY_SEARCH,
  BUILTIN_TOOLS.LITERATURE_SEARCH,
];

// Image tools as a group
export const IMAGE_TOOLS = [
  BUILTIN_TOOLS.GENERATE_IMAGE,
  BUILTIN_TOOLS.READ_IMAGE,
] as const;

// v3 GraphConfig shape used for reading/writing tool_filter on LLM nodes
type GraphConfigV3 = {
  graph?: {
    nodes?: Array<{
      kind?: string;
      config?: { tool_filter?: string[] | null; [key: string]: unknown };
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

/**
 * Read tool_filter from the first LLM node in the graph config.
 */
function getLlmToolFilter(config: GraphConfigV3): string[] | null {
  const nodes = config.graph?.nodes;
  if (!nodes) return null;
  const llmNode = nodes.find((n) => n.kind === "llm");
  return llmNode?.config?.tool_filter ?? null;
}

/**
 * Deep-clone the config and set tool_filter on ALL LLM nodes.
 */
function withLlmToolFilter(
  config: GraphConfigV3,
  filter: string[] | null,
): Record<string, unknown> {
  const cloned = structuredClone(config) as GraphConfigV3;
  const nodes = cloned.graph?.nodes;
  if (nodes) {
    for (const node of nodes) {
      if (node.kind === "llm" && node.config) {
        node.config.tool_filter = filter;
      }
    }
  }
  return cloned as Record<string, unknown>;
}

/**
 * Get the current tool_filter from agent's graph_config
 */
export function getToolFilter(agent: Agent | null): string[] | null {
  if (!agent?.graph_config) return null;
  return getLlmToolFilter(agent.graph_config as GraphConfigV3);
}

/**
 * Check if a specific tool is enabled for the agent.
 * If tool_filter is null, all tools are enabled.
 */
export function isToolEnabled(agent: Agent | null, toolId: string): boolean {
  const filter = getToolFilter(agent);
  // null filter means all tools enabled
  if (filter === null) return true;
  return filter.includes(toolId);
}

/**
 * Check if web search tools are enabled (web_search + web_fetch)
 */
export function isWebSearchEnabled(agent: Agent | null): boolean {
  const filter = getToolFilter(agent);
  if (filter === null) return true;
  return WEB_SEARCH_TOOLS.some((toolId) => filter.includes(toolId));
}

/**
 * Check if knowledge tools are enabled
 */
export function isKnowledgeEnabled(agent: Agent | null): boolean {
  const filter = getToolFilter(agent);
  if (filter === null) return true;
  return KNOWLEDGE_TOOLS.some((toolId) => filter.includes(toolId));
}

/**
 * Create updated graph_config with tool enabled/disabled
 *
 * Semantics:
 * - From null (all enabled) + enable: keep null (already enabled)
 * - From null (all enabled) + disable: explicitly list all OTHER tools
 * - From explicit list + enable: add to list
 * - From explicit list + disable: remove from list
 */
export function updateToolFilter(
  agent: Agent,
  toolId: string,
  enabled: boolean,
): Record<string, unknown> {
  const currentConfig = (agent.graph_config ?? {}) as GraphConfigV3;
  const currentFilter = getLlmToolFilter(currentConfig);

  let newFilter: string[] | null;

  if (currentFilter === null || currentFilter === undefined) {
    // Currently all tools are enabled
    if (enabled) {
      // Already enabled, keep null
      newFilter = null;
    } else {
      // Disable this tool: need to explicitly list all OTHER builtin tools
      newFilter = ALL_BUILTIN_TOOL_IDS.filter((id) => id !== toolId);
    }
  } else {
    // Working with explicit filter
    if (enabled) {
      newFilter = currentFilter.includes(toolId)
        ? currentFilter
        : [...currentFilter, toolId];
    } else {
      newFilter = currentFilter.filter((id) => id !== toolId);
    }
  }

  return withLlmToolFilter(currentConfig, newFilter);
}

/**
 * Enable/disable all knowledge tools at once
 */
export function updateKnowledgeEnabled(
  agent: Agent,
  enabled: boolean,
): Record<string, unknown> {
  const currentConfig = (agent.graph_config ?? {}) as GraphConfigV3;
  const currentFilter = getLlmToolFilter(currentConfig);

  let newFilter: string[] | null;

  if (currentFilter === null || currentFilter === undefined) {
    // Currently all enabled
    if (enabled) {
      // Already enabled, keep null
      newFilter = null;
    } else {
      // Disable knowledge: list all tools EXCEPT knowledge ones
      newFilter = ALL_BUILTIN_TOOL_IDS.filter(
        (id) =>
          !KNOWLEDGE_TOOLS.includes(id as (typeof KNOWLEDGE_TOOLS)[number]),
      );
    }
  } else {
    // Working with explicit filter
    if (enabled) {
      const existing = new Set(currentFilter);
      KNOWLEDGE_TOOLS.forEach((toolId) => existing.add(toolId));
      newFilter = Array.from(existing);
    } else {
      newFilter = currentFilter.filter(
        (id) =>
          !KNOWLEDGE_TOOLS.includes(id as (typeof KNOWLEDGE_TOOLS)[number]),
      );
    }
  }

  return withLlmToolFilter(currentConfig, newFilter);
}

/**
 * Enable/disable all web search tools at once (web_search + web_fetch)
 */
export function updateWebSearchEnabled(
  agent: Agent,
  enabled: boolean,
): Record<string, unknown> {
  const currentConfig = (agent.graph_config ?? {}) as GraphConfigV3;
  const currentFilter = getLlmToolFilter(currentConfig);

  let newFilter: string[] | null;

  if (currentFilter === null || currentFilter === undefined) {
    // Currently all enabled
    if (enabled) {
      // Already enabled, keep null
      newFilter = null;
    } else {
      // Disable web search: list all tools EXCEPT web search ones
      newFilter = ALL_BUILTIN_TOOL_IDS.filter(
        (id) =>
          !WEB_SEARCH_TOOLS.includes(id as (typeof WEB_SEARCH_TOOLS)[number]),
      );
    }
  } else {
    // Working with explicit filter
    if (enabled) {
      const existing = new Set(currentFilter);
      WEB_SEARCH_TOOLS.forEach((toolId) => existing.add(toolId));
      newFilter = Array.from(existing);
    } else {
      newFilter = currentFilter.filter(
        (id) =>
          !WEB_SEARCH_TOOLS.includes(id as (typeof WEB_SEARCH_TOOLS)[number]),
      );
    }
  }

  return withLlmToolFilter(currentConfig, newFilter);
}

/**
 * Check if image tools are enabled
 */
export function isImageEnabled(agent: Agent | null): boolean {
  const filter = getToolFilter(agent);
  if (filter === null) return true;
  return IMAGE_TOOLS.some((toolId) => filter.includes(toolId));
}

/**
 * Enable/disable all image tools at once
 */
export function updateImageEnabled(
  agent: Agent,
  enabled: boolean,
): Record<string, unknown> {
  const currentConfig = (agent.graph_config ?? {}) as GraphConfigV3;
  const currentFilter = getLlmToolFilter(currentConfig);

  let newFilter: string[] | null;

  if (currentFilter === null || currentFilter === undefined) {
    // Currently all enabled
    if (enabled) {
      // Already enabled, keep null
      newFilter = null;
    } else {
      // Disable image: list all tools EXCEPT image ones
      newFilter = ALL_BUILTIN_TOOL_IDS.filter(
        (id) => !IMAGE_TOOLS.includes(id as (typeof IMAGE_TOOLS)[number]),
      );
    }
  } else {
    // Working with explicit filter
    if (enabled) {
      const existing = new Set(currentFilter);
      IMAGE_TOOLS.forEach((toolId) => existing.add(toolId));
      newFilter = Array.from(existing);
    } else {
      newFilter = currentFilter.filter(
        (id) => !IMAGE_TOOLS.includes(id as (typeof IMAGE_TOOLS)[number]),
      );
    }
  }

  return withLlmToolFilter(currentConfig, newFilter);
}

/**
 * Check if memory search is enabled
 */
export function isMemoryEnabled(agent: Agent | null): boolean {
  return isToolEnabled(agent, BUILTIN_TOOLS.MEMORY_SEARCH);
}

/**
 * Enable/disable memory search
 */
export function updateMemoryEnabled(
  agent: Agent,
  enabled: boolean,
): Record<string, unknown> {
  return updateToolFilter(agent, BUILTIN_TOOLS.MEMORY_SEARCH, enabled);
}

/**
 * Check if literature search is enabled
 */
export function isLiteratureSearchEnabled(agent: Agent | null): boolean {
  return isToolEnabled(agent, BUILTIN_TOOLS.LITERATURE_SEARCH);
}

/**
 * Enable/disable literature search
 */
export function updateLiteratureSearchEnabled(
  agent: Agent,
  enabled: boolean,
): Record<string, unknown> {
  return updateToolFilter(agent, BUILTIN_TOOLS.LITERATURE_SEARCH, enabled);
}

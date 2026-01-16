/**
 * Tool configuration utilities for managing agent's graph_config.tool_config.tool_filter
 *
 * Tool filter semantics:
 * - null: All available tools are enabled
 * - []: No tools enabled
 * - ["web_search"]: Only web_search enabled
 */

import type { Agent } from "@/types/agents";

// Available builtin tool IDs
export const BUILTIN_TOOLS = {
  WEB_SEARCH: "web_search",
  KNOWLEDGE_LIST: "knowledge_list",
  KNOWLEDGE_READ: "knowledge_read",
  KNOWLEDGE_WRITE: "knowledge_write",
  KNOWLEDGE_SEARCH: "knowledge_search",
  GENERATE_IMAGE: "generate_image",
  READ_IMAGE: "read_image",
  MEMORY_SEARCH: "memory_search",
} as const;

// All builtin tool IDs as array
export const ALL_BUILTIN_TOOL_IDS = [
  BUILTIN_TOOLS.WEB_SEARCH,
  ...Object.values(BUILTIN_TOOLS).filter((id) => id.startsWith("knowledge_")),
  BUILTIN_TOOLS.GENERATE_IMAGE,
  BUILTIN_TOOLS.READ_IMAGE,
  BUILTIN_TOOLS.MEMORY_SEARCH,
];

// Knowledge tools as a group
export const KNOWLEDGE_TOOLS = [
  BUILTIN_TOOLS.KNOWLEDGE_LIST,
  BUILTIN_TOOLS.KNOWLEDGE_READ,
  BUILTIN_TOOLS.KNOWLEDGE_WRITE,
  BUILTIN_TOOLS.KNOWLEDGE_SEARCH,
] as const;

// Image tools as a group
export const IMAGE_TOOLS = [
  BUILTIN_TOOLS.GENERATE_IMAGE,
  BUILTIN_TOOLS.READ_IMAGE,
] as const;

type GraphConfig = {
  version?: string;
  tool_config?: {
    tool_filter?: string[] | null;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

/**
 * Get the current tool_filter from agent's graph_config
 */
export function getToolFilter(agent: Agent | null): string[] | null {
  if (!agent?.graph_config) return null;
  const config = agent.graph_config as GraphConfig;
  return config.tool_config?.tool_filter ?? null;
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
 * Check if web search is enabled
 */
export function isWebSearchEnabled(agent: Agent | null): boolean {
  return isToolEnabled(agent, BUILTIN_TOOLS.WEB_SEARCH);
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
  const currentConfig = (agent.graph_config ?? {}) as GraphConfig;
  const currentFilter = currentConfig.tool_config?.tool_filter;

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

  return {
    ...currentConfig,
    tool_config: {
      ...currentConfig.tool_config,
      tool_filter: newFilter,
    },
  };
}

/**
 * Enable/disable all knowledge tools at once
 */
export function updateKnowledgeEnabled(
  agent: Agent,
  enabled: boolean,
): Record<string, unknown> {
  const currentConfig = (agent.graph_config ?? {}) as GraphConfig;
  const currentFilter = currentConfig.tool_config?.tool_filter;

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

  return {
    ...currentConfig,
    tool_config: {
      ...currentConfig.tool_config,
      tool_filter: newFilter,
    },
  };
}

/**
 * Enable/disable web search
 */
export function updateWebSearchEnabled(
  agent: Agent,
  enabled: boolean,
): Record<string, unknown> {
  return updateToolFilter(agent, BUILTIN_TOOLS.WEB_SEARCH, enabled);
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
  const currentConfig = (agent.graph_config ?? {}) as GraphConfig;
  const currentFilter = currentConfig.tool_config?.tool_filter;

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

  return {
    ...currentConfig,
    tool_config: {
      ...currentConfig.tool_config,
      tool_filter: newFilter,
    },
  };
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

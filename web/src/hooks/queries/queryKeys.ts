/**
 * Centralized query key factory for TanStack Query
 *
 * Using a factory pattern ensures consistent query keys across the app
 * and enables proper cache invalidation.
 *
 * @see https://tanstack.com/query/latest/docs/react/guides/query-keys
 */

export const queryKeys = {
  /**
   * Session-related query keys
   */
  sessions: {
    all: ["sessions"] as const,
    list: () => [...queryKeys.sessions.all, "list"] as const,
    detail: (id: string) => [...queryKeys.sessions.all, "detail", id] as const,
  },

  /**
   * Topic-related query keys
   */
  topics: {
    all: ["topics"] as const,
    detail: (topicId: string) =>
      [...queryKeys.topics.all, "detail", topicId] as const,
    messages: (topicId: string) =>
      [...queryKeys.topics.all, topicId, "messages"] as const,
  },

  /**
   * Provider-related query keys
   */
  providers: {
    all: ["providers"] as const,
    my: () => [...queryKeys.providers.all, "my"] as const,
    templates: () => [...queryKeys.providers.all, "templates"] as const,
    models: () => [...queryKeys.providers.all, "models"] as const,
    defaultConfig: () => [...queryKeys.providers.all, "defaultConfig"] as const,
  },

  /**
   * Agent-related query keys
   */
  agents: {
    all: ["agents"] as const,
    list: () => [...queryKeys.agents.all, "list"] as const,
    detail: (id: string) => [...queryKeys.agents.all, "detail", id] as const,
  },

  /**
   * Knowledge-related query keys
   */
  knowledge: {
    all: ["knowledge"] as const,
    folders: () => [...queryKeys.knowledge.all, "folders"] as const,
    files: (folderId: string) =>
      [...queryKeys.knowledge.all, "files", folderId] as const,
  },

  /**
   * MCP (Model Context Protocol) related query keys
   */
  mcp: {
    all: ["mcp"] as const,
    servers: () => [...queryKeys.mcp.all, "servers"] as const,
    tools: (serverId: string) =>
      [...queryKeys.mcp.all, "tools", serverId] as const,
  },
} as const;

/**
 * Type helper to extract query key types
 */
export type QueryKeys = typeof queryKeys;

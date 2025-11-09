/**
 * Smithery Marketplace Types
 * Maps the Smithery Registry OpenAPI shapes used by our UI
 */

export interface SmitheryServerItem {
  qualifiedName: string; // e.g. "smithery/hello-world"
  displayName: string | null;
  description: string | null;
  iconUrl: string | null;
  verified: boolean;
  useCount: number;
  remote: boolean;
  createdAt: string; // ISO
  homepage: string; // https://smithery.ai/server/{qualifiedName}
}

export interface SmitheryPagination {
  currentPage: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
}

export interface SmitheryServersListResponse {
  servers: SmitheryServerItem[];
  pagination: SmitheryPagination;
}

export interface SmitheryServersQuery {
  q?: string; // semantic search and filters (owner:, repo:, is:deployed, is:verified)
  profile?: string; // profile id
  page?: number; // default 1
  pageSize?: number; // default 10
}

// ---- Detail Types ----

export interface SmitheryToolAnnotations {
  readOnlyHint?: boolean;
  idempotentHint?: boolean;
  destructiveHint?: boolean;
  [key: string]: unknown;
}

export interface SmitheryTool {
  name: string;
  description: string | null;
  inputSchema: Record<string, unknown>; // JSON Schema
  annotations?: SmitheryToolAnnotations;
}

export interface SmitheryConnection {
  type: string; // e.g. http / stdio
  deploymentUrl?: string; // sometimes 'url'
  url?: string; // fallback field name
  configSchema?: Record<string, unknown>;
}

export interface SmitherySecurityInfo {
  scanPassed: boolean;
  [key: string]: unknown;
}

export interface SmitheryServerDetail {
  qualifiedName: string;
  displayName: string;
  description: string;
  iconUrl: string | null;
  remote: boolean;
  deploymentUrl: string | null;
  connections: SmitheryConnection[];
  security: SmitherySecurityInfo | null;
  tools: SmitheryTool[] | null;
}

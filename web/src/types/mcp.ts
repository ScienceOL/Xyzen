export interface McpServer {
  id: string;
  name: string;
  description?: string;
  url: string;
  token: string;
  status: "online" | "offline" | string;
  tools?: { name: string; description?: string }[];
  user_id: string;
}

/**
 * 内置 MCP Server 数据
 */
export interface BuiltinMcpData {
  name: string;
  module_name: string;
  mount_path: string;
  description: string;
  is_builtin: true;
  requires_auth: boolean;
  is_default?: boolean;
  banner?: string;
  category?: "search" | "capability" | "knowledge" | "integration" | "general";
}

/**
 * Bohrium MCP Server 数据
 */
export interface BohriumMcpData {
  id: number;
  appKey: string;
  appUuid: string;
  title: string;
  description: string;
  descriptionCn: string;
  cover: string;
  type: number;
  subscribeNum: number;
  accessNum: number;
  tags?: Array<{
    id: number;
    name: string;
    theme: string;
  }>;
  latestDeploymentId?: number;
}

/**
 * 可探索的 MCP Server（统一类型）
 */
/**
 * Smithery MCP Server 数据（精简展示字段）
 */
export interface SmitheryMcpData {
  qualifiedName: string;
  displayName: string | null;
  description: string | null;
  iconUrl: string | null;
  verified: boolean;
  useCount: number;
  remote: boolean;
  createdAt: string;
  homepage: string;
}

export interface ExplorableMcpServer<
  T = BuiltinMcpData | BohriumMcpData | SmitheryMcpData,
> {
  id: string; // 唯一标识符
  name: string; // 显示名称
  description: string; // 描述
  source: "official" | "bohrium" | "smithery" | string; // 来源
  cover?: string; // 封面图片
  data: T; // 原始数据
}

// 类型守卫
export function isBuiltinMcp(
  server: ExplorableMcpServer,
): server is ExplorableMcpServer<BuiltinMcpData> {
  return server.source === "official";
}

export function isBohriumMcp(
  server: ExplorableMcpServer,
): server is ExplorableMcpServer<BohriumMcpData> {
  return server.source === "bohrium";
}

export function isSmitheryMcp(
  server: ExplorableMcpServer,
): server is ExplorableMcpServer<SmitheryMcpData> {
  return server.source === "smithery";
}

// 为了向后兼容，保留旧名称作为类型别名
/** @deprecated Use ExplorableMcpServer instead */
export type BuiltinMcpServer = ExplorableMcpServer<BuiltinMcpData>;

export type McpServerCreate = Omit<
  McpServer,
  "id" | "status" | "tools" | "user_id"
>;

export type McpServerUpdate = Partial<
  Omit<McpServer, "id" | "tools" | "user_id">
>;

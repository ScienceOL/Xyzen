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

export interface BuiltinMcpServer {
  name: string;
  module_name: string;
  mount_path: string;
  description: string;
  is_builtin: boolean;
  requires_auth: boolean;
  is_default?: boolean;
}

export type McpServerCreate = Omit<
  McpServer,
  "id" | "status" | "tools" | "user_id"
>;

export type McpServerUpdate = Partial<
  Omit<McpServer, "id" | "tools" | "user_id">
>;

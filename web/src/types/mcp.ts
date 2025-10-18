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

export type McpServerCreate = Omit<
  McpServer,
  "id" | "status" | "tools" | "user_id"
>;

export type McpServerUpdate = Partial<
  Omit<McpServer, "id" | "tools" | "user_id">
>;

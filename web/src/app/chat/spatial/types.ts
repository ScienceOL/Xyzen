export interface AgentData {
  name: string;
  role: string;
  desc: string;
  avatar: string;
  status: "idle" | "busy" | "offline";
  size: "large" | "medium" | "small";
}

export interface AgentNodeData extends AgentData {
  onFocus: (id: string) => void;
}

// XYFlow requires node.data to be a Record
export type FlowAgentNodeData = AgentNodeData & Record<string, unknown>;

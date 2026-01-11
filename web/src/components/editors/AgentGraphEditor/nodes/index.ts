export { default as BaseAgentNode } from "./BaseAgentNode";
export { default as StartNode } from "./StartNode";
export { default as EndNode } from "./EndNode";

// Node types registry for React Flow
import BaseAgentNode from "./BaseAgentNode";
import StartNode from "./StartNode";
import EndNode from "./EndNode";

export const nodeTypes = {
  agentNode: BaseAgentNode,
  startNode: StartNode,
  endNode: EndNode,
};

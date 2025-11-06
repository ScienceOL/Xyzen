import { useXyzen } from "@/store";

const AgentExploreTab: React.FC = () => {
  const { agents } = useXyzen();
  const count = agents.filter((a) => a.agent_type === "graph").length;
  return (
    <span className="flex items-center justify-center gap-2">
      <span>🤖</span>
      <span>Graph Agents</span>
      {count !== undefined && (
        <span className="ml-1 rounded-sm bg-neutral-200 dark:bg-neutral-700 px-2 py-0.5 text-xs font-medium">
          {count}
        </span>
      )}
    </span>
  );
};

export default AgentExploreTab;

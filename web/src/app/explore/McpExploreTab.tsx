import { useXyzen } from "@/store";

const McpExploreTab: React.FC = () => {
  const { builtinMcpServers } = useXyzen();
  const count = builtinMcpServers.length;
  return (
    <span className="flex items-center justify-center gap-2">
      <span>🏪</span>
      <span>MCP Market</span>
      {count !== undefined && (
        <span className="ml-1 rounded-sm bg-neutral-200 dark:bg-neutral-700 px-2 py-0.5 text-xs font-medium">
          {count}
        </span>
      )}
    </span>
  );
};

export default McpExploreTab;

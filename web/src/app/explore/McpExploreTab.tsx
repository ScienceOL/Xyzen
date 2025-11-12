import { useXyzen } from "@/store";

const McpExploreTab: React.FC = () => {
  const { builtinMcpServers } = useXyzen();
  const count = builtinMcpServers.length;
  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 flex-wrap">
      <div className="flex items-center justify-center gap-2 sm:gap-3 whitespace-nowrap">
        <span className="flex items-center justify-center gap-2">
          <span className="text-lg sm:text-xl">🏪</span>
          <span className="text-sm sm:text-base font-medium">MCP Market</span>
          {count !== undefined && (
            <span className="rounded-sm bg-neutral-200 dark:bg-neutral-700 px-2 py-0.5 text-xs font-medium">
              {count}
            </span>
          )}
        </span>
      </div>
    </div>
  );
};

export default McpExploreTab;

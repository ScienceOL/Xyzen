"use client";
import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsHighlight,
  TabsHighlightItem,
  TabsList,
  TabsTrigger,
} from "@/components/animate-ui/primitives/radix/tabs";
import { useXyzen } from "@/store";
import { useEffect } from "react";
import AgentExploreContent from "./AgentExploreContent";
import AgentExploreTab from "./AgentExploreTab";
import McpExploreContent from "./McpExploreContent";
import McpExploreTab from "./McpExploreTab";

export default function Explorer() {
  const { fetchAgents, user, backendUrl, fetchBuiltinMcpServers } = useXyzen();

  useEffect(() => {
    if (user && backendUrl) {
      fetchAgents();
      fetchBuiltinMcpServers();
    }
  }, [fetchAgents, fetchBuiltinMcpServers, user, backendUrl]);

  const tabStructure = [
    {
      value: "agents",
      label: "Graph Agents",
      component: AgentExploreTab,
      content: AgentExploreContent,
    },
    {
      value: "mcp",
      label: "MCP Market",
      component: McpExploreTab,
      content: McpExploreContent,
    },
  ];

  return (
    <div className="flex flex-col">
      <Tabs defaultValue="agents" className="flex flex-col">
        {/* Header with Tabs */}
        <div className="border-b border-neutral-200 dark:border-neutral-800 bg-gradient-to-r from-white to-neutral-50 dark:from-neutral-950 dark:to-neutral-900">
          <div className="px-6 pt-6 pb-4">
            {/* Tab Navigation */}
            <TabsHighlight className="bg-white dark:bg-neutral-800 absolute z-0 inset-0 rounded-sm shadow-sm">
              <TabsList className="h-14 inline-flex w-full p-1.5 bg-neutral-50 dark:bg-neutral-900 rounded-sm relative">
                {tabStructure.map((tab) => (
                  <TabsHighlightItem value={tab.value} className="flex-1">
                    <TabsTrigger
                      value={tab.value}
                      className="h-full px-4 py-2 w-full text-sm font-semibold text-neutral-700 data-[state=active]:text-indigo-600 dark:text-neutral-300 dark:data-[state=active]:text-indigo-400 relative z-10 transition-all"
                    >
                      <tab.component />
                    </TabsTrigger>
                  </TabsHighlightItem>
                ))}
              </TabsList>
            </TabsHighlight>
          </div>
        </div>

        {/* Content */}
        <TabsContents mode="auto-height" className="custom-scrollbar">
          {tabStructure.map((tab) => (
            <TabsContent key={tab.value} value={tab.value}>
              <tab.content />
            </TabsContent>
          ))}
        </TabsContents>
      </Tabs>
    </div>
  );
}

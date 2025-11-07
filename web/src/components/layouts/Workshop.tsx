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
import { Badge } from "@/components/base/Badge";
import { useXyzen } from "@/store";
import {
  EyeIcon,
  EyeSlashIcon,
  PlayIcon,
  StopIcon,
} from "@heroicons/react/24/outline";
import { motion } from "framer-motion";
import { useEffect } from "react";
import WorkshopChat from "./WorkshopChat";

export default function Workshop() {
  const {
    layoutStyle,
    agents,
    fetchAgents,
    toggleGraphAgentPublish,
    user,
    backendUrl,
    fetchWorkshopHistory,
  } = useXyzen();

  // Filter to show only user's graph agents (both published and unpublished)
  const userGraphAgents = agents.filter(
    (agent) => agent.agent_type === "graph" && agent.user_id === user?.id,
  );

  useEffect(() => {
    if (user && backendUrl) {
      fetchAgents();
    }
  }, [fetchAgents, user, backendUrl]);

  // Fetch workshop history when component mounts
  useEffect(() => {
    if (user && backendUrl) {
      fetchWorkshopHistory();
    }
  }, [fetchWorkshopHistory, user, backendUrl]);

  const handleTogglePublish = async (agentId: string) => {
    try {
      await toggleGraphAgentPublish(agentId);
    } catch (error) {
      console.error("Failed to toggle publish status:", error);
    }
  };

  if (layoutStyle === "fullscreen") {
    // Fullscreen: Empty workshop area (chat is handled by AppFullscreen.tsx)
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🛠️</div>
          <h3 className="text-lg font-semibold text-neutral-800 dark:text-white mb-2">
            Workshop
          </h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Workshop area
          </p>
        </div>
      </div>
    );
  }

  // Sidebar: Workshop view with integrated chat
  return (
    <div className="h-full flex flex-col">
      <Tabs defaultValue="tools" className="h-full flex flex-col">
        {/* Tab Navigation */}
        <div className="border-b border-neutral-200 dark:border-neutral-800">
          <TabsHighlight className="bg-neutral-50 dark:bg-neutral-900 absolute z-0 inset-0">
            <TabsList className="h-12 inline-flex w-full px-4 bg-white dark:bg-neutral-950 relative">
              <TabsHighlightItem value="tools" className="flex-1">
                <TabsTrigger
                  value="tools"
                  className="h-full px-4 py-2 w-full text-sm font-medium text-neutral-600 data-[state=active]:text-neutral-900 dark:text-neutral-400 dark:data-[state=active]:text-white relative z-10"
                >
                  🛠️ Workshop Tools
                </TabsTrigger>
              </TabsHighlightItem>
              <TabsHighlightItem value="chat" className="flex-1">
                <TabsTrigger
                  value="chat"
                  className="h-full px-4 py-2 w-full text-sm font-medium text-neutral-600 data-[state=active]:text-neutral-900 dark:text-neutral-400 dark:data-[state=active]:text-white relative z-10"
                >
                  💬 Workshop Chat
                </TabsTrigger>
              </TabsHighlightItem>
            </TabsList>
          </TabsHighlight>
        </div>

        {/* Tab Contents */}
        <TabsContents mode="auto-height" className="flex-1 overflow-hidden">
          <TabsContent value="tools" className="h-full">
            <div className="h-full flex">
              {/* Left: Workshop Tools - User Graph Agents */}
              <div className="w-80 flex-shrink-0 border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950 flex flex-col">
                <div className="border-b border-neutral-200 p-4 dark:border-neutral-800 flex-shrink-0">
                  <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
                    My Graph Agents
                  </h2>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    Manage your graph agents and publish them
                  </p>
                </div>

                {/* User Graph Agents List */}
                <div className="flex-1 overflow-y-auto p-4">
                  {userGraphAgents.length === 0 ? (
                    <div className="flex h-full items-center justify-center">
                      <div className="text-center">
                        <div className="text-4xl mb-3">📊</div>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                          No graph agents yet
                        </p>
                        <p className="text-xs text-neutral-400 dark:text-neutral-500">
                          Create graph agents using MCP tools
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {userGraphAgents.map((agent) => (
                        <motion.div
                          key={agent.id}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="group relative rounded-sm border border-neutral-200 bg-white p-3 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-medium text-neutral-800 dark:text-white truncate mb-1">
                                {agent.name}
                              </h3>
                              <div className="flex items-center gap-2 flex-wrap">
                                {agent.is_published ? (
                                  <Badge variant="green" className="text-xs">
                                    <EyeIcon className="h-3 w-3 mr-1" />
                                    Published
                                  </Badge>
                                ) : (
                                  <Badge variant="gray" className="text-xs">
                                    <EyeSlashIcon className="h-3 w-3 mr-1" />
                                    Private
                                  </Badge>
                                )}
                                {agent.is_active ? (
                                  <Badge
                                    variant="green"
                                    className="flex items-center gap-1 text-xs"
                                  >
                                    <PlayIcon className="h-3 w-3" />
                                    Active
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="yellow"
                                    className="flex items-center gap-1 text-xs"
                                  >
                                    <StopIcon className="h-3 w-3" />
                                    Building
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>

                          <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2 mb-2">
                            {agent.description}
                          </p>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
                              <span>📊 {agent.node_count || 0} nodes</span>
                              <span>🔗 {agent.edge_count || 0} edges</span>
                            </div>

                            <button
                              onClick={() => handleTogglePublish(agent.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity rounded-sm p-1.5 text-neutral-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:text-purple-400 dark:hover:bg-purple-900/20"
                              title={
                                agent.is_published ? "Make Private" : "Publish"
                              }
                            >
                              {agent.is_published ? (
                                <EyeSlashIcon className="h-4 w-4" />
                              ) : (
                                <EyeIcon className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Empty space for tools view */}
              <div className="flex-1 bg-white dark:bg-black flex items-center justify-center">
                <div className="text-center">
                  <div className="text-6xl mb-4">🎨</div>
                  <h3 className="text-lg font-semibold text-neutral-800 dark:text-white mb-2">
                    Agent Designer
                  </h3>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Design area
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="chat" className="h-full">
            <div className="h-full bg-white dark:bg-black">
              <WorkshopChat />
            </div>
          </TabsContent>
        </TabsContents>
      </Tabs>
    </div>
  );
}

import { LoadingSpinner } from "@/components/base/LoadingSpinner";
import { EditMcpServerModal } from "@/components/modals/EditMcpServerModal";
import { ToolTestModal } from "@/components/modals/ToolTestModal";
import { websocketService } from "@/service/websocketService";
import { useXyzen } from "@/store";
import type { McpServer } from "@/types/mcp";
import { Button } from "@headlessui/react";
import {
  ArrowPathIcon,
  ChevronRightIcon,
  CommandLineIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  ServerStackIcon,
  TrashIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

interface ServerStatusIndicatorProps {
  status: "online" | "offline" | string;
}

const ServerStatusIndicator: React.FC<ServerStatusIndicatorProps> = ({
  status,
}) => {
  const isOnline = status === "online";
  return (
    <div className="flex items-center">
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          isOnline ? "bg-green-500" : "bg-red-500"
        }`}
      />
      <span
        className={`ml-2 text-xs font-medium transition-colors duration-200 ${
          isOnline
            ? "text-green-700 dark:text-green-300"
            : "text-red-700 dark:text-red-300"
        }`}
      >
        {isOnline ? "Online" : "Offline"}
      </span>
    </div>
  );
};

interface McpServerCardProps {
  server: McpServer;
  onRemove: (id: string) => void;
  onEdit: (server: McpServer) => void;
  onTestTool: (
    server: McpServer,
    toolName: string,
    toolDescription?: string,
  ) => void;
}

const McpServerCard: React.FC<McpServerCardProps> = ({
  server,
  onRemove,
  onEdit,
  onTestTool,
}) => {
  const toolCount = server.tools?.length || 0;
  const [isRemoving, setIsRemoving] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      await onRemove(server.id);
    } catch (error) {
      setIsRemoving(false);
      console.error("Failed to remove server:", error);
    }
  };

  const handleToggleExpand = () => {
    if (toolCount > 0) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2 }}
      className="group relative overflow-hidden rounded-xl border border-neutral-200/50 bg-white/50 shadow-sm backdrop-blur-sm transition-all duration-300 hover:border-indigo-200 hover:bg-white/80 hover:shadow-md dark:border-neutral-800/50 dark:bg-neutral-900/50 dark:hover:border-indigo-800 dark:hover:bg-neutral-900/80"
    >
      <div className="flex items-center justify-between p-4">
        <div className="flex-1 overflow-hidden">
          <div className="flex items-center">
            <ServerStatusIndicator status={server.status} />
            <div className="ml-3 flex items-center space-x-2">
              <ServerStackIcon className="h-4 w-4 text-indigo-500" />
              <h3 className="truncate text-sm font-semibold text-neutral-800 dark:text-white">
                {server.name}
              </h3>
            </div>
          </div>

          {server.description && (
            <p className="mt-2 truncate text-xs text-neutral-600 dark:text-neutral-400">
              {server.description}
            </p>
          )}

          <div className="mt-3 flex items-center space-x-4 text-xs text-neutral-500">
            <div className="flex items-center space-x-1">
              <GlobeAltIcon className="h-3.5 w-3.5" />
              <span className="truncate max-w-48">{server.url}</span>
            </div>
            <motion.button
              onClick={handleToggleExpand}
              disabled={toolCount === 0}
              className={`flex items-center space-x-1 rounded-md px-2 py-1 transition-colors ${
                toolCount > 0
                  ? "hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                  : "cursor-not-allowed opacity-50"
              }`}
            >
              <WrenchScrewdriverIcon className="h-3.5 w-3.5" />
              <span className="whitespace-nowrap font-medium">
                {toolCount} {toolCount === 1 ? "Tool" : "Tools"}
              </span>
              {toolCount > 0 && (
                <motion.div
                  animate={{ rotate: isExpanded ? 90 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronRightIcon className="h-3 w-3" />
                </motion.div>
              )}
            </motion.button>
          </div>
        </div>

        <div className="ml-6 flex items-center">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => onEdit(server)}
            className="rounded-lg p-2 text-neutral-400 opacity-0 transition-all duration-200 hover:bg-blue-50 hover:text-blue-600 group-hover:opacity-100 disabled:opacity-50 dark:hover:bg-blue-900/20 dark:hover:text-blue-400"
            title="Edit Server"
          >
            <PencilIcon className="h-4 w-4" />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleRemove}
            disabled={isRemoving}
            className="rounded-lg p-2 text-neutral-400 opacity-0 transition-all duration-200 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 disabled:opacity-50 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            title="Remove Server"
          >
            {isRemoving ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <LoadingSpinner size="sm" />
              </motion.div>
            ) : (
              <TrashIcon className="h-4 w-4" />
            )}
          </motion.button>
        </div>
      </div>

      {/* Expandable Tools List */}
      <AnimatePresence>
        {isExpanded && toolCount > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden border-t border-neutral-200/30 dark:border-neutral-700/30"
          >
            <div className="p-4 pt-3">
              <div className="mb-2 flex items-center space-x-2">
                <CommandLineIcon className="h-3.5 w-3.5 text-indigo-500" />
                <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Available Tools
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-2 dark:scrollbar-thumb-neutral-600 pr-2 custom-scrollbar">
                {server.tools?.map((tool, index) => (
                  <motion.button
                    key={`${tool.name}-${index}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() =>
                      onTestTool(server, tool.name, tool.description)
                    }
                    className="w-full flex items-start justify-between rounded-lg bg-neutral-50/80 p-3 text-left transition-all hover:bg-neutral-100/80 hover:shadow-sm active:scale-[0.99] dark:bg-neutral-800/50 dark:hover:bg-neutral-700/50 group cursor-pointer"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <code className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                          {tool.name}
                        </code>
                        <span className="text-xs text-neutral-500 opacity-0 group-hover:opacity-100 transition-opacity">
                          Click to test
                        </span>
                      </div>
                      {tool.description && (
                        <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2">
                          {tool.description}
                        </p>
                      )}
                    </div>
                    <div className="ml-3 opacity-60 group-hover:opacity-100 transition-opacity">
                      <PlayIcon className="h-4 w-4 text-indigo-500" />
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export function Mcp() {
  const {
    mcpServers,
    fetchMcpServers,
    refreshMcpServers,
    removeMcpServer,
    updateMcpServerInList,
    backendUrl,
    openAddMcpServerModal,
    openEditMcpServerModal,
    getLoading,
    // MCP Tool actions
    toolTestModal,
    openToolTestModal,
    closeToolTestModal,
  } = useXyzen();

  const mcpServersLoading = getLoading("mcpServers");

  const handleEditServer = (server: McpServer) => {
    openEditMcpServerModal(server);
  };

  const handleTestTool = (
    server: McpServer,
    toolName: string,
    toolDescription?: string,
  ) => {
    openToolTestModal(server, toolName, toolDescription);
  };

  useEffect(() => {
    if (backendUrl) {
      fetchMcpServers();

      // Connect to WebSocket for real-time updates
      websocketService.connect("/xyzen/ws/v1/mcp", (serverUpdate) => {
        updateMcpServerInList(serverUpdate);
      });

      // Disconnect on component unmount
      return () => {
        websocketService.disconnect();
      };
    }
  }, [backendUrl, fetchMcpServers, updateMcpServerInList]);

  const handleRefresh = () => {
    refreshMcpServers();
  };

  return (
    <div className="min-h-full rounded-2xl bg-gradient-to-br from-neutral-50 via-white to-neutral-100 p-6 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mx-auto max-w-6xl"
      >
        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-8 flex items-center justify-between"
        >
          <div className="flex items-center space-x-3">
            <div className="rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 p-2.5 shadow-lg">
              <ServerStackIcon className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                MCP Servers
              </h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Manage your Model-Context-Protocol servers.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleRefresh}
              disabled={mcpServersLoading}
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              <ArrowPathIcon
                className={`h-4 w-4 ${mcpServersLoading ? "animate-spin" : ""}`}
              />
              <span>Refresh</span>
            </button>
            <button
              onClick={openAddMcpServerModal}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all duration-200 hover:from-indigo-500 hover:to-indigo-600 hover:shadow-xl hover:shadow-indigo-500/30 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:shadow-indigo-500/20 dark:hover:shadow-indigo-500/40"
            >
              <PlusIcon className="h-4 w-4" />
              Add Server
            </button>
          </div>
        </motion.div>

        {/* Content Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="relative"
        >
          {/* Enhanced container with fixed height and layers */}
          <div className="relative min-h-[66vh] max-h-[66vh] overflow-y-auto rounded-3xl border  custom-scrollbar border-neutral-200/30 bg-gradient-to-br from-white/80 via-white/60 to-white/40 backdrop-blur-xl dark:border-neutral-700/30 dark:from-neutral-900/80 dark:via-neutral-900/60 dark:to-neutral-900/40">
            {/* Subtle background patterns for depth */}
            <div className="absolute inset-0 opacity-30">
              <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-indigo-100/50 via-transparent to-transparent rounded-full blur-3xl dark:from-indigo-900/30" />
              <div className="absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr from-purple-100/40 via-transparent to-transparent rounded-full blur-3xl dark:from-purple-900/20" />
            </div>

            {/* Scrollable content area */}
            <div className="relative h-full overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-neutral-300 scrollbar-track-transparent dark:scrollbar-thumb-neutral-600">
              <AnimatePresence mode="wait">
                {mcpServersLoading ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center justify-center h-full min-h-[400px]"
                  >
                    <div className="text-center">
                      <LoadingSpinner size="md" centered />
                      <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
                        Loading MCP servers...
                      </p>
                    </div>
                  </motion.div>
                ) : mcpServers.length > 0 ? (
                  <motion.div
                    key="servers"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-4"
                  >
                    <AnimatePresence>
                      {mcpServers.map((server, index) => (
                        <motion.div
                          key={server.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: index * 0.1 }}
                        >
                          <McpServerCard
                            server={server}
                            onRemove={removeMcpServer}
                            onEdit={handleEditServer}
                            onTestTool={handleTestTool}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </motion.div>
                ) : (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex flex-col items-center justify-center h-full min-h-[400px] text-center"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ duration: 0.5, delay: 0.2, type: "spring" }}
                      className="mb-6 rounded-full bg-gradient-to-br from-indigo-100/80 to-purple-100/60 p-6 dark:from-indigo-900/40 dark:to-purple-900/30"
                    >
                      <ExclamationTriangleIcon className="h-12 w-12 text-indigo-500" />
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.4 }}
                    >
                      <h3 className="text-xl font-semibold text-neutral-900 dark:text-white">
                        No MCP Servers Found
                      </h3>
                      <p className="mt-2 max-w-md text-sm text-neutral-600 dark:text-neutral-400">
                        Get started by adding your first MCP server to connect
                        tools and enhance your AI capabilities.
                      </p>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.6 }}
                    >
                      <Button
                        onClick={openAddMcpServerModal}
                        className="mt-8 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-3 text-sm font-semibold text-white transition-all duration-200 hover:from-indigo-500 hover:to-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                      >
                        <PlusIcon className="h-5 w-5" />
                        Add Your First Server
                      </Button>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Tool Test Modal */}
      {toolTestModal.isOpen &&
        toolTestModal.server &&
        toolTestModal.toolName && (
          <ToolTestModal
            isOpen={toolTestModal.isOpen}
            onClose={closeToolTestModal}
            server={toolTestModal.server}
            toolName={toolTestModal.toolName}
            toolDescription={toolTestModal.toolDescription}
          />
        )}

      {/* Edit MCP Server Modal */}
      <EditMcpServerModal />
    </div>
  );
}

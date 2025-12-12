import { LiquidButton } from "@/components/animate-ui/primitives/buttons/liquid";
import { Modal } from "@/components/animate-ui/primitives/headless/modal";
import { LoadingSpinner } from "@/components/base/LoadingSpinner";
import { AddMcpServerModal } from "@/components/modals/AddMcpServerModal";
import { EditMcpServerModal } from "@/components/modals/EditMcpServerModal";
import { ToolTestModal } from "@/components/modals/ToolTestModal";
import { websocketService } from "@/service/websocketService";
import { useXyzen } from "@/store";
import type { McpServer } from "@/types/mcp";
import type {
  ExplorableMcpServer,
  BuiltinMcpData,
  BohriumMcpData,
  SmitheryMcpData,
} from "@/types/mcp";
import { isBuiltinMcp, isBohriumMcp, isSmitheryMcp } from "@/types/mcp";
import UnifiedMcpMarketList from "@/marketplace/components/UnifiedMcpMarketList";
import McpServerDetail from "@/marketplace/components/McpServerDetail";
import SmitheryServerDetail from "@/marketplace/components/SmitheryServerDetail";
import {
  ArrowPathIcon,
  ChevronRightIcon,
  CommandLineIcon,
  GlobeAltIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  ServerStackIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../animate-ui/primitives/buttons/button";

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
      className="group relative overflow-hidden rounded-sm border border-neutral-200 bg-white shadow-sm transition-all duration-300 hover:border-indigo-200 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-indigo-800"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex flex-1 items-center space-x-3">
          <div className="rounded-sm bg-gradient-to-br from-indigo-500 to-purple-600 p-2">
            <ServerStackIcon className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white truncate">
              {server.name}
            </h3>
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400 truncate">
              {server.description || "No description"}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <ServerStatusIndicator status={server.status} />
        </div>
      </div>

      {/* Info Row */}
      <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50 px-4 py-2 dark:border-neutral-800 dark:bg-neutral-800/50">
        <div className="flex items-center space-x-4 text-xs">
          <div className="flex items-center space-x-1.5 text-neutral-600 dark:text-neutral-400">
            <GlobeAltIcon className="h-4 w-4" />
            <span className="truncate max-w-[200px]">{server.url}</span>
          </div>
          <button
            onClick={handleToggleExpand}
            disabled={toolCount === 0}
            className="flex items-center space-x-1.5 text-indigo-600 hover:text-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            <CommandLineIcon className="h-4 w-4" />
            <span>{toolCount} tools</span>
            {toolCount > 0 && (
              <motion.div
                animate={{ rotate: isExpanded ? 90 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronRightIcon className="h-3 w-3" />
              </motion.div>
            )}
          </button>
        </div>

        <div className="flex items-center space-x-1">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onEdit(server)}
            className="rounded-sm p-1.5 text-neutral-500 hover:bg-neutral-200 hover:text-indigo-600 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-indigo-400"
            title="Edit server"
          >
            <PencilIcon className="h-4 w-4" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleRemove}
            disabled={isRemoving}
            className="rounded-sm p-1.5 text-neutral-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            title="Remove server"
          >
            {isRemoving ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <ArrowPathIcon className="h-4 w-4" />
              </motion.div>
            ) : (
              <TrashIcon className="h-4 w-4" />
            )}
          </motion.button>
        </div>
      </div>

      {/* Tools List (Expandable) */}
      <AnimatePresence>
        {isExpanded && toolCount > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden border-t border-neutral-100 dark:border-neutral-800"
          >
            <div className="space-y-1 p-4">
              {server.tools?.map((tool, index) => (
                <motion.div
                  key={tool.name}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center justify-between rounded-sm bg-neutral-50 p-2 dark:bg-neutral-800/50"
                >
                  <div className="flex items-center space-x-2 flex-1 min-w-0">
                    <CommandLineIcon className="h-4 w-4 flex-shrink-0 text-indigo-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                        {tool.name}
                      </p>
                      {tool.description && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                          {tool.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      onTestTool(server, tool.name, tool.description)
                    }
                    className="ml-2 flex-shrink-0 rounded-sm p-1 text-neutral-500 hover:bg-indigo-50 hover:text-indigo-600 dark:text-neutral-400 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-400"
                    title="Test tool"
                  >
                    <PlayIcon className="h-4 w-4" />
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export function McpListModal() {
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
    isMcpListModalOpen,
    closeMcpListModal,
    toolTestModal,
    openToolTestModal,
    closeToolTestModal,
    builtinMcpServers,
    fetchBuiltinMcpServers,
    quickAddBuiltinServer,
  } = useXyzen();

  const mcpServersLoading = getLoading("mcpServers");
  const [selectedMarketServer, setSelectedMarketServer] =
    useState<ExplorableMcpServer | null>(null);

  const isMarketDetailOpen = useMemo(
    () => !!selectedMarketServer,
    [selectedMarketServer],
  );

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

  const handleSelectMarketServer = (server: ExplorableMcpServer) => {
    setSelectedMarketServer(server);
  };

  const handleCloseMarketDetail = () => {
    setSelectedMarketServer(null);
  };

  const handleQuickAddFromMarket = async () => {
    if (!selectedMarketServer) return;
    if (isBuiltinMcp(selectedMarketServer)) {
      try {
        await quickAddBuiltinServer(
          selectedMarketServer as ExplorableMcpServer<BuiltinMcpData>,
        );
        await fetchMcpServers();
        handleCloseMarketDetail();
      } catch (error) {
        console.error("Failed to add builtin server:", error);
      }
    }
  };

  useEffect(() => {
    if (backendUrl) {
      fetchMcpServers();
      fetchBuiltinMcpServers();

      websocketService.connect("/xyzen/ws/v1/mcp", (serverUpdate) => {
        updateMcpServerInList(serverUpdate);
      });

      return () => {
        websocketService.disconnect();
      };
    }
  }, [
    backendUrl,
    fetchMcpServers,
    fetchBuiltinMcpServers,
    updateMcpServerInList,
  ]);

  const handleRefresh = () => {
    refreshMcpServers();
  };

  return (
    <>
      <Modal
        isOpen={isMcpListModalOpen}
        onClose={closeMcpListModal}
        maxWidth="max-w-[95vw]"
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto relative"
        >
          <button
            onClick={closeMcpListModal}
            className="absolute -top-6 -right-2 p-1 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 z-10"
            aria-label="Close"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>

          {/* Header Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-6"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="rounded-sm bg-gradient-to-r from-indigo-500 to-purple-500 p-2.5 shadow-lg">
                  <ServerStackIcon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                    My Servers
                  </h1>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Browse marketplace and manage your servers
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <LiquidButton
                  onClick={handleRefresh}
                  disabled={mcpServersLoading}
                  className="text-sm flex items-center cursor-pointer rounded-sm font-medium px-4 py-2 h-10 overflow-hidden [--liquid-button-color:var(--primary)] [--liquid-button-background-color:var(--accent)] text-primary hover:text-primary-foreground"
                >
                  <ArrowPathIcon
                    className={`h-4 w-4 mr-2 ${mcpServersLoading ? "animate-spin" : ""}`}
                  />
                  <span className="whitespace-nowrap">Refresh</span>
                </LiquidButton>

                <Button
                  onClick={openAddMcpServerModal}
                  className="bg-primary text-primary-foreground text-sm font-medium px-4 py-2 h-10 flex items-center rounded-sm"
                >
                  <PlusIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="whitespace-nowrap">Add Custom</span>
                </Button>
              </div>
            </div>
          </motion.div>

          {/* Content Section - Split View */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="grid grid-cols-1 lg:grid-cols-10 gap-6"
          >
            {/* LEFT: MCP Market */}
            <div className="col-span-7">
              <div className="mb-4 flex items-center space-x-2">
                <GlobeAltIcon className="h-5 w-5 text-purple-500" />
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                  MCP Market
                </h2>
              </div>

              <div className="flex-1 min-h-[70vh] max-h-[70vh] overflow-y-auto rounded-sm border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950 custom-scrollbar">
                <UnifiedMcpMarketList
                  builtinServers={builtinMcpServers}
                  onSelectServer={handleSelectMarketServer}
                />
              </div>
            </div>

            {/* RIGHT: Added Servers */}
            <div className="col-span-3">
              <div className="mb-4 flex items-center space-x-2">
                <ServerStackIcon className="h-5 w-5 text-indigo-500" />
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                  Added Servers
                </h2>
                <span className="text-sm text-neutral-500 dark:text-neutral-400">
                  ({mcpServers.length})
                </span>
              </div>

              <div className="flex-1 min-h-[70vh] max-h-[70vh] overflow-y-auto rounded-sm border border-neutral-200 bg-neutral-50/50 p-6 custom-scrollbar dark:border-neutral-800 dark:bg-neutral-950">
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
                            transition={{
                              duration: 0.3,
                              delay: index * 0.05,
                            }}
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
                      <ServerStackIcon className="h-16 w-16 text-neutral-300 dark:text-neutral-700 mb-4" />
                      <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
                        No Servers Added Yet
                      </h3>
                      <p className="mt-2 max-w-md text-sm text-neutral-600 dark:text-neutral-400">
                        Browse the marketplace on the left to add servers, or
                        create a custom connection.
                      </p>
                      <Button
                        onClick={openAddMcpServerModal}
                        className="mt-6 inline-flex items-center gap-2 rounded-sm bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-3 text-sm font-semibold text-white transition-all duration-200 hover:from-indigo-500 hover:to-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                      >
                        <PlusIcon className="h-5 w-5" />
                        <span className="whitespace-nowrap">
                          Add Custom Server
                        </span>
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </Modal>

      {/* Market Detail Modal */}
      <Modal
        isOpen={isMarketDetailOpen}
        onClose={handleCloseMarketDetail}
        title={selectedMarketServer?.name || ""}
        maxWidth="max-w-6xl"
        maxHeight="max-h-[90vh]"
      >
        <div className="overflow-y-auto max-h-[calc(90vh-120px)] custom-scrollbar">
          {selectedMarketServer ? (
            isBohriumMcp(selectedMarketServer) ? (
              <McpServerDetail
                appKey={(selectedMarketServer.data as BohriumMcpData).appKey}
                onBack={handleCloseMarketDetail}
              />
            ) : isSmitheryMcp(selectedMarketServer) ? (
              <SmitheryServerDetail
                id={
                  (selectedMarketServer.data as SmitheryMcpData).qualifiedName
                }
                onBack={handleCloseMarketDetail}
              />
            ) : (
              <div className="space-y-4">
                {/* Cover / Banner */}
                <div className="overflow-hidden rounded-sm">
                  <img
                    src={
                      selectedMarketServer.cover ||
                      "https://storage.sciol.ac.cn/library/origin.png"
                    }
                    alt={selectedMarketServer.name}
                    className="h-48 w-full object-cover"
                  />
                </div>
                {/* Info */}
                <div>
                  <h3 className="text-xl font-semibold text-neutral-900 dark:text-white">
                    {selectedMarketServer.name}
                  </h3>
                  <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                    {selectedMarketServer.description}
                  </p>
                </div>
                {/* Quick Add */}
                <div className="flex justify-end gap-2">
                  <button
                    className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                    onClick={handleCloseMarketDetail}
                  >
                    Close
                  </button>
                  {isBuiltinMcp(selectedMarketServer) && (
                    <button
                      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                      onClick={handleQuickAddFromMarket}
                    >
                      Quick Add
                    </button>
                  )}
                </div>
              </div>
            )
          ) : null}
        </div>
      </Modal>

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
      <AddMcpServerModal />
    </>
  );
}

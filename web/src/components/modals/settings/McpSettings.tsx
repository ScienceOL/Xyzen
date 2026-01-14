import { Button } from "@/components/animate-ui/primitives/buttons/button";
import { LiquidButton } from "@/components/animate-ui/primitives/buttons/liquid";
import { Modal } from "@/components/animate-ui/primitives/headless/modal";
import { LoadingSpinner } from "@/components/base/LoadingSpinner";
import { AddMcpServerModal } from "@/components/modals/AddMcpServerModal";
import { EditMcpServerModal } from "@/components/modals/EditMcpServerModal";
import { ToolTestModal } from "@/components/modals/ToolTestModal";
import McpServerDetail from "@/marketplace/components/McpServerDetail";
import SmitheryServerDetail from "@/marketplace/components/SmitheryServerDetail";
import UnifiedMcpMarketList from "@/marketplace/components/UnifiedMcpMarketList";
import { websocketService } from "@/service/websocketService";
import { useXyzen } from "@/store";
import type {
  BohriumMcpData,
  BuiltinMcpData,
  ExplorableMcpServer,
  McpServer,
  SmitheryMcpData,
} from "@/types/mcp";
import { isBohriumMcp, isBuiltinMcp, isSmitheryMcp } from "@/types/mcp";
import {
  ArrowPathIcon,
  ChevronRightIcon,
  CommandLineIcon,
  GlobeAltIcon,
  ListBulletIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  ServerStackIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

interface ServerStatusIndicatorProps {
  status: "online" | "offline" | string;
}

const ServerStatusIndicator: React.FC<ServerStatusIndicatorProps> = ({
  status,
}) => {
  const { t } = useTranslation();
  const isOnline = status === "online";
  return (
    <div
      className={`flex items-center px-1.5 py-0.5 rounded-full border shrink-0 ${
        isOnline
          ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-900"
          : "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-900"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full shrink-0 ${
          isOnline ? "bg-green-500" : "bg-red-500"
        }`}
      />
      <span
        className={`ml-1 text-[10px] font-medium whitespace-nowrap ${
          isOnline
            ? "text-green-700 dark:text-green-300"
            : "text-red-700 dark:text-red-300"
        }`}
      >
        {isOnline ? t("mcp.added.online") : t("mcp.added.offline")}
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
  const { t } = useTranslation();
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
      <div className="flex items-start p-3 gap-3">
        <div className="shrink-0 rounded-sm bg-linear-to-br from-indigo-500 to-purple-600 p-2 mt-0.5">
          <ServerStackIcon className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white truncate">
              {server.name}
            </h3>
            <ServerStatusIndicator status={server.status} />
          </div>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400 truncate">
            {(() => {
              const description =
                server.description || t("mcp.added.noDescription");
              const hasCJK =
                /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(
                  description,
                );
              const maxLength = hasCJK ? 18 : 35;
              return description.length > maxLength
                ? description.substring(0, maxLength) + "..."
                : description;
            })()}
          </p>
        </div>
      </div>

      {/* Info Row */}
      <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50 px-4 py-2 dark:border-neutral-800 dark:bg-neutral-800/50">
        <div className="flex items-center gap-2 text-xs flex-1 min-w-0 mr-2">
          <div className="flex items-center space-x-1.5 text-neutral-600 dark:text-neutral-400 flex-1 min-w-0">
            <GlobeAltIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">{server.url}</span>
          </div>
          <button
            onClick={handleToggleExpand}
            disabled={toolCount === 0}
            className="flex items-center space-x-1 text-indigo-600 hover:text-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed dark:text-indigo-400 dark:hover:text-indigo-300 shrink-0"
          >
            <CommandLineIcon className="h-4 w-4" />
            <span>{toolCount}</span>
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

        <div className="flex items-center space-x-1 shrink-0">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onEdit(server)}
            className="rounded-sm p-1.5 text-neutral-500 hover:bg-neutral-200 hover:text-indigo-600 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-indigo-400"
            title={t("mcp.added.edit")}
          >
            <PencilIcon className="h-4 w-4" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleRemove}
            disabled={isRemoving}
            className="rounded-sm p-1.5 text-neutral-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            title={t("mcp.added.remove")}
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
                    <CommandLineIcon className="h-4 w-4 shrink-0 text-indigo-500" />
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
                    className="ml-2 shrink-0 rounded-sm p-1 text-neutral-500 hover:bg-indigo-50 hover:text-indigo-600 dark:text-neutral-400 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-400"
                    title={t("mcp.added.test")}
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

export function McpSettings() {
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
    toolTestModal,
    openToolTestModal,
    closeToolTestModal,
    builtinMcpServers,
    fetchBuiltinMcpServers,
    quickAddBuiltinServer,
  } = useXyzen();

  const { t } = useTranslation();
  const mcpServersLoading = getLoading("mcpServers");
  const [selectedMarketServer, setSelectedMarketServer] =
    useState<ExplorableMcpServer | null>(null);
  const [showAddedServersMobile, setShowAddedServersMobile] = useState(false);

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
    <div className="flex h-full flex-col">
      {/* Header Section */}
      <div className="shrink-0 border-b border-neutral-200 bg-neutral-50/50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/50">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
            {t("mcp.title")}
          </h2>

          <div className="flex items-center space-x-2">
            {/* Mobile Toggle Button (Only if needed, but in settings it might be better to just stack) */}
            <Button
              onClick={() => setShowAddedServersMobile(!showAddedServersMobile)}
              className="lg:hidden bg-neutral-100 text-neutral-900 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700 text-sm font-medium px-2.5 h-8 flex items-center rounded-sm"
            >
              {showAddedServersMobile ? (
                <GlobeAltIcon className="h-4 w-4" />
              ) : (
                <ListBulletIcon className="h-4 w-4" />
              )}
            </Button>

            <LiquidButton
              onClick={handleRefresh}
              disabled={mcpServersLoading}
              className="text-xs flex items-center cursor-pointer rounded-sm font-medium px-3 h-8 overflow-hidden [--liquid-button-color:var(--primary)] [--liquid-button-background-color:var(--accent)] text-primary hover:text-primary-foreground"
            >
              <ArrowPathIcon
                className={`h-3.5 w-3.5 mr-1.5 ${mcpServersLoading ? "animate-spin" : ""}`}
              />
              <span className="whitespace-nowrap">{t("mcp.refresh")}</span>
            </LiquidButton>

            <Button
              onClick={openAddMcpServerModal}
              className="bg-primary text-primary-foreground text-xs font-medium px-3 h-8 flex items-center rounded-sm"
            >
              <PlusIcon className="h-3.5 w-3.5 mr-1.5 shrink-0" />
              <span className="whitespace-nowrap">{t("mcp.addCustom")}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Content Section - Split View */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* LEFT: MCP Market (Uses flex-1 to fill remaining space) */}
        <div
          className={`flex-1 min-w-0 flex flex-col border-r border-neutral-200 dark:border-neutral-800 ${showAddedServersMobile ? "hidden lg:flex" : "flex"}`}
        >
          <div className="shrink-0 p-3 bg-neutral-50/30 border-b border-neutral-100 dark:bg-neutral-900/30 dark:border-neutral-800 flex items-center space-x-2">
            <GlobeAltIcon className="h-4 w-4 text-purple-500" />
            <h3 className="text-sm font-medium text-neutral-900 dark:text-white">
              {t("mcp.market.title")}
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
            <UnifiedMcpMarketList
              builtinServers={builtinMcpServers}
              onSelectServer={handleSelectMarketServer}
            />
          </div>
        </div>

        {/* RIGHT: Added Servers (Fixed width on large screens) */}
        <div
          className={`flex-1 lg:flex-none lg:w-[320px] flex flex-col bg-neutral-50/30 dark:bg-neutral-900/30 ${showAddedServersMobile ? "flex" : "hidden lg:flex"}`}
        >
          <div className="shrink-0 p-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ServerStackIcon className="h-4 w-4 text-indigo-500" />
              <h3 className="text-sm font-medium text-neutral-900 dark:text-white">
                {t("mcp.added.title")}
              </h3>
            </div>
            <span className="text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded-full">
              {mcpServers.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
            <AnimatePresence mode="wait">
              {mcpServersLoading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center justify-center h-40"
                >
                  <LoadingSpinner size="sm" centered />
                </motion.div>
              ) : mcpServers.length > 0 ? (
                <motion.div
                  key="servers"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-3"
                >
                  <AnimatePresence>
                    {mcpServers.map((server, index) => (
                      <motion.div
                        key={server.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.2,
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
                  className="flex flex-col items-center justify-center h-40 text-center"
                >
                  <ServerStackIcon className="h-10 w-10 text-neutral-300 dark:text-neutral-700 mb-2" />
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {t("mcp.added.empty.title")}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

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
                    {t("mcp.market.close")}
                  </button>
                  {isBuiltinMcp(selectedMarketServer) && (
                    <button
                      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                      onClick={handleQuickAddFromMarket}
                    >
                      {t("mcp.market.quickAdd")}
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
    </div>
  );
}

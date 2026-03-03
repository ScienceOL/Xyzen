import { Button } from "@/components/animate-ui/primitives/buttons/button";
import { LiquidButton } from "@/components/animate-ui/primitives/buttons/liquid";
import { Input } from "@/components/base/Input";
import { LoadingSpinner } from "@/components/base/LoadingSpinner";
import { EditMcpServerModal } from "@/components/modals/EditMcpServerModal";
import { ToolTestModal } from "@/components/modals/ToolTestModal";
import { websocketService } from "@/service/websocketService";
import { useXyzen } from "@/store";
import { useShallow } from "zustand/react/shallow";
import type { McpServer, McpServerCreate } from "@/types/mcp";
import { Field, Label, Radio, RadioGroup } from "@headlessui/react";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  CommandLineIcon,
  GlobeAltIcon,
  KeyIcon,
  ListBulletIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  ServerStackIcon,
  TrashIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, type ChangeEvent } from "react";
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

/* ------------------------------------------------------------------ */
/*  Inline Add-Server Form (replaces marketplace on left panel)       */
/* ------------------------------------------------------------------ */

function AddServerForm() {
  const { t } = useTranslation();
  const { addMcpServer, getLoading, user, token } = useXyzen(
    useShallow((s) => ({
      addMcpServer: s.addMcpServer,
      getLoading: s.getLoading,
      user: s.user,
      token: s.token,
    })),
  );

  const [newServer, setNewServer] = useState<McpServerCreate>({
    name: "",
    description: "",
    url: "",
    token: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [authMode, setAuthMode] = useState<"current" | "custom">(
    user && token ? "current" : "custom",
  );

  const isCreating = getLoading("mcpServerCreate");

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewServer((prev) => ({ ...prev, [name]: value }));
    if (error) setError(null);
  };

  const handleAddServer = async () => {
    setError(null);
    if (!newServer.name.trim() || !newServer.url.trim()) {
      setError(t("mcp.addModal.errors.required"));
      return;
    }

    try {
      const serverToCreate = {
        ...newServer,
        token: authEnabled
          ? authMode === "current"
            ? token || ""
            : newServer.token
          : "",
      };

      await addMcpServer(serverToCreate);
      setIsSuccess(true);
      setTimeout(() => {
        setNewServer({ name: "", description: "", url: "", token: "" });
        setIsSuccess(false);
        setAuthEnabled(false);
        setAuthMode(user && token ? "current" : "custom");
      }, 1500);
    } catch (err) {
      setError(t("mcp.addModal.errors.failed"));
      console.error(err);
    }
  };

  return (
    <div className="space-y-5 p-4">
      <AnimatePresence mode="wait">
        {isSuccess ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="flex flex-col items-center justify-center py-10"
          >
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                delay: 0.2,
                duration: 0.5,
                type: "spring",
                stiffness: 200,
                damping: 15,
              }}
              className="mb-4 rounded-full bg-linear-to-br from-green-100 to-green-50 p-3.5 shadow-lg dark:from-green-900/30 dark:to-green-800/20"
            >
              <CheckCircleIcon className="h-7 w-7 text-green-600 dark:text-green-400" />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.3 }}
              className="text-center"
            >
              <h3 className="text-[15px] font-semibold text-neutral-900 dark:text-white">
                {t("mcp.addModal.success.title")}
              </h3>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {t("mcp.addModal.success.message")}
              </p>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {/* Name */}
            <Field>
              <Label className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
                {t("mcp.addModal.fields.name.label")}{" "}
                <span className="text-indigo-500">*</span>
              </Label>
              <Input
                name="name"
                value={newServer.name}
                onChange={handleInputChange}
                placeholder={t("mcp.addModal.fields.name.placeholder")}
                required
                className="mt-1"
              />
            </Field>

            {/* Description */}
            <Field>
              <Label className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
                {t("mcp.addModal.fields.description.label")}
              </Label>
              <Input
                name="description"
                value={newServer.description}
                onChange={handleInputChange}
                placeholder={t("mcp.addModal.fields.description.placeholder")}
                className="mt-1"
              />
            </Field>

            {/* URL */}
            <Field>
              <Label className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
                {t("mcp.addModal.fields.url.label")}{" "}
                <span className="text-indigo-500">*</span>
              </Label>
              <Input
                name="url"
                value={newServer.url}
                onChange={handleInputChange}
                placeholder={t("mcp.addModal.fields.url.placeholder")}
                required
                className="mt-1"
              />
            </Field>

            {/* Auth Toggle */}
            <Field>
              <div className="flex items-center justify-between gap-3">
                <Label className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
                  {t("mcp.addModal.fields.auth.label")}
                </Label>
                <button
                  type="button"
                  onClick={() =>
                    setAuthEnabled((v) => {
                      const next = !v;
                      if (!next) {
                        setNewServer((prev) => ({ ...prev, token: "" }));
                      } else {
                        setAuthMode(user && token ? "current" : "custom");
                      }
                      return next;
                    })
                  }
                  className={`inline-flex items-center gap-2 rounded-sm px-3 py-1.5 text-[13px] font-medium transition-colors ${
                    authEnabled
                      ? "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/50"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      authEnabled
                        ? "bg-amber-500"
                        : "bg-neutral-400 dark:bg-neutral-500"
                    }`}
                  />
                  {authEnabled
                    ? t("mcp.addModal.fields.auth.enabled")
                    : t("mcp.addModal.fields.auth.enable")}
                </button>
              </div>

              <AnimatePresence initial={false}>
                {authEnabled && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, y: -10 }}
                    animate={{ opacity: 1, height: "auto", y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -10 }}
                    transition={{ duration: 0.25 }}
                    className="mt-3 space-y-3 overflow-hidden"
                  >
                    <RadioGroup
                      value={authMode}
                      onChange={setAuthMode}
                      className="space-y-2"
                    >
                      {user && token && (
                        <Radio value="current">
                          {({ checked }) => (
                            <div
                              className={`cursor-pointer rounded-sm p-3 transition-all ${
                                checked
                                  ? "bg-indigo-50/80 ring-1 ring-indigo-500/30 dark:bg-indigo-900/20"
                                  : "bg-neutral-100/60 hover:bg-neutral-100 dark:bg-white/[0.04] dark:hover:bg-white/[0.06]"
                              }`}
                            >
                              <div className="flex items-center space-x-3">
                                <div
                                  className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                                    checked
                                      ? "border-indigo-500 bg-indigo-500"
                                      : "border-neutral-300 dark:border-neutral-600"
                                  }`}
                                >
                                  {checked && (
                                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                                  )}
                                </div>
                                <div className="flex items-center space-x-2">
                                  <UserIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                  <span className="text-[13px] font-medium text-neutral-900 dark:text-white">
                                    {t(
                                      "mcp.addModal.fields.auth.current.label",
                                    )}
                                  </span>
                                </div>
                              </div>
                              <p className="ml-7 mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                                {t("mcp.addModal.fields.auth.current.desc")}
                              </p>
                            </div>
                          )}
                        </Radio>
                      )}

                      <Radio value="custom">
                        {({ checked }) => (
                          <div
                            className={`cursor-pointer rounded-sm p-3 transition-all ${
                              checked
                                ? "bg-indigo-50/80 ring-1 ring-indigo-500/30 dark:bg-indigo-900/20"
                                : "bg-neutral-100/60 hover:bg-neutral-100 dark:bg-white/[0.04] dark:hover:bg-white/[0.06]"
                            }`}
                          >
                            <div className="flex items-center space-x-3">
                              <div
                                className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                                  checked
                                    ? "border-indigo-500 bg-indigo-500"
                                    : "border-neutral-300 dark:border-neutral-600"
                                }`}
                              >
                                {checked && (
                                  <div className="h-1.5 w-1.5 rounded-full bg-white" />
                                )}
                              </div>
                              <div className="flex items-center space-x-2">
                                <KeyIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                <span className="text-[13px] font-medium text-neutral-900 dark:text-white">
                                  {t("mcp.addModal.fields.auth.custom.label")}
                                </span>
                              </div>
                            </div>
                            <p className="ml-7 mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                              {t("mcp.addModal.fields.auth.custom.desc")}
                            </p>
                          </div>
                        )}
                      </Radio>
                    </RadioGroup>

                    {authMode === "custom" && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                      >
                        <Label className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
                          {t("mcp.addModal.fields.auth.token.label")}
                        </Label>
                        <Input
                          name="token"
                          type="password"
                          value={newServer.token}
                          onChange={handleInputChange}
                          placeholder={t(
                            "mcp.addModal.fields.auth.token.placeholder",
                          )}
                          className="mt-1"
                        />
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </Field>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="rounded-sm bg-red-50/80 p-3 dark:bg-red-950/30"
                >
                  <p className="text-[13px] text-red-600 dark:text-red-400">
                    {error}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <Button
              onClick={handleAddServer}
              disabled={
                isCreating || !newServer.name.trim() || !newServer.url.trim()
              }
              className="w-full bg-primary text-primary-foreground text-[13px] font-semibold px-4 py-2 rounded-lg disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCreating ? (
                <span className="inline-flex items-center gap-2">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                  >
                    <ServerStackIcon className="h-4 w-4" />
                  </motion.div>
                  {t("mcp.addModal.actions.adding")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <PlusIcon className="h-4 w-4" />
                  {t("mcp.addModal.actions.add")}
                </span>
              )}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  McpSettings (main export)                                         */
/* ------------------------------------------------------------------ */

export function McpSettings() {
  const {
    mcpServers,
    fetchMcpServers,
    refreshMcpServers,
    removeMcpServer,
    updateMcpServerInList,
    backendUrl,
    openEditMcpServerModal,
    getLoading,
    toolTestModal,
    openToolTestModal,
    closeToolTestModal,
  } = useXyzen(
    useShallow((s) => ({
      mcpServers: s.mcpServers,
      fetchMcpServers: s.fetchMcpServers,
      refreshMcpServers: s.refreshMcpServers,
      removeMcpServer: s.removeMcpServer,
      updateMcpServerInList: s.updateMcpServerInList,
      backendUrl: s.backendUrl,
      openEditMcpServerModal: s.openEditMcpServerModal,
      getLoading: s.getLoading,
      toolTestModal: s.toolTestModal,
      openToolTestModal: s.openToolTestModal,
      closeToolTestModal: s.closeToolTestModal,
    })),
  );

  const { t } = useTranslation();
  const mcpServersLoading = getLoading("mcpServers");
  const [showAddedServersMobile, setShowAddedServersMobile] = useState(false);

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

      websocketService.connect("/xyzen/ws/v1/mcp", (serverUpdate) => {
        updateMcpServerInList(serverUpdate);
      });

      return () => {
        websocketService.disconnect();
      };
    }
  }, [backendUrl, fetchMcpServers, updateMcpServerInList]);

  const handleRefresh = () => {
    refreshMcpServers();
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header Section */}
      <div className="shrink-0 border-b border-neutral-200/60 bg-neutral-50/50 px-4 py-3 dark:border-neutral-800/60 dark:bg-neutral-900/50">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
            {t("mcp.title")}
          </h2>

          <div className="flex items-center space-x-2">
            <Button
              onClick={() => setShowAddedServersMobile(!showAddedServersMobile)}
              className="lg:hidden bg-neutral-100 text-neutral-900 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700 text-sm font-medium px-2.5 h-8 flex items-center rounded-sm"
            >
              {showAddedServersMobile ? (
                <PlusIcon className="h-4 w-4" />
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
          </div>
        </div>
      </div>

      {/* Content Section - Split View */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* LEFT: Add Server Form */}
        <div
          className={`lg:w-[320px] shrink-0 flex flex-col border-r border-neutral-200/60 dark:border-neutral-800/60 ${showAddedServersMobile ? "hidden lg:flex" : "flex"}`}
        >
          <div className="shrink-0 p-3 bg-neutral-50/30 border-b border-neutral-100 dark:bg-neutral-900/30 dark:border-neutral-800/60 flex items-center space-x-2">
            <PlusIcon className="h-4 w-4 text-indigo-500" />
            <h3 className="text-sm font-medium text-neutral-900 dark:text-white">
              {t("mcp.addCustom")}
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <AddServerForm />
          </div>
        </div>

        {/* RIGHT: Connected Servers */}
        <div
          className={`flex-1 min-w-0 flex flex-col bg-neutral-50/30 dark:bg-neutral-900/30 ${showAddedServersMobile ? "flex" : "hidden lg:flex"}`}
        >
          <div className="shrink-0 p-3 border-b border-neutral-200/60 dark:border-neutral-800/60 flex items-center justify-between">
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

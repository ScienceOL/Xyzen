import { Input } from "@/components/base/Input";
import { Modal } from "@/components/base/Modal";
import { useXyzen } from "@/store";
import type { McpServerCreate } from "@/types/mcp";
import { Button, Field, Label } from "@headlessui/react";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CogIcon,
  ExclamationCircleIcon,
  KeyIcon,
  LockClosedIcon,
  ServerStackIcon,
  SparklesIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, type ChangeEvent } from "react";

export function AddMcpServerModal() {
  const {
    isAddMcpServerModalOpen,
    closeAddMcpServerModal,
    addMcpServer,
    builtinMcpServers,
    fetchBuiltinMcpServers,
    quickAddBuiltinServer,
    getLoading,
    user,
    token,
  } = useXyzen();
  const [newServer, setNewServer] = useState<McpServerCreate>({
    name: "",
    description: "",
    url: "",
    token: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [useCurrentUserToken, setUseCurrentUserToken] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  const isCreating = getLoading("mcpServerCreate");

  // Fetch builtin servers when modal opens
  useEffect(() => {
    if (isAddMcpServerModalOpen) {
      fetchBuiltinMcpServers();
    }
  }, [isAddMcpServerModalOpen, fetchBuiltinMcpServers]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewServer((prev) => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (error) setError(null);
  };

  const handleAddServer = async () => {
    setError(null);
    if (!newServer.name.trim() || !newServer.url.trim()) {
      setError("Name and URL are required.");
      return;
    }

    try {
      const serverToCreate = {
        ...newServer,
        token: useCurrentUserToken ? token || "" : newServer.token,
      };

      await addMcpServer(serverToCreate);
      setIsSuccess(true);
      setTimeout(() => {
        setNewServer({ name: "", description: "", url: "", token: "" });
        setIsSuccess(false);
        setUseCurrentUserToken(true);
        setShowAdvancedOptions(false);
        // The modal is closed from the store action on success
      }, 1500);
    } catch (err) {
      setError("Failed to add server. Please check the details and try again.");
      console.error(err);
    }
  };

  const handleQuickAdd = async (server: (typeof builtinMcpServers)[0]) => {
    setError(null);
    try {
      await quickAddBuiltinServer(server);
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
      }, 1500);
    } catch (err) {
      setError("Failed to add server. Please try again.");
      console.error(err);
    }
  };

  const handleClose = () => {
    if (!isCreating) {
      setNewServer({ name: "", description: "", url: "", token: "" });
      setError(null);
      setIsSuccess(false);
      setUseCurrentUserToken(true);
      setShowAdvancedOptions(false);
      closeAddMcpServerModal();
    }
  };

  return (
    <Modal
      isOpen={isAddMcpServerModalOpen}
      onClose={handleClose}
      title="Add MCP Server"
      maxWidth="max-w-4xl"
      minHeight="min-h-[700px]"
    >
      <AnimatePresence mode="wait">
        {isSuccess ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="flex flex-col items-center justify-center py-8"
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
              className="mb-6 rounded-full bg-gradient-to-br from-green-100 to-green-50 p-4 shadow-lg dark:from-green-900/30 dark:to-green-800/20"
            >
              <CheckCircleIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.3 }}
              className="text-center"
            >
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
                Server Added Successfully!
              </h3>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                Your MCP server is now ready to use.
              </p>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full"
          >
            {/* Left Side: MCP Market (Built-in Servers) */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col h-full"
            >
              <div className="mb-4 flex items-center space-x-2 border-b border-neutral-200 pb-3 dark:border-neutral-700">
                <SparklesIcon className="h-5 w-5 text-indigo-500" />
                <div>
                  <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                    MCP Market
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    One-click install built-in servers
                  </p>
                </div>
              </div>

              {builtinMcpServers.length > 0 ? (
                <div className="flex-1 space-y-2 overflow-y-auto max-h-96">
                  {builtinMcpServers.map((server, index) => (
                    <motion.div
                      key={server.module_name}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="group flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 p-2.5 transition-all hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-neutral-700 dark:bg-neutral-800/50 dark:hover:border-indigo-600 dark:hover:bg-indigo-900/20"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                            {server.name}
                          </p>
                          {server.requires_auth && (
                            <div className="flex-shrink-0 flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 dark:bg-amber-900/30">
                              <LockClosedIcon className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                              <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300">
                                Auth
                              </span>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                          {server.description}
                        </p>
                      </div>
                      <Button
                        onClick={() => handleQuickAdd(server)}
                        disabled={isCreating}
                        className="ml-2 flex-shrink-0 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Add
                      </Button>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed border-neutral-200 bg-neutral-50 p-6 dark:border-neutral-700 dark:bg-neutral-800/30">
                  <div className="text-center">
                    <ServerStackIcon className="mx-auto h-8 w-8 text-neutral-400" />
                    <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                      No servers available
                    </p>
                  </div>
                </div>
              )}
            </motion.div>

            {/* Right Side: Custom Server Form */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="flex flex-col h-full"
            >
              <div className="mb-4 flex items-center space-x-2 border-b border-neutral-200 pb-3 dark:border-neutral-700">
                <div className="rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 p-2">
                  <ServerStackIcon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                    Custom Server
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Connect to your own MCP server
                  </p>
                </div>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <Field>
                    <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      Server Name <span className="text-indigo-500">*</span>
                    </Label>
                    <Input
                      name="name"
                      value={newServer.name}
                      onChange={handleInputChange}
                      placeholder="My Local Server"
                      required
                      className="mt-1"
                    />
                  </Field>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <Field>
                    <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      Description
                    </Label>
                    <Input
                      name="description"
                      value={newServer.description}
                      onChange={handleInputChange}
                      placeholder="A brief description of the server"
                      className="mt-1"
                    />
                  </Field>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <Field>
                    <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      Server URL <span className="text-indigo-500">*</span>
                    </Label>
                    <Input
                      name="url"
                      value={newServer.url}
                      onChange={handleInputChange}
                      placeholder="http://localhost:8000"
                      required
                      className="mt-1"
                    />
                  </Field>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  <Field>
                    <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      Authentication Token
                    </Label>

                    {/* Token Options */}
                    <div className="mt-2 space-y-3">
                      {/* Current User Token Option */}
                      {user && token && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.1 }}
                        >
                          <button
                            type="button"
                            onClick={() => setUseCurrentUserToken(true)}
                            className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all duration-200 ${
                              useCurrentUserToken
                                ? "border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-900/20"
                                : "border-neutral-200 bg-neutral-50 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800/50 dark:hover:border-neutral-600"
                            }`}
                          >
                            <div className="flex items-center space-x-3">
                              <div
                                className={`p-2 rounded-lg ${
                                  useCurrentUserToken
                                    ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-800/50 dark:text-indigo-300"
                                    : "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400"
                                }`}
                              >
                                <UserIcon className="h-4 w-4" />
                              </div>
                              <div className="text-left">
                                <p className="text-sm font-medium text-neutral-900 dark:text-white">
                                  Use Current User Token
                                </p>
                                <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate max-w-48">
                                  Authenticated as {user.username}
                                </p>
                              </div>
                            </div>
                            <div
                              className={`h-4 w-4 rounded-full border-2 transition-colors ${
                                useCurrentUserToken
                                  ? "border-indigo-500 bg-indigo-500"
                                  : "border-neutral-300 dark:border-neutral-600"
                              }`}
                            >
                              {useCurrentUserToken && (
                                <motion.div
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  className="h-full w-full rounded-full bg-white scale-50"
                                />
                              )}
                            </div>
                          </button>
                        </motion.div>
                      )}

                      {/* Advanced Options Toggle */}
                      <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2 }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setShowAdvancedOptions(!showAdvancedOptions);
                            if (!showAdvancedOptions) {
                              setUseCurrentUserToken(false);
                            }
                          }}
                          className="w-full flex items-center justify-between p-3 rounded-lg border-2 border-neutral-200 bg-neutral-50 hover:border-neutral-300 transition-all duration-200 dark:border-neutral-700 dark:bg-neutral-800/50 dark:hover:border-neutral-600"
                        >
                          <div className="flex items-center space-x-3">
                            <div className="p-2 rounded-lg bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400">
                              <CogIcon className="h-4 w-4" />
                            </div>
                            <div className="text-left">
                              <p className="text-sm font-medium text-neutral-900 dark:text-white">
                                Advanced Options
                              </p>
                              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                Custom token configuration
                              </p>
                            </div>
                          </div>
                          <motion.div
                            animate={{ rotate: showAdvancedOptions ? 180 : 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <ChevronDownIcon className="h-4 w-4 text-neutral-500" />
                          </motion.div>
                        </button>
                      </motion.div>

                      {/* Custom Token Input */}
                      <AnimatePresence>
                        {showAdvancedOptions && (
                          <motion.div
                            initial={{ opacity: 0, height: 0, y: -10 }}
                            animate={{ opacity: 1, height: "auto", y: 0 }}
                            exit={{ opacity: 0, height: 0, y: -10 }}
                            transition={{ duration: 0.3, ease: "easeInOut" }}
                            className="overflow-hidden"
                          >
                            <div className="p-4 rounded-lg bg-neutral-100/50 border border-neutral-200 dark:bg-neutral-800/30 dark:border-neutral-700">
                              <div className="flex items-center space-x-2 mb-3">
                                <KeyIcon className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
                                <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                  Custom Token
                                </Label>
                              </div>
                              <Input
                                name="token"
                                value={newServer.token}
                                onChange={handleInputChange}
                                placeholder="Enter custom authentication token"
                                type="password"
                                className="bg-white dark:bg-neutral-900"
                              />
                              <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                                Leave empty if no authentication is required
                              </p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </Field>
                </motion.div>
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 flex items-center space-x-2 rounded-lg bg-red-50 p-3 dark:bg-red-900/20"
                  >
                    <ExclamationCircleIcon className="h-4 w-4 text-red-500" />
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {error}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Custom Server Form Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="mt-4 flex justify-end gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-700"
              >
                <Button
                  onClick={handleClose}
                  disabled={isCreating}
                  className="inline-flex items-center gap-2 rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-200 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 disabled:opacity-50 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddServer}
                  disabled={
                    isCreating ||
                    !newServer.name.trim() ||
                    !newServer.url.trim()
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:from-indigo-500 hover:to-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreating ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                        className="h-4 w-4 rounded-full border-2 border-white border-t-transparent"
                      />
                      Creating...
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="h-4 w-4" />
                      Add Server
                    </>
                  )}
                </Button>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}

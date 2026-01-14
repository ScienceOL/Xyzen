import { Modal } from "@/components/animate-ui/components/animate/modal";
import { Input } from "@/components/base/Input";
import { useXyzen } from "@/store";
import type { McpServer, McpServerUpdate } from "@/types/mcp";
import { Button, Field, Label } from "@headlessui/react";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CogIcon,
  ExclamationCircleIcon,
  KeyIcon,
  ServerStackIcon,
  SparklesIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, type ChangeEvent } from "react";

export function EditMcpServerModal() {
  const {
    isEditMcpServerModalOpen,
    closeEditMcpServerModal,
    editMcpServer,
    editingMcpServer,
    getLoading,
    user,
    token,
  } = useXyzen();
  const [server, setServer] = useState<McpServer | null>(editingMcpServer);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [useCurrentUserToken, setUseCurrentUserToken] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  const isEditing = getLoading("mcpServerUpdate");

  useEffect(() => {
    setServer(editingMcpServer);

    // Check if the server's token matches the current user's token
    if (editingMcpServer && token && editingMcpServer.token === token) {
      setUseCurrentUserToken(true);
      setShowAdvancedOptions(false);
    } else if (editingMcpServer && editingMcpServer.token) {
      // Server has a custom token
      setUseCurrentUserToken(false);
      setShowAdvancedOptions(true);
    } else {
      // No token set
      setUseCurrentUserToken(false);
      setShowAdvancedOptions(false);
    }
  }, [editingMcpServer, token]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setServer((prev) => (prev ? { ...prev, [name]: value } : null));
    if (error) setError(null);
  };

  const handleEditServer = async () => {
    setError(null);
    if (!server || !server.name?.trim() || !server.url?.trim()) {
      setError("Name and URL are required.");
      return;
    }

    try {
      if (editingMcpServer) {
        const serverToUpdate: McpServerUpdate = {
          name: server.name,
          description: server.description,
          url: server.url,
          token: useCurrentUserToken ? token || "" : server.token || "",
        };

        await editMcpServer(editingMcpServer.id, serverToUpdate);
        setIsSuccess(true);
        setTimeout(() => {
          setIsSuccess(false);
          closeEditMcpServerModal();
        }, 1500);
      }
    } catch (err) {
      setError(
        "Failed to edit server. Please check the details and try again.",
      );
      console.error(err);
    }
  };

  const handleClose = () => {
    if (!isEditing) {
      closeEditMcpServerModal();
    }
  };

  return (
    <Modal
      isOpen={isEditMcpServerModalOpen}
      onClose={handleClose}
      title="Edit MCP Server"
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
              className="mb-6 rounded-full bg-linear-to-br from-green-100 to-green-50 p-4 shadow-lg dark:from-green-900/30 dark:to-green-800/20"
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
                Server Updated Successfully!
              </h3>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="mb-6 flex items-center space-x-3">
              <div className="rounded-sm bg-linear-to-br from-indigo-500 to-purple-600 p-2">
                <ServerStackIcon className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Edit Server Details
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Update the connection details for your MCP server
                </p>
              </div>
            </div>

            {server && (
              <div className="space-y-5">
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
                      value={server.name || ""}
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
                      value={server.description || ""}
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
                      value={server.url || ""}
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
                            className={`w-full flex items-center justify-between p-3 rounded-sm border-2 transition-all duration-200 ${
                              useCurrentUserToken
                                ? "border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-900/20"
                                : "border-neutral-200 bg-neutral-50 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800/50 dark:hover:border-neutral-600"
                            }`}
                          >
                            <div className="flex items-center space-x-3">
                              <div
                                className={`p-2 rounded-sm ${
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
                          className={`w-full flex items-center justify-between p-3 rounded-sm border-2 transition-all duration-200 ${
                            showAdvancedOptions
                              ? "border-neutral-300 bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800"
                              : "border-neutral-200 bg-neutral-50 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800/50 dark:hover:border-neutral-600"
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <div className="p-2 rounded-sm bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400">
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
                            <div className="p-4 rounded-sm bg-neutral-100/50 border border-neutral-200 dark:bg-neutral-800/30 dark:border-neutral-700">
                              <div className="flex items-center space-x-2 mb-3">
                                <KeyIcon className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
                                <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                  Custom Token
                                </Label>
                              </div>
                              <Input
                                name="token"
                                value={server.token || ""}
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
            )}

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 flex items-center space-x-2 rounded-sm bg-red-50 p-3 dark:bg-red-900/20"
                >
                  <ExclamationCircleIcon className="h-4 w-4 text-red-500" />
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {error}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-8 flex justify-end gap-3"
            >
              <Button
                onClick={handleClose}
                disabled={isEditing}
                className="inline-flex items-center gap-2 rounded-sm bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-200 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 disabled:opacity-50 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
              >
                Cancel
              </Button>
              <Button
                onClick={handleEditServer}
                disabled={
                  isEditing || !server?.name?.trim() || !server?.url?.trim()
                }
                className="inline-flex items-center gap-2 rounded-sm bg-linear-to-r from-indigo-600 to-indigo-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:from-indigo-500 hover:to-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isEditing ? (
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
                    Updating...
                  </>
                ) : (
                  <>
                    <SparklesIcon className="h-4 w-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}

import {
  FlipButton,
  FlipButtonBack,
  FlipButtonFront,
} from "@/components/animate-ui/components/buttons/flip";
import { Modal } from "@/components/animate-ui/primitives/headless/modal";
import { Input } from "@/components/base/Input";
import { useXyzen } from "@/store";
import type { McpServerCreate } from "@/types/mcp";
import { Field, Label, Radio, RadioGroup } from "@headlessui/react";
import {
  CheckCircleIcon,
  KeyIcon,
  ServerStackIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../animate-ui/primitives/buttons/button";

export function AddMcpServerModal() {
  const { t } = useTranslation();
  const {
    isAddMcpServerModalOpen,
    closeAddMcpServerModal,
    addMcpServer,
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

  const handleClose = () => {
    if (!isCreating) {
      setNewServer({ name: "", description: "", url: "", token: "" });
      setError(null);
      setIsSuccess(false);
      setAuthEnabled(false);
      setAuthMode(user && token ? "current" : "custom");
      closeAddMcpServerModal();
    }
  };

  return (
    <Modal
      isOpen={isAddMcpServerModalOpen}
      onClose={handleClose}
      title={t("mcp.addModal.title")}
      maxWidth="max-w-2xl"
    >
      <AnimatePresence mode="wait">
        {isSuccess ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="flex flex-col items-center justify-center py-12"
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
                {t("mcp.addModal.success.title")}
              </h3>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
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
            className="space-y-6"
          >
            {/* Header */}
            <div className="flex items-center space-x-3 border-b border-neutral-200 pb-4 dark:border-neutral-700">
              <div className="rounded-sm bg-linear-to-br from-indigo-500 to-purple-600 p-2">
                <ServerStackIcon className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                  {t("mcp.addModal.header.title")}
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {t("mcp.addModal.header.subtitle")}
                </p>
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-5">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Field>
                  <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
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
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Field>
                  <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    {t("mcp.addModal.fields.description.label")}
                  </Label>
                  <Input
                    name="description"
                    value={newServer.description}
                    onChange={handleInputChange}
                    placeholder={t(
                      "mcp.addModal.fields.description.placeholder",
                    )}
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
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <Field>
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      {t("mcp.addModal.fields.auth.label")}
                    </Label>

                    <FlipButton
                      from="top"
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
                    >
                      <FlipButtonFront
                        variant={authEnabled ? "secondary" : "outline"}
                        size="sm"
                        className={`w-56 ${
                          authEnabled
                            ? "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/50"
                            : ""
                        }`}
                      >
                        <span className="inline-flex items-center gap-2">
                          <span
                            className={`${
                              authEnabled
                                ? "bg-amber-500"
                                : "bg-neutral-400 dark:bg-neutral-500"
                            } h-2 w-2 rounded-full`}
                          />
                          <span className="text-sm">
                            {authEnabled
                              ? t("mcp.addModal.fields.auth.enabled")
                              : t("mcp.addModal.fields.auth.enable")}
                          </span>
                        </span>
                      </FlipButtonFront>
                      <FlipButtonBack
                        variant={authEnabled ? "secondary" : "default"}
                        size="sm"
                        className={`w-56 ${
                          authEnabled
                            ? "bg-amber-200 text-amber-900 hover:bg-amber-300 dark:bg-amber-900/60 dark:text-amber-100 dark:hover:bg-amber-900/70"
                            : ""
                        }`}
                      >
                        <span className="inline-flex items-center gap-2">
                          <span
                            className={`${
                              authEnabled ? "bg-amber-500" : "bg-emerald-500"
                            } h-2 w-2 rounded-full`}
                          />
                          <span className="text-sm">
                            {authEnabled
                              ? t("mcp.addModal.fields.auth.disable")
                              : t("mcp.addModal.fields.auth.enableNow")}
                          </span>
                        </span>
                      </FlipButtonBack>
                    </FlipButton>
                  </div>

                  <AnimatePresence initial={false}>
                    {authEnabled && (
                      <motion.div
                        initial={{ opacity: 0, height: 0, y: -10 }}
                        animate={{ opacity: 1, height: "auto", y: 0 }}
                        exit={{ opacity: 0, height: 0, y: -10 }}
                        transition={{ duration: 0.25 }}
                        className="mt-4 space-y-4 overflow-hidden"
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
                                  className={`cursor-pointer rounded-sm border-2 p-3 transition-all ${
                                    checked
                                      ? "border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-900/20"
                                      : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                      <div
                                        className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                                          checked
                                            ? "border-indigo-500 bg-indigo-500"
                                            : "border-neutral-300 dark:border-neutral-600"
                                        }`}
                                      >
                                        {checked && (
                                          <div className="h-2 w-2 rounded-full bg-white" />
                                        )}
                                      </div>
                                      <div className="flex items-center space-x-2">
                                        <UserIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                        <span className="text-sm font-medium text-neutral-900 dark:text-white">
                                          {t(
                                            "mcp.addModal.fields.auth.current.label",
                                          )}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <p className="ml-8 mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                                    {t("mcp.addModal.fields.auth.current.desc")}
                                  </p>
                                </div>
                              )}
                            </Radio>
                          )}

                          <Radio value="custom">
                            {({ checked }) => (
                              <div
                                className={`cursor-pointer rounded-sm border-2 p-3 transition-all ${
                                  checked
                                    ? "border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-900/20"
                                    : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-3">
                                    <div
                                      className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                                        checked
                                          ? "border-indigo-500 bg-indigo-500"
                                          : "border-neutral-300 dark:border-neutral-600"
                                      }`}
                                    >
                                      {checked && (
                                        <div className="h-2 w-2 rounded-full bg-white" />
                                      )}
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <KeyIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                      <span className="text-sm font-medium text-neutral-900 dark:text-white">
                                        {t(
                                          "mcp.addModal.fields.auth.custom.label",
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <p className="ml-8 mt-1 text-xs text-neutral-600 dark:text-neutral-400">
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
                            <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
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
              </motion.div>
            </div>

            {/* Error Message */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="rounded-sm border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20"
                >
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {error}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Actions */}
            <div className="flex items-center justify-end space-x-3 border-t border-neutral-200 pt-4 dark:border-neutral-700">
              <button
                onClick={handleClose}
                disabled={isCreating}
                className="px-6 py-2 rounded-sm border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                {t("mcp.addModal.actions.cancel")}
              </button>
              <Button
                onClick={handleAddServer}
                disabled={
                  isCreating || !newServer.name.trim() || !newServer.url.trim()
                }
                className="bg-linear-to-r from-indigo-600 to-indigo-700 px-6 py-2 text-white hover:from-indigo-500 hover:to-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
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
                  t("mcp.addModal.actions.add")
                )}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}

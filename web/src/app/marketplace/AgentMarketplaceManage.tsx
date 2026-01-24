"use client";

import { PlateReadmeEditor } from "@/components/editor/PlateReadmeEditor";
import { PlateReadmeViewer } from "@/components/editor/PlateReadmeViewer";
import { AgentGraphEditor } from "@/components/editors/AgentGraphEditor";
import { JsonEditor } from "@/components/editors/JsonEditor";
import ConfirmationModal from "@/components/modals/ConfirmationModal";
import { toast } from "sonner";
import {
  useListingHistory,
  useMarketplaceListing,
  usePublishVersion,
  useUnpublishAgent,
} from "@/hooks/useMarketplace";
import type { AgentSnapshot } from "@/service/marketplaceService";
import {
  marketplaceService,
  type ForkMode,
} from "@/service/marketplaceService";
import type { GraphConfig } from "@/types/graphConfig";
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  CodeBracketIcon,
  Cog6ToothIcon,
  CubeTransparentIcon,
  DocumentTextIcon,
  EyeIcon,
  GlobeAltIcon,
  HeartIcon,
  LockClosedIcon,
  LockOpenIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

interface AgentMarketplaceManageProps {
  marketplaceId: string;
  onBack: () => void;
}

/**
 * AgentMarketplaceManage Component
 *
 * Dedicated management view for an owned marketplace listing.
 * Allows editing README, unpublishing, and viewing stats.
 */
export default function AgentMarketplaceManage({
  marketplaceId,
  onBack,
}: AgentMarketplaceManageProps) {
  const { t } = useTranslation();
  const [showUnpublishConfirm, setShowUnpublishConfirm] = useState(false);
  const [isEditingReadme, setIsEditingReadme] = useState(false);
  const [readmeContent, setReadmeContent] = useState("");
  const [isSavingReadme, setIsSavingReadme] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [activeTab, setActiveTab] = useState<"editor" | "config" | "history">(
    "editor",
  );

  // Configuration editing state
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [graphConfig, setGraphConfig] = useState<GraphConfig | null>(null);
  const [graphConfigJson, setGraphConfigJson] = useState<string>("");
  const [graphConfigError, setGraphConfigError] = useState<string | null>(null);
  const [activeEditorTab, setActiveEditorTab] = useState(0);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isSavingForkMode, setIsSavingForkMode] = useState(false);

  const queryClient = useQueryClient();

  // Fetch listing data
  const {
    data: listing,
    isLoading,
    error,
  } = useMarketplaceListing(marketplaceId);

  // Fetch history data
  const { data: history, isLoading: isLoadingHistory } =
    useListingHistory(marketplaceId);

  // Mutations
  const unpublishMutation = useUnpublishAgent();
  const publishVersionMutation = usePublishVersion();

  const handleBack = () => {
    onBack();
  };

  const handleUnpublish = () => {
    if (!listing) return;
    unpublishMutation.mutate(listing.id, {
      onSuccess: () => {
        // Navigate back to marketplace after successful unpublish
        onBack();
      },
      onError: (error) => {
        console.error("Failed to unpublish agent:", error);
      },
    });
  };

  const startEditingReadme = () => {
    if (listing) {
      setReadmeContent(listing.readme || "");
      setIsEditingReadme(true);
    }
  };

  const cancelEditingReadme = () => {
    if (!listing?.readme) {
      // If no existing readme, keep editing or just clear?
      // Better to check if content changed.
    }
    setIsEditingReadme(false);
    setReadmeContent("");
  };

  const saveReadme = async () => {
    if (!listing) return;

    try {
      setIsSavingReadme(true);
      await marketplaceService.updateListing(listing.id, {
        readme: readmeContent,
      });

      // Invalidate query to refresh data - use correct query key pattern
      queryClient.invalidateQueries({
        queryKey: ["marketplace", "listing", listing.id],
      });

      setIsEditingReadme(false);
    } catch (error) {
      console.error("Failed to update README:", error);
    } finally {
      setIsSavingReadme(false);
    }
  };

  const handlePublish = async () => {
    if (!listing) return;
    try {
      setIsPublishing(true);
      await marketplaceService.updateListing(listing.id, {
        is_published: true,
      });
      // Invalidate all relevant queries with correct key patterns
      queryClient.invalidateQueries({
        queryKey: ["marketplace", "listing", listing.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["marketplace", "listings"],
      });
      queryClient.invalidateQueries({
        queryKey: ["marketplace", "my-listings"],
      });
      // Optionally show toast or notification
    } catch (error) {
      console.error("Failed to publish agent:", error);
    } finally {
      setIsPublishing(false);
    }
  };

  const handlePublishVersion = (version: number) => {
    if (!listing) return;
    publishVersionMutation.mutate(
      { marketplaceId: listing.id, version },
      {
        onSuccess: () => {
          // Success toast?
        },
      },
    );
  };

  const handleForkModeChange = async (newForkMode: ForkMode) => {
    if (!listing) return;
    try {
      setIsSavingForkMode(true);
      await marketplaceService.updateListing(listing.id, {
        fork_mode: newForkMode,
      });
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({
        queryKey: ["marketplace", "listing", listing.id],
      });
      toast.success(t("marketplace.manage.forkMode.success"));
    } catch (error) {
      console.error("Failed to update fork mode:", error);
      toast.error(t("marketplace.manage.forkMode.error"));
    } finally {
      setIsSavingForkMode(false);
    }
  };

  // Configuration editing handlers
  const handleGraphConfigChange = useCallback((config: GraphConfig) => {
    setGraphConfig(config);
    setGraphConfigJson(JSON.stringify(config, null, 2));
    setGraphConfigError(null);
  }, []);

  const handleJsonChange = useCallback(
    (value: string) => {
      setGraphConfigJson(value);
      if (!value.trim()) {
        setGraphConfig(null);
        setGraphConfigError(null);
        return;
      }
      try {
        const parsed = JSON.parse(value) as GraphConfig;
        setGraphConfig(parsed);
        setGraphConfigError(null);
      } catch {
        setGraphConfigError(t("marketplace.manage.config.invalidJson"));
      }
    },
    [t],
  );

  const handleJsonValidation = useCallback(
    (isValid: boolean, errors: string[]) => {
      setGraphConfigError(
        isValid
          ? null
          : errors[0] || t("marketplace.manage.config.invalidJson"),
      );
    },
    [t],
  );

  const handleEditorTabChange = useCallback(
    (index: number) => {
      if (activeEditorTab === 1 && index === 0 && graphConfigJson.trim()) {
        try {
          const parsed = JSON.parse(graphConfigJson) as GraphConfig;
          setGraphConfig(parsed);
          setGraphConfigError(null);
        } catch {
          // Keep error
        }
      }
      setActiveEditorTab(index);
    },
    [activeEditorTab, graphConfigJson],
  );

  const startEditingConfig = () => {
    const config = listing?.snapshot?.configuration?.graph_config;
    if (config) {
      const parsed = config as unknown as GraphConfig;
      setGraphConfig(parsed);
      setGraphConfigJson(JSON.stringify(config, null, 2));
    } else {
      // Create a default ReAct config if none exists
      // Must match backend's REACT_CONFIG structure for validation
      const defaultConfig: GraphConfig = {
        version: "2.0",
        metadata: {
          builtin_key: "react",
          pattern: "react",
          display_name: "ReAct Agent",
        },
        // Prompt stored in prompt_config.custom_instructions (not llm_config.prompt_template)
        prompt_config: {
          custom_instructions: "You are a helpful assistant.",
        },
        nodes: [
          {
            id: "agent",
            name: "ReAct Agent",
            type: "llm",
            llm_config: {
              prompt_template: "", // Backend will inject from prompt_config
              tools_enabled: true,
              output_key: "response",
            },
          },
          {
            id: "tools",
            name: "Tool Executor",
            type: "tool",
            tool_config: {
              execute_all: true,
            },
          },
        ],
        edges: [
          { from_node: "START", to_node: "agent" },
          { from_node: "agent", to_node: "tools", condition: "has_tool_calls" },
          { from_node: "agent", to_node: "END", condition: "no_tool_calls" },
          { from_node: "tools", to_node: "agent" },
        ],
        entry_point: "agent",
      };
      setGraphConfig(defaultConfig);
      setGraphConfigJson(JSON.stringify(defaultConfig, null, 2));
    }
    setGraphConfigError(null);
    setActiveEditorTab(0);
    setIsEditingConfig(true);
  };

  const cancelEditingConfig = () => {
    setIsEditingConfig(false);
    setGraphConfig(null);
    setGraphConfigJson("");
    setGraphConfigError(null);
  };

  const saveConfig = async () => {
    if (!listing) return;
    if (graphConfigError) {
      return;
    }

    let finalGraphConfig: Record<string, unknown> | null = null;
    if (graphConfigJson.trim()) {
      try {
        finalGraphConfig = JSON.parse(graphConfigJson);
      } catch {
        setGraphConfigError(t("marketplace.manage.config.invalidJson"));
        return;
      }
    }

    try {
      setIsSavingConfig(true);
      // Use the updateAgentAndPublish endpoint to update the agent and create a new version
      await marketplaceService.updateAgentAndPublish(listing.id, {
        commit_message: t("marketplace.manage.config.commitMessage", {
          defaultValue: "Updated agent configuration",
        }),
        graph_config: finalGraphConfig,
      });

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({
        queryKey: ["marketplace", "listing", listing.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["marketplace", "history", listing.id],
      });

      setIsEditingConfig(false);
      setGraphConfig(null);
      setGraphConfigJson("");
      toast.success(t("marketplace.manage.config.success"));
    } catch (error) {
      console.error("Failed to update configuration:", error);
      toast.error(t("marketplace.manage.config.error"));
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <ArrowPathIcon className="mx-auto h-8 w-8 animate-spin text-neutral-400" />
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Loading management view...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !listing) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="max-w-md relative w-full rounded-lg border border-red-500/50 bg-red-50 p-4 text-red-900 dark:bg-red-950/50 dark:text-red-400">
          <div className="text-sm">
            Failed to load listing. Please try again.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto bg-neutral-50 dark:bg-black">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header with back button */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={handleBack}
            className="group flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm transition-all hover:border-neutral-300 hover:shadow dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-700"
          >
            <ArrowLeftIcon className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            <span>Back to My Agents</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
              {listing.is_published ? "Published" : "Unpublished"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main Column - Editor */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header Info */}
            <div className="flex items-start gap-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              {listing.avatar ? (
                <img
                  src={listing.avatar}
                  alt={listing.name}
                  className="h-20 w-20 rounded-xl object-cover ring-2 ring-neutral-100 dark:ring-neutral-800"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-linear-to-br from-purple-500 via-pink-500 to-indigo-500 text-2xl font-bold text-white shadow-md">
                  {listing.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                  {listing.name}
                </h1>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400 line-clamp-2">
                  {listing.description || "No description provided"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {listing.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-0.5 text-xs font-medium text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-400"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-neutral-200 dark:border-neutral-800">
              <button
                onClick={() => setActiveTab("editor")}
                className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === "editor"
                    ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                    : "border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                }`}
              >
                <PencilIcon className="h-4 w-4" />
                Editor
              </button>
              <button
                onClick={() => setActiveTab("config")}
                className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === "config"
                    ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                    : "border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                }`}
              >
                <Cog6ToothIcon className="h-4 w-4" />
                {t("marketplace.manage.config.title")}
              </button>
              <button
                onClick={() => setActiveTab("history")}
                className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === "history"
                    ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                    : "border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                }`}
              >
                <ClockIcon className="h-4 w-4" />
                Version History
              </button>
            </div>

            {/* Tab Content */}
            {activeTab === "editor" && (
              /* README Editor */
              <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
                  <div className="flex items-center gap-2">
                    <DocumentTextIcon className="h-5 w-5 text-neutral-500 dark:text-neutral-400" />
                    <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                      README Content
                    </h2>
                  </div>
                  {!isEditingReadme && (
                    <button
                      onClick={startEditingReadme}
                      className="flex items-center gap-1.5 rounded-md bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-300 dark:hover:bg-indigo-900/30"
                    >
                      <PencilIcon className="h-4 w-4" />
                      Edit
                    </button>
                  )}
                </div>

                <div className="p-6">
                  {isEditingReadme ? (
                    <div className="space-y-4">
                      <PlateReadmeEditor
                        initialContent={readmeContent}
                        onChange={setReadmeContent}
                        disabled={isSavingReadme}
                        placeholder="# Agent Documentation\n\nDescribe your agent here..."
                      />
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={cancelEditingReadme}
                          disabled={isSavingReadme}
                          className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={saveReadme}
                          disabled={isSavingReadme}
                          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                        >
                          {isSavingReadme ? (
                            <ArrowPathIcon className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircleIcon className="h-4 w-4" />
                          )}
                          Save Changes
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="prose prose-neutral max-w-none dark:prose-invert">
                      {listing.readme ? (
                        <PlateReadmeViewer content={listing.readme} />
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center text-neutral-500 dark:text-neutral-400">
                          <DocumentTextIcon className="mb-3 h-12 w-12 opacity-20" />
                          <p>No README content yet.</p>
                          <button
                            onClick={startEditingReadme}
                            className="mt-2 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                          >
                            Write one now
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "config" && (
              /* Configuration Editor */
              <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
                  <div className="flex items-center gap-2">
                    <Cog6ToothIcon className="h-5 w-5 text-neutral-500 dark:text-neutral-400" />
                    <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                      {t("marketplace.manage.config.title")}
                    </h2>
                  </div>
                  {!isEditingConfig && (
                    <button
                      onClick={startEditingConfig}
                      className="flex items-center gap-1.5 rounded-md bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-300 dark:hover:bg-indigo-900/30"
                    >
                      <PencilIcon className="h-4 w-4" />
                      {t("marketplace.manage.config.edit")}
                    </button>
                  )}
                </div>

                <div className="p-6">
                  {isEditingConfig ? (
                    <div className="flex flex-col" style={{ height: "60vh" }}>
                      <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
                        {t("marketplace.manage.config.description")}
                      </p>

                      {/* Graph/JSON Editor Tabs */}
                      <TabGroup
                        selectedIndex={activeEditorTab}
                        onChange={handleEditorTabChange}
                        className="flex flex-1 flex-col min-h-0"
                      >
                        <TabList className="shrink-0 flex gap-1 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-lg">
                          <Tab className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 data-[selected]:bg-white data-[selected]:text-indigo-600 data-[selected]:shadow-sm dark:data-[selected]:bg-neutral-700 dark:data-[selected]:text-indigo-400 transition-all outline-none">
                            <CubeTransparentIcon className="w-4 h-4" />
                            {t("marketplace.manage.config.visualEditor")}
                          </Tab>
                          <Tab className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 data-[selected]:bg-white data-[selected]:text-indigo-600 data-[selected]:shadow-sm dark:data-[selected]:bg-neutral-700 dark:data-[selected]:text-indigo-400 transition-all outline-none">
                            <CodeBracketIcon className="w-4 h-4" />
                            {t("marketplace.manage.config.jsonEditor")}
                            {graphConfigError && (
                              <span className="w-2 h-2 rounded-full bg-red-500" />
                            )}
                          </Tab>
                        </TabList>

                        <TabPanels className="flex-1 mt-3 min-h-0">
                          {/* Visual Editor Panel */}
                          <TabPanel className="h-full">
                            <AgentGraphEditor
                              value={graphConfig}
                              onChange={handleGraphConfigChange}
                              height="100%"
                              graphId={listing.id}
                            />
                          </TabPanel>

                          {/* JSON Editor Panel */}
                          <TabPanel className="h-full flex flex-col">
                            <p className="shrink-0 mb-3 text-xs text-neutral-500 dark:text-neutral-400">
                              {t("marketplace.manage.config.jsonDescription")}
                            </p>
                            <div className="flex-1 min-h-0">
                              <JsonEditor
                                value={graphConfigJson}
                                onChange={handleJsonChange}
                                onValidationChange={handleJsonValidation}
                                height="100%"
                              />
                            </div>
                            {graphConfigError && (
                              <p className="shrink-0 mt-2 text-xs text-red-600 dark:text-red-400">
                                {graphConfigError}
                              </p>
                            )}
                          </TabPanel>
                        </TabPanels>
                      </TabGroup>

                      {/* Actions */}
                      <div className="shrink-0 mt-4 flex justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-700">
                        <button
                          onClick={cancelEditingConfig}
                          disabled={isSavingConfig}
                          className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
                        >
                          {t("marketplace.manage.config.cancel")}
                        </button>
                        <button
                          onClick={saveConfig}
                          disabled={isSavingConfig || !!graphConfigError}
                          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                        >
                          {isSavingConfig ? (
                            <ArrowPathIcon className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircleIcon className="h-4 w-4" />
                          )}
                          {isSavingConfig
                            ? t("marketplace.manage.config.saving")
                            : t("marketplace.manage.config.save")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {listing.snapshot?.configuration?.graph_config ? (
                        <div style={{ height: "400px" }}>
                          <JsonEditor
                            value={JSON.stringify(
                              listing.snapshot.configuration.graph_config,
                              null,
                              2,
                            )}
                            onChange={() => {}}
                            readOnly={true}
                            height="100%"
                          />
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center text-neutral-500 dark:text-neutral-400">
                          <Cog6ToothIcon className="mb-3 h-12 w-12 opacity-20" />
                          <p>{t("marketplace.manage.config.empty")}</p>
                          <button
                            onClick={startEditingConfig}
                            className="mt-2 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                          >
                            {t("marketplace.manage.config.configureNow")}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "history" && (
              /* Version History */
              <div className="space-y-4">
                {isLoadingHistory ? (
                  <div className="flex justify-center py-12">
                    <ArrowPathIcon className="h-8 w-8 animate-spin text-neutral-400" />
                  </div>
                ) : history && history.length > 0 ? (
                  history.map((snapshot: AgentSnapshot) => (
                    <div
                      key={snapshot.id}
                      className={`relative flex items-start gap-4 rounded-xl border p-4 transition-all ${
                        listing.active_snapshot_id === snapshot.id
                          ? "border-indigo-200 bg-indigo-50 dark:border-indigo-900/50 dark:bg-indigo-900/10"
                          : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
                      }`}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
                        <span className="font-mono text-sm font-bold text-neutral-600 dark:text-neutral-400">
                          v{snapshot.version}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
                            {snapshot.commit_message ||
                              (snapshot.version === 1
                                ? "Initial Release"
                                : "Updated snapshot")}
                          </h3>
                          {listing.active_snapshot_id === snapshot.id ? (
                            <span className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              <CheckCircleIcon className="h-3 w-3" />
                              Active
                            </span>
                          ) : (
                            <button
                              onClick={() =>
                                handlePublishVersion(snapshot.version)
                              }
                              disabled={publishVersionMutation.isPending}
                              className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                            >
                              Publish this version
                            </button>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">
                          Created{" "}
                          {new Date(snapshot.created_at).toLocaleString()}
                        </p>
                        <div className="mt-3 flex gap-2">
                          {/* Snapshot details could go here */}
                          <div className="flex items-center gap-2 text-xs text-neutral-500">
                            <span>Model: {snapshot.configuration.model}</span>
                            <span>•</span>
                            <span>
                              MCP Servers: {snapshot.mcp_server_configs.length}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-sm text-neutral-500">
                    No history available.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column - Stats & Actions */}
          <div className="space-y-6">
            {/* Stats Card */}
            <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Performance
              </h3>
              <div className="grid grid-cols-1 gap-4">
                <div className="flex items-center justify-between rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800/50">
                  <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                    <EyeIcon className="h-5 w-5" />
                    <span>Views</span>
                  </div>
                  <span className="font-bold text-neutral-900 dark:text-neutral-100">
                    {listing.views_count}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800/50">
                  <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                    <HeartIcon className="h-5 w-5" />
                    <span>Likes</span>
                  </div>
                  <span className="font-bold text-neutral-900 dark:text-neutral-100">
                    {listing.likes_count}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800/50">
                  <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                    <ArrowPathIcon className="h-5 w-5" />
                    <span>Forks</span>
                  </div>
                  <span className="font-bold text-neutral-900 dark:text-neutral-100">
                    {listing.forks_count}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions Card */}
            <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Actions
              </h3>
              <div className="space-y-3">
                {listing.is_published ? (
                  <button
                    onClick={() => setShowUnpublishConfirm(true)}
                    disabled={unpublishMutation.isPending}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    <TrashIcon className="h-4 w-4" />
                    {unpublishMutation.isPending
                      ? "Unpublishing..."
                      : "Unpublish Agent"}
                  </button>
                ) : (
                  <button
                    onClick={handlePublish}
                    disabled={isPublishing}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50 dark:bg-green-600 dark:hover:bg-green-700"
                  >
                    {isPublishing ? (
                      <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    ) : (
                      <GlobeAltIcon className="h-4 w-4" />
                    )}
                    {isPublishing ? "Publishing..." : "Publish Agent"}
                  </button>
                )}
              </div>
            </div>

            {/* Fork Mode Settings Card */}
            <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                {t("marketplace.manage.forkMode.title")}
              </h3>
              <div className="space-y-3">
                <button
                  onClick={() => handleForkModeChange("editable")}
                  disabled={
                    isSavingForkMode || listing.fork_mode === "editable"
                  }
                  className={`flex w-full items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors ${
                    listing.fork_mode === "editable"
                      ? "border-green-500 bg-green-50 dark:border-green-600 dark:bg-green-900/20"
                      : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      listing.fork_mode === "editable"
                        ? "bg-green-500 text-white"
                        : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                    }`}
                  >
                    <LockOpenIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-neutral-900 dark:text-neutral-100">
                      {t("marketplace.forkMode.editable")}
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">
                      {t("marketplace.forkMode.editableDescription")}
                    </div>
                  </div>
                  {listing.fork_mode === "editable" && (
                    <CheckCircleIcon className="h-5 w-5 shrink-0 text-green-500" />
                  )}
                </button>
                <button
                  onClick={() => handleForkModeChange("locked")}
                  disabled={isSavingForkMode || listing.fork_mode === "locked"}
                  className={`flex w-full items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors ${
                    listing.fork_mode === "locked"
                      ? "border-amber-500 bg-amber-50 dark:border-amber-600 dark:bg-amber-900/20"
                      : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      listing.fork_mode === "locked"
                        ? "bg-amber-500 text-white"
                        : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                    }`}
                  >
                    <LockClosedIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-neutral-900 dark:text-neutral-100">
                      {t("marketplace.forkMode.locked")}
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">
                      {t("marketplace.forkMode.lockedDescription")}
                    </div>
                  </div>
                  {listing.fork_mode === "locked" && (
                    <CheckCircleIcon className="h-5 w-5 shrink-0 text-amber-500" />
                  )}
                </button>
                {isSavingForkMode && (
                  <div className="flex items-center justify-center gap-2 py-2 text-sm text-neutral-500">
                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    <span>{t("marketplace.manage.forkMode.saving")}</span>
                  </div>
                )}
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {t("marketplace.manage.forkMode.help")}
                </p>
              </div>
            </div>

            {/* Metadata Card */}
            <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Metadata
              </h3>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="block text-xs text-neutral-500 dark:text-neutral-500">
                    Last Updated
                  </span>
                  <span className="font-medium text-neutral-900 dark:text-neutral-200">
                    {new Date(listing.updated_at).toLocaleDateString()}
                  </span>
                </div>
                {listing.first_published_at && (
                  <div>
                    <span className="block text-xs text-neutral-500 dark:text-neutral-500">
                      First Published
                    </span>
                    <span className="font-medium text-neutral-900 dark:text-neutral-200">
                      {new Date(
                        listing.first_published_at,
                      ).toLocaleDateString()}
                    </span>
                  </div>
                )}
                <div>
                  <span className="block text-xs text-neutral-500 dark:text-neutral-500">
                    Version
                  </span>
                  <span className="font-medium text-neutral-900 dark:text-neutral-200">
                    v{listing.snapshot?.version}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Unpublish Confirmation Modal */}
      {listing && (
        <ConfirmationModal
          isOpen={showUnpublishConfirm}
          onClose={() => setShowUnpublishConfirm(false)}
          onConfirm={handleUnpublish}
          title="Unpublish Agent"
          message={`Are you sure you want to unpublish "${listing.name}"? It will be removed from the marketplace, but you can republish it later if needed.`}
          confirmLabel={
            unpublishMutation.isPending ? "Unpublishing..." : "Unpublish"
          }
          cancelLabel="Cancel"
          destructive={true}
        />
      )}
    </div>
  );
}

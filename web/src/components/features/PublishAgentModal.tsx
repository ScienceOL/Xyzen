"use client";

import { Modal } from "@/components/animate-ui/components/animate/modal";
import { usePublishAgent } from "@/hooks/useMarketplace";
import { Button, Field, Label, Switch } from "@headlessui/react";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  LockClosedIcon,
  LockOpenIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ForkMode } from "@/service/marketplaceService";

interface PublishAgentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  agentName: string;
  agentDescription?: string;
  /** Legacy prompt field - used for preview display only, not for validation */
  agentPrompt?: string;
  graphConfig?: Record<string, unknown> | null;
  mcpServers?: Array<{ id: string; name: string; description?: string }>;
  knowledgeSetInfo?: { name: string; file_count: number };
  isPublished?: boolean;
  readme?: string | null;
  onPublishSuccess?: (marketplaceId: string) => void;
}

/**
 * PublishAgentModal Component
 *
 * Modal for publishing an agent to the marketplace with commit message
 * and visibility controls.
 */
export default function PublishAgentModal({
  open,
  onOpenChange,
  agentId,
  agentName,
  agentDescription,
  agentPrompt,
  graphConfig,
  mcpServers = [],
  knowledgeSetInfo,
  isPublished = false,
  readme,
  onPublishSuccess,
}: PublishAgentModalProps) {
  const { t } = useTranslation();
  const [commitMessage, setCommitMessage] = useState("");
  const [readmeContent, setReadmeContent] = useState(readme || "");
  const [publishImmediately, setPublishImmediately] = useState(true);
  const [forkMode, setForkMode] = useState<ForkMode>("editable");
  const [showPreview, setShowPreview] = useState(false);

  const publishMutation = usePublishAgent();

  const handlePublish = async () => {
    if (!commitMessage.trim()) {
      return;
    }

    try {
      const response = await publishMutation.mutateAsync({
        agent_id: agentId,
        commit_message: commitMessage.trim(),
        is_published: publishImmediately,
        readme: readmeContent.trim() || null,
        fork_mode: forkMode,
      });

      // Success callback
      if (onPublishSuccess) {
        onPublishSuccess(response.marketplace_id);
      }

      // Reset and close
      setCommitMessage("");
      setShowPreview(false);
      onOpenChange(false);
    } catch (error) {
      // Error is handled by the mutation
      console.error("Failed to publish agent:", error);
    }
  };

  // Check for non-empty graphConfig to match backend validation (Python {} is falsy)
  const hasValidConfig = !!graphConfig && Object.keys(graphConfig).length > 0;
  const canPublish = commitMessage.trim().length > 0 && hasValidConfig;

  return (
    <Modal isOpen={open} onClose={() => onOpenChange(false)}>
      <div className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-white p-6 dark:bg-neutral-900">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            {isPublished
              ? t("marketplace.publish.titleUpdate")
              : t("marketplace.publish.title")}
          </h2>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            {isPublished
              ? t("marketplace.publish.descriptionUpdate")
              : t("marketplace.publish.description")}
          </p>
        </div>

        <div className="space-y-6 py-4">
          {/* Validation Alert */}
          {!hasValidConfig && (
            <div className="relative w-full rounded-lg border border-red-500/50 bg-red-50 p-4 text-red-900 dark:bg-red-950/50 dark:text-red-400">
              <div className="flex gap-2">
                <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
                <div className="text-sm">
                  {t("marketplace.publish.validation.noConfig")}
                </div>
              </div>
            </div>
          )}

          {/* Info Alert */}
          <div className="relative w-full rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
            <div className="flex gap-2">
              <InformationCircleIcon className="h-4 w-4 shrink-0" />
              <div className="text-sm">
                <strong>{t("marketplace.publish.info.title")}</strong>{" "}
                {t("marketplace.publish.info.content")}{" "}
                <strong>{t("marketplace.publish.info.note")}</strong>{" "}
                {t("marketplace.publish.info.noteContent")}
              </div>
            </div>
          </div>

          {/* Commit Message */}
          <Field className="space-y-2">
            <Label className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {t("marketplace.publish.commitMessage.label")}{" "}
              <span className="text-red-500">*</span>
            </Label>
            <textarea
              id="commit-message"
              placeholder={t("marketplace.publish.commitMessage.placeholder")}
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
            />
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {t("marketplace.publish.commitMessage.charCount", {
                count: commitMessage.length,
              })}
            </p>
          </Field>

          {/* README Editor */}
          <Field className="space-y-2">
            <Label className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {t("marketplace.publish.readme.label")}
            </Label>
            <textarea
              id="readme-editor"
              placeholder={t("marketplace.publish.readme.placeholder")}
              value={readmeContent}
              onChange={(e) => setReadmeContent(e.target.value)}
              rows={6}
              className="w-full resize-none rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
            />
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {t("marketplace.publish.readme.hint")}
            </p>
          </Field>

          {/* Publish Toggle */}
          <Field className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="space-y-0.5">
              <Label
                htmlFor="publish-toggle"
                className="cursor-pointer text-sm font-medium text-neutral-900 dark:text-neutral-100"
              >
                {t("marketplace.publish.publishImmediately.label")}
              </Label>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {t("marketplace.publish.publishImmediately.description")}
              </p>
            </div>
            <Switch
              id="publish-toggle"
              checked={publishImmediately}
              onChange={setPublishImmediately}
              className={`${
                publishImmediately
                  ? "bg-indigo-600"
                  : "bg-neutral-200 dark:bg-neutral-700"
              } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2`}
            >
              <span
                className={`${
                  publishImmediately ? "translate-x-6" : "translate-x-1"
                } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
              />
            </Switch>
          </Field>

          {/* Fork Mode Selector */}
          <Field className="space-y-3">
            <Label className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {t("marketplace.publish.forkMode.label")}
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setForkMode("editable")}
                className={`flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors ${
                  forkMode === "editable"
                    ? "border-green-500 bg-green-50 dark:border-green-600 dark:bg-green-900/20"
                    : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600"
                }`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    forkMode === "editable"
                      ? "bg-green-500 text-white"
                      : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                  }`}
                >
                  <LockOpenIcon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-neutral-900 dark:text-neutral-100">
                    {t("marketplace.forkMode.editable")}
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    {t("marketplace.forkMode.editableDescription")}
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setForkMode("locked")}
                className={`flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors ${
                  forkMode === "locked"
                    ? "border-amber-500 bg-amber-50 dark:border-amber-600 dark:bg-amber-900/20"
                    : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600"
                }`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    forkMode === "locked"
                      ? "bg-amber-500 text-white"
                      : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                  }`}
                >
                  <LockClosedIcon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-neutral-900 dark:text-neutral-100">
                    {t("marketplace.forkMode.locked")}
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    {t("marketplace.forkMode.lockedDescription")}
                  </div>
                </div>
              </button>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {t("marketplace.publish.forkMode.help")}
            </p>
          </Field>

          {/* Preview Toggle */}
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {showPreview
              ? t("marketplace.publish.preview.hide")
              : t("marketplace.publish.preview.show")}
          </button>

          {/* Preview Section */}
          {showPreview && (
            <div className="space-y-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <h4 className="font-semibold text-neutral-900 dark:text-neutral-100">
                {t("marketplace.publish.preview.title")}
              </h4>

              {/* Agent Info */}
              <div className="space-y-2">
                <div>
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    {t("marketplace.publish.preview.name")}
                  </p>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    {agentName}
                  </p>
                </div>

                {agentDescription && (
                  <div>
                    <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      {t("marketplace.publish.preview.description")}
                    </p>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      {agentDescription}
                    </p>
                  </div>
                )}

                {agentPrompt && (
                  <div>
                    <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      {t("marketplace.publish.preview.systemPrompt")}
                    </p>
                    <p className="max-h-32 overflow-y-auto text-sm text-neutral-600 dark:text-neutral-400">
                      {agentPrompt.slice(0, 200)}
                      {agentPrompt.length > 200 ? "..." : ""}
                    </p>
                  </div>
                )}
              </div>

              {/* MCP Requirements */}
              {mcpServers.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    {t("marketplace.publish.preview.mcpServers", {
                      count: mcpServers.length,
                    })}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {mcpServers.map((mcp) => (
                      <li
                        key={mcp.id}
                        className="text-sm text-neutral-600 dark:text-neutral-400"
                      >
                        • {mcp.name}
                        {mcp.description && ` - ${mcp.description}`}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    {t("marketplace.publish.preview.mcpWarning")}
                  </p>
                </div>
              )}

              {/* Knowledge Base Info */}
              {knowledgeSetInfo && knowledgeSetInfo.file_count > 0 && (
                <div>
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    {t("marketplace.publish.preview.knowledgeBase")}
                  </p>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    {t("marketplace.publish.preview.knowledgeFiles", {
                      name: knowledgeSetInfo.name,
                      count: knowledgeSetInfo.file_count,
                    })}
                  </p>
                  <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                    {t("marketplace.publish.preview.knowledgeInfo")}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Success Message */}
          {publishMutation.isSuccess && (
            <div className="relative w-full rounded-lg border border-green-500/50 bg-green-50 p-4 text-green-900 dark:bg-green-950/50 dark:text-green-400">
              <div className="flex gap-2">
                <CheckCircleIcon className="h-4 w-4 shrink-0 text-green-600" />
                <div className="text-sm">
                  {isPublished
                    ? t("marketplace.publish.success.updated")
                    : t("marketplace.publish.success.published")}
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {publishMutation.isError && (
            <div className="relative w-full rounded-lg border border-red-500/50 bg-red-50 p-4 text-red-900 dark:bg-red-950/50 dark:text-red-400">
              <div className="flex gap-2">
                <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
                <div className="text-sm">
                  {publishMutation.error instanceof Error
                    ? publishMutation.error.message
                    : t("marketplace.publish.error.default")}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button
            onClick={() => {
              setCommitMessage("");
              setShowPreview(false);
              onOpenChange(false);
            }}
            disabled={publishMutation.isPending}
            className="rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {t("marketplace.publish.actions.cancel")}
          </Button>
          <Button
            onClick={handlePublish}
            disabled={!canPublish || publishMutation.isPending}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
          >
            {publishMutation.isPending
              ? t("marketplace.publish.actions.publishing")
              : isPublished
                ? t("marketplace.publish.actions.update")
                : publishImmediately
                  ? t("marketplace.publish.actions.publish")
                  : t("marketplace.publish.actions.saveAsDraft")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

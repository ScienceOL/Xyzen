"use client";

import { SheetModal } from "@/components/animate-ui/components/animate/sheet-modal";
import { FieldGroup } from "@/components/base/FieldGroup";
import { Textarea } from "@/components/base/Textarea";
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
    <SheetModal isOpen={open} onClose={() => onOpenChange(false)} size="md">
      {/* Header */}
      <div className="shrink-0 border-b border-neutral-200/60 px-5 pb-3 pt-5 dark:border-neutral-800/60">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          {isPublished
            ? t("marketplace.publish.titleUpdate")
            : t("marketplace.publish.title")}
        </h2>
        <p className="mt-1 text-[13px] text-neutral-500 dark:text-neutral-400">
          {isPublished
            ? t("marketplace.publish.descriptionUpdate")
            : t("marketplace.publish.description")}
        </p>
      </div>

      {/* Scrollable Content */}
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        <div className="space-y-6 px-5 py-5">
          {/* Validation Alert */}
          {!hasValidConfig && (
            <div className="flex gap-2.5 rounded-lg bg-red-50/80 px-4 py-3 dark:bg-red-950/30">
              <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-red-500 dark:text-red-400" />
              <p className="text-[13px] text-red-700 dark:text-red-400">
                {t("marketplace.publish.validation.noConfig")}
              </p>
            </div>
          )}

          {/* Info Alert */}
          <div className="flex gap-2.5 rounded-lg bg-neutral-100/60 px-4 py-3 dark:bg-white/[0.04]">
            <InformationCircleIcon className="h-4 w-4 shrink-0 text-neutral-400" />
            <p className="text-[13px] text-neutral-600 dark:text-neutral-400">
              <strong>{t("marketplace.publish.info.title")}</strong>{" "}
              {t("marketplace.publish.info.content")}{" "}
              <strong>{t("marketplace.publish.info.note")}</strong>{" "}
              {t("marketplace.publish.info.noteContent")}
            </p>
          </div>

          {/* Commit Message */}
          <FieldGroup
            label={t("marketplace.publish.commitMessage.label")}
            required
            hint={t("marketplace.publish.commitMessage.charCount", {
              count: commitMessage.length,
            })}
          >
            <Textarea
              id="commit-message"
              placeholder={t("marketplace.publish.commitMessage.placeholder")}
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              rows={3}
            />
          </FieldGroup>

          {/* README Editor */}
          <FieldGroup
            label={t("marketplace.publish.readme.label")}
            hint={t("marketplace.publish.readme.hint")}
          >
            <Textarea
              id="readme-editor"
              placeholder={t("marketplace.publish.readme.placeholder")}
              value={readmeContent}
              onChange={(e) => setReadmeContent(e.target.value)}
              rows={6}
              className="font-mono"
            />
          </FieldGroup>

          {/* Publish Toggle */}
          <Field className="flex items-center justify-between rounded-lg bg-neutral-100/60 px-4 py-3.5 dark:bg-white/[0.04]">
            <div className="space-y-0.5 pr-4">
              <Label
                htmlFor="publish-toggle"
                className="cursor-pointer text-[13px] font-medium text-neutral-900 dark:text-neutral-100"
              >
                {t("marketplace.publish.publishImmediately.label")}
              </Label>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {t("marketplace.publish.publishImmediately.description")}
              </p>
            </div>
            <Switch
              id="publish-toggle"
              checked={publishImmediately}
              onChange={setPublishImmediately}
              className={`${
                publishImmediately
                  ? "bg-indigo-500"
                  : "bg-neutral-300 dark:bg-neutral-600"
              } relative inline-flex h-[26px] w-[46px] shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:ring-offset-2`}
            >
              <span
                className={`${
                  publishImmediately
                    ? "translate-x-[22px]"
                    : "translate-x-[3px]"
                } inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform`}
              />
            </Switch>
          </Field>

          {/* Fork Mode Selector */}
          <FieldGroup
            label={t("marketplace.publish.forkMode.label")}
            hint={t("marketplace.publish.forkMode.help")}
          >
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setForkMode("editable")}
                className={`flex items-center gap-3 rounded-lg p-3 text-left transition-colors ${
                  forkMode === "editable"
                    ? "bg-green-50/80 ring-1 ring-green-500/30 dark:bg-green-900/15 dark:ring-green-500/20"
                    : "bg-neutral-100/60 hover:bg-neutral-100 dark:bg-white/[0.04] dark:hover:bg-white/[0.06]"
                }`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    forkMode === "editable"
                      ? "bg-green-500 text-white"
                      : "bg-neutral-200/70 text-neutral-500 dark:bg-neutral-700/70 dark:text-neutral-400"
                  }`}
                >
                  <LockOpenIcon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
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
                className={`flex items-center gap-3 rounded-lg p-3 text-left transition-colors ${
                  forkMode === "locked"
                    ? "bg-amber-50/80 ring-1 ring-amber-500/30 dark:bg-amber-900/15 dark:ring-amber-500/20"
                    : "bg-neutral-100/60 hover:bg-neutral-100 dark:bg-white/[0.04] dark:hover:bg-white/[0.06]"
                }`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    forkMode === "locked"
                      ? "bg-amber-500 text-white"
                      : "bg-neutral-200/70 text-neutral-500 dark:bg-neutral-700/70 dark:text-neutral-400"
                  }`}
                >
                  <LockClosedIcon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
                    {t("marketplace.forkMode.locked")}
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    {t("marketplace.forkMode.lockedDescription")}
                  </div>
                </div>
              </button>
            </div>
          </FieldGroup>

          {/* Preview Toggle */}
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="text-[13px] font-medium text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            {showPreview
              ? t("marketplace.publish.preview.hide")
              : t("marketplace.publish.preview.show")}
          </button>

          {/* Preview Section */}
          {showPreview && (
            <div className="space-y-3 rounded-lg bg-neutral-100/60 p-4 dark:bg-white/[0.04]">
              <h4 className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
                {t("marketplace.publish.preview.title")}
              </h4>

              {/* Agent Info */}
              <div className="space-y-2">
                <div>
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    {t("marketplace.publish.preview.name")}
                  </p>
                  <p className="text-[13px] text-neutral-700 dark:text-neutral-300">
                    {agentName}
                  </p>
                </div>

                {agentDescription && (
                  <div>
                    <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      {t("marketplace.publish.preview.description")}
                    </p>
                    <p className="text-[13px] text-neutral-700 dark:text-neutral-300">
                      {agentDescription}
                    </p>
                  </div>
                )}

                {agentPrompt && (
                  <div>
                    <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      {t("marketplace.publish.preview.systemPrompt")}
                    </p>
                    <p className="custom-scrollbar max-h-32 overflow-y-auto text-[13px] text-neutral-700 dark:text-neutral-300">
                      {agentPrompt.slice(0, 200)}
                      {agentPrompt.length > 200 ? "..." : ""}
                    </p>
                  </div>
                )}
              </div>

              {/* MCP Requirements */}
              {mcpServers.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    {t("marketplace.publish.preview.mcpServers", {
                      count: mcpServers.length,
                    })}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {mcpServers.map((mcp) => (
                      <li
                        key={mcp.id}
                        className="text-[13px] text-neutral-700 dark:text-neutral-300"
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
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    {t("marketplace.publish.preview.knowledgeBase")}
                  </p>
                  <p className="text-[13px] text-neutral-700 dark:text-neutral-300">
                    {t("marketplace.publish.preview.knowledgeFiles", {
                      name: knowledgeSetInfo.name,
                      count: knowledgeSetInfo.file_count,
                    })}
                  </p>
                  <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                    {t("marketplace.publish.preview.knowledgeInfo")}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Success Message */}
          {publishMutation.isSuccess && (
            <div className="flex gap-2.5 rounded-lg bg-green-50/80 px-4 py-3 dark:bg-green-950/30">
              <CheckCircleIcon className="h-4 w-4 shrink-0 text-green-500" />
              <p className="text-[13px] text-green-700 dark:text-green-400">
                {isPublished
                  ? t("marketplace.publish.success.updated")
                  : t("marketplace.publish.success.published")}
              </p>
            </div>
          )}

          {/* Error Message */}
          {publishMutation.isError && (
            <div className="flex gap-2.5 rounded-lg bg-red-50/80 px-4 py-3 dark:bg-red-950/30">
              <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-red-500 dark:text-red-400" />
              <p className="text-[13px] text-red-700 dark:text-red-400">
                {publishMutation.error instanceof Error
                  ? publishMutation.error.message
                  : t("marketplace.publish.error.default")}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-neutral-200/60 px-5 py-4 dark:border-neutral-800/60">
        <div className="flex justify-end gap-2.5">
          <Button
            onClick={() => {
              setCommitMessage("");
              setShowPreview(false);
              onOpenChange(false);
            }}
            disabled={publishMutation.isPending}
            className="rounded-lg bg-neutral-100/80 px-4 py-2 text-[13px] font-medium text-neutral-700 transition-colors hover:bg-neutral-200/80 disabled:opacity-50 dark:bg-white/[0.06] dark:text-neutral-300 dark:hover:bg-white/[0.1]"
          >
            {t("marketplace.publish.actions.cancel")}
          </Button>
          <Button
            onClick={handlePublish}
            disabled={!canPublish || publishMutation.isPending}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-indigo-600 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
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
    </SheetModal>
  );
}

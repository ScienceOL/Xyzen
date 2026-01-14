"use client";

import { Modal } from "@/components/animate-ui/components/animate/modal";
import { usePublishAgent } from "@/hooks/useMarketplace";
import { Button, Field, Label, Switch } from "@headlessui/react";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";

interface PublishAgentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  agentName: string;
  agentDescription?: string;
  agentPrompt?: string;
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
  mcpServers = [],
  knowledgeSetInfo,
  isPublished = false,
  readme,
  onPublishSuccess,
}: PublishAgentModalProps) {
  const [commitMessage, setCommitMessage] = useState("");
  const [readmeContent, setReadmeContent] = useState(readme || "");
  const [publishImmediately, setPublishImmediately] = useState(true);
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

  const canPublish = commitMessage.trim().length > 0 && agentPrompt;

  return (
    <Modal isOpen={open} onClose={() => onOpenChange(false)}>
      <div className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-white p-6 dark:bg-neutral-900">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            {isPublished
              ? "Update Marketplace Listing"
              : "Publish to Marketplace"}
          </h2>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            {isPublished
              ? "Create a new version of your agent for the community."
              : "Share your agent with the community. You can update or unpublish it anytime."}
          </p>
        </div>

        <div className="space-y-6 py-4">
          {/* Validation Alert */}
          {!agentPrompt && (
            <div className="relative w-full rounded-lg border border-red-500/50 bg-red-50 p-4 text-red-900 dark:bg-red-950/50 dark:text-red-400">
              <div className="flex gap-2">
                <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
                <div className="text-sm">
                  Your agent must have a prompt before publishing to the
                  marketplace.
                </div>
              </div>
            </div>
          )}

          {/* Info Alert */}
          <div className="relative w-full rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
            <div className="flex gap-2">
              <InformationCircleIcon className="h-4 w-4 shrink-0" />
              <div className="text-sm">
                <strong>What gets published:</strong> Agent configuration
                (prompt, model, settings), MCP server requirements (names only),
                and knowledge base structure (including file references).{" "}
                <strong>Note:</strong> Users forking your agent will receive a
                copy of your knowledge base files.
              </div>
            </div>
          </div>

          {/* Commit Message */}
          <Field className="space-y-2">
            <Label className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              Commit Message <span className="text-red-500">*</span>
            </Label>
            <textarea
              id="commit-message"
              placeholder="Describe what changed in this version (e.g., 'Improved system prompt for better responses', 'Added support for web search')"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
            />
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {commitMessage.length}/500 characters
            </p>
          </Field>

          {/* README Editor */}
          <Field className="space-y-2">
            <Label className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              README.md
            </Label>
            <textarea
              id="readme-editor"
              placeholder="Add comprehensive documentation for your agent... (Markdown supported)"
              value={readmeContent}
              onChange={(e) => setReadmeContent(e.target.value)}
              rows={6}
              className="w-full resize-none rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
            />
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Basic Markdown syntax is supported. This will be displayed on the
              agent's marketplace page.
            </p>
          </Field>

          {/* Publish Toggle */}
          <Field className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="space-y-0.5">
              <Label
                htmlFor="publish-toggle"
                className="cursor-pointer text-sm font-medium text-neutral-900 dark:text-neutral-100"
              >
                Publish Immediately
              </Label>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Make this listing visible in the marketplace right away
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

          {/* Preview Toggle */}
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {showPreview ? "Hide Preview" : "Show What Will Be Published"}
          </button>

          {/* Preview Section */}
          {showPreview && (
            <div className="space-y-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <h4 className="font-semibold text-neutral-900 dark:text-neutral-100">
                Preview
              </h4>

              {/* Agent Info */}
              <div className="space-y-2">
                <div>
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Name
                  </p>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    {agentName}
                  </p>
                </div>

                {agentDescription && (
                  <div>
                    <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      Description
                    </p>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      {agentDescription}
                    </p>
                  </div>
                )}

                {agentPrompt && (
                  <div>
                    <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      System Prompt
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
                    Required MCP Servers ({mcpServers.length})
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
                    ⚠️ Users will need to configure their own MCP connections
                  </p>
                </div>
              )}

              {/* Knowledge Base Info */}
              {knowledgeSetInfo && knowledgeSetInfo.file_count > 0 && (
                <div>
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Knowledge Base
                  </p>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    {knowledgeSetInfo.name} ({knowledgeSetInfo.file_count}{" "}
                    files)
                  </p>
                  <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                    ℹ️ Users will receive a copy of these files in their
                    workspace
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
                    ? "Agent listing updated successfully!"
                    : "Agent published to marketplace successfully!"}
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
                    : "Failed to publish agent. Please try again."}
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
            Cancel
          </Button>
          <Button
            onClick={handlePublish}
            disabled={!canPublish || publishMutation.isPending}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
          >
            {publishMutation.isPending
              ? "Publishing..."
              : isPublished
                ? "Update Listing"
                : publishImmediately
                  ? "Publish"
                  : "Save as Draft"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

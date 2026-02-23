"use client";

import { SheetModal } from "@/components/animate-ui/components/animate/sheet-modal";
import { FieldGroup } from "@/components/base/FieldGroup";
import { Textarea } from "@/components/base/Textarea";
import { usePublishAgent } from "@/hooks/useMarketplace";
import { knowledgeSetService } from "@/service/knowledgeSetService";
import type { KnowledgeSetWithFileCount } from "@/service/knowledgeSetService";
import { skillService } from "@/service/skillService";
import type { SkillRead } from "@/types/skills";
import { Button, Field, Label, Switch } from "@headlessui/react";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  LockClosedIcon,
  LockOpenIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ForkMode } from "@/service/marketplaceService";

interface PublishAgentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  agentName: string;
  agentDescription?: string;
  graphConfig?: Record<string, unknown> | null;
  mcpServers?: Array<{ id: string; name: string; description?: string }>;
  knowledgeSetId?: string | null;
  isPublished?: boolean;
  readme?: string | null;
  onPublishSuccess?: (marketplaceId: string) => void;
}

/**
 * PublishAgentModal Component
 *
 * Modal for publishing an agent to the marketplace with commit message,
 * knowledge base selection, skills toggles, and visibility controls.
 */
export default function PublishAgentModal({
  open,
  onOpenChange,
  agentId,
  graphConfig,
  mcpServers = [],
  knowledgeSetId,
  isPublished = false,
  readme,
  onPublishSuccess,
}: PublishAgentModalProps) {
  const { t } = useTranslation();
  const [commitMessage, setCommitMessage] = useState("");
  const [readmeContent, setReadmeContent] = useState(readme || "");
  const [publishImmediately, setPublishImmediately] = useState(true);
  const [forkMode, setForkMode] = useState<ForkMode>("editable");

  // Knowledge base state
  const [knowledgeSets, setKnowledgeSets] = useState<
    KnowledgeSetWithFileCount[]
  >([]);
  const [selectedKnowledgeSetId, setSelectedKnowledgeSetId] = useState<
    string | null
  >(knowledgeSetId ?? null);

  // Skills state
  const [allSkills, setAllSkills] = useState<SkillRead[]>([]);
  const [agentSkillIds, setAgentSkillIds] = useState<Set<string>>(new Set());
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(
    new Set(),
  );

  const publishMutation = usePublishAgent();

  // Fetch knowledge sets and skills when modal opens
  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function fetchData() {
      try {
        const [kbList, agentSkills, skills] = await Promise.all([
          knowledgeSetService.listKnowledgeSets(),
          skillService.listAgentSkills(agentId),
          skillService.listSkills(),
        ]);

        if (cancelled) return;

        setKnowledgeSets(kbList);
        setAllSkills(skills);

        const attachedIds = new Set(agentSkills.map((s) => s.id));
        setAgentSkillIds(attachedIds);
        setSelectedSkillIds(new Set(attachedIds));
        setSelectedKnowledgeSetId(knowledgeSetId ?? null);
      } catch (error) {
        console.error("Failed to fetch publish modal data:", error);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [open, agentId, knowledgeSetId]);

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
        knowledge_set_id: selectedKnowledgeSetId || null,
        skill_ids:
          selectedSkillIds.size > 0 ? Array.from(selectedSkillIds) : undefined,
      });

      // Success callback
      if (onPublishSuccess) {
        onPublishSuccess(response.marketplace_id);
      }

      // Reset and close
      setCommitMessage("");
      onOpenChange(false);
    } catch (error) {
      // Error is handled by the mutation
      console.error("Failed to publish agent:", error);
    }
  };

  const toggleSkill = (skillId: string) => {
    setSelectedSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) {
        next.delete(skillId);
      } else {
        next.add(skillId);
      }
      return next;
    });
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

          {/* Knowledge Base Selector */}
          <FieldGroup
            label={t("marketplace.publish.knowledgeBase.label")}
            hint={t("marketplace.publish.knowledgeBase.hint")}
          >
            <select
              value={selectedKnowledgeSetId ?? ""}
              onChange={(e) =>
                setSelectedKnowledgeSetId(e.target.value || null)
              }
              className="w-full rounded-sm border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-700 transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
            >
              <option value="">
                {t("marketplace.publish.knowledgeBase.none")}
              </option>
              {knowledgeSets.map((ks) => (
                <option key={ks.id} value={ks.id}>
                  {ks.name} (
                  {t("marketplace.publish.knowledgeBase.fileCount", {
                    count: ks.file_count,
                  })}
                  )
                </option>
              ))}
            </select>
          </FieldGroup>

          {/* Skills Selector */}
          <FieldGroup
            label={t("marketplace.publish.skills.label")}
            hint={t("marketplace.publish.skills.hint")}
          >
            {allSkills.length === 0 ? (
              <p className="text-xs text-neutral-400 dark:text-neutral-500">
                {t("marketplace.publish.skills.empty")}
              </p>
            ) : (
              <div className="space-y-1.5">
                {allSkills.map((skill) => (
                  <label
                    key={skill.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg bg-neutral-100/60 px-3 py-2.5 transition-colors hover:bg-neutral-100 dark:bg-white/[0.04] dark:hover:bg-white/[0.06]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSkillIds.has(skill.id)}
                      onChange={() => toggleSkill(skill.id)}
                      className="h-4 w-4 rounded border-neutral-300 text-indigo-500 focus:ring-indigo-500/40 dark:border-neutral-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
                          {skill.name}
                        </span>
                        {skill.scope === "builtin" && (
                          <span className="rounded bg-indigo-50/80 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                            {t("marketplace.publish.skills.builtin")}
                          </span>
                        )}
                        {agentSkillIds.has(skill.id) && (
                          <span className="rounded bg-green-50/80 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:bg-green-900/30 dark:text-green-400">
                            {t("marketplace.publish.skills.attached")}
                          </span>
                        )}
                      </div>
                      {skill.description && (
                        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400 line-clamp-1">
                          {skill.description}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </FieldGroup>

          {/* MCP Servers (read-only) */}
          <FieldGroup
            label={t("marketplace.publish.mcpServers.label")}
            hint={t("marketplace.publish.mcpServers.hint")}
          >
            {mcpServers.length === 0 ? (
              <p className="text-xs text-neutral-400 dark:text-neutral-500">
                {t("marketplace.publish.mcpServers.empty")}
              </p>
            ) : (
              <div className="space-y-1.5">
                {mcpServers.map((mcp) => (
                  <div
                    key={mcp.id}
                    className="rounded-lg bg-neutral-100/60 px-3 py-2.5 dark:bg-white/[0.04]"
                  >
                    <div className="text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
                      {mcp.name}
                    </div>
                    {mcp.description && (
                      <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400 line-clamp-1">
                        {mcp.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
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
                  <div className="mt-1 text-[10px] font-medium text-green-600 dark:text-green-400">
                    {t("marketplace.forkMode.rewardRate", { rate: "30%" })}
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
                  <div className="mt-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                    {t("marketplace.forkMode.rewardRate", { rate: "3%" })}
                  </div>
                </div>
              </button>
            </div>
          </FieldGroup>

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

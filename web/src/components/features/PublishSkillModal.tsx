"use client";

import { SheetModal } from "@/components/animate-ui/components/animate/sheet-modal";
import { FieldGroup } from "@/components/base/FieldGroup";
import { Textarea } from "@/components/base/Textarea";
import { usePublishSkill } from "@/hooks/useSkillMarketplace";
import { Button, Field, Label, Switch } from "@headlessui/react";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface PublishSkillModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skillId: string;
  skillName: string;
  isPublished?: boolean;
  readme?: string | null;
  onPublishSuccess?: (marketplaceId: string) => void;
}

export default function PublishSkillModal({
  open,
  onOpenChange,
  skillId,
  skillName,
  isPublished = false,
  readme,
  onPublishSuccess,
}: PublishSkillModalProps) {
  const { t } = useTranslation();
  const [commitMessage, setCommitMessage] = useState("");
  const [readmeContent, setReadmeContent] = useState(readme || "");
  const [publishImmediately, setPublishImmediately] = useState(true);

  const publishMutation = usePublishSkill();

  const handlePublish = async () => {
    if (!commitMessage.trim()) return;

    try {
      const response = await publishMutation.mutateAsync({
        skill_id: skillId,
        commit_message: commitMessage.trim(),
        is_published: publishImmediately,
        readme: readmeContent.trim() || null,
      });

      if (onPublishSuccess) {
        onPublishSuccess(response.marketplace_id);
      }

      setCommitMessage("");
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to publish skill:", error);
    }
  };

  const canPublish = commitMessage.trim().length > 0;

  return (
    <SheetModal isOpen={open} onClose={() => onOpenChange(false)} size="md">
      {/* Header */}
      <div className="shrink-0 border-b border-neutral-200/60 px-5 pb-3 pt-5 dark:border-neutral-800/60">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          {isPublished
            ? t("skillMarketplace.publish.titleUpdate")
            : t("skillMarketplace.publish.title")}
        </h2>
        <p className="mt-1 text-[13px] text-neutral-500 dark:text-neutral-400">
          {t("skillMarketplace.publish.description")}
        </p>
      </div>

      {/* Scrollable Content */}
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        <div className="space-y-6 px-5 py-5">
          {/* Info Alert */}
          <div className="flex gap-2.5 rounded-lg bg-neutral-100/60 px-4 py-3 dark:bg-white/[0.04]">
            <InformationCircleIcon className="h-4 w-4 shrink-0 text-neutral-400" />
            <p className="text-[13px] text-neutral-600 dark:text-neutral-400">
              Publishing <strong>{skillName}</strong> will create an immutable
              snapshot of its SKILL.md and resource files.
            </p>
          </div>

          {/* Commit Message */}
          <FieldGroup
            label={t("skillMarketplace.publish.commitMessage.label")}
            required
            hint={t("skillMarketplace.publish.commitMessage.charCount", {
              count: commitMessage.length,
            })}
          >
            <Textarea
              id="commit-message"
              placeholder={t(
                "skillMarketplace.publish.commitMessage.placeholder",
              )}
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              rows={3}
            />
          </FieldGroup>

          {/* README Editor */}
          <FieldGroup
            label={t("skillMarketplace.publish.readme.label")}
            hint={t("skillMarketplace.publish.readme.hint")}
          >
            <Textarea
              id="readme-editor"
              placeholder={t("skillMarketplace.publish.readme.placeholder")}
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
                {t("skillMarketplace.publish.publishImmediately.label")}
              </Label>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {t("skillMarketplace.publish.publishImmediately.description")}
              </p>
            </div>
            <Switch
              id="publish-toggle"
              checked={publishImmediately}
              onChange={setPublishImmediately}
              className={`${
                publishImmediately
                  ? "bg-emerald-500"
                  : "bg-neutral-300 dark:bg-neutral-600"
              } relative inline-flex h-[26px] w-[46px] shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-2`}
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

          {/* Success Message */}
          {publishMutation.isSuccess && (
            <div className="flex gap-2.5 rounded-lg bg-green-50/80 px-4 py-3 dark:bg-green-950/30">
              <CheckCircleIcon className="h-4 w-4 shrink-0 text-green-500" />
              <p className="text-[13px] text-green-700 dark:text-green-400">
                {isPublished
                  ? t("skillMarketplace.publish.success.updated")
                  : t("skillMarketplace.publish.success.published")}
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
                  : t("skillMarketplace.publish.error.default")}
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
            {t("skillMarketplace.publish.actions.cancel")}
          </Button>
          <Button
            onClick={handlePublish}
            disabled={!canPublish || publishMutation.isPending}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
          >
            {publishMutation.isPending
              ? t("skillMarketplace.publish.actions.publishing")
              : isPublished
                ? t("skillMarketplace.publish.actions.update")
                : t("skillMarketplace.publish.actions.publish")}
          </Button>
        </div>
      </div>
    </SheetModal>
  );
}

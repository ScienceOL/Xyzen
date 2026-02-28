"use client";

import { SheetModal } from "@/components/animate-ui/components/animate/sheet-modal";
import { FieldGroup } from "@/components/base/FieldGroup";
import { Input } from "@/components/base/Input";
import { useForkSkill } from "@/hooks/useSkillMarketplace";
import { Button } from "@headlessui/react";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface ForkSkillModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marketplaceId: string;
  skillName: string;
  skillDescription?: string;
  onForkSuccess?: (skillId: string) => void;
}

export default function ForkSkillModal({
  open,
  onOpenChange,
  marketplaceId,
  skillName,
  skillDescription,
  onForkSuccess,
}: ForkSkillModalProps) {
  const { t } = useTranslation();
  const [customName, setCustomName] = useState(`${skillName} (Fork)`);

  const forkMutation = useForkSkill();

  const handleFork = async () => {
    try {
      const response = await forkMutation.mutateAsync({
        marketplaceId,
        request: {
          custom_name:
            customName.trim() !== `${skillName} (Fork)`
              ? customName.trim()
              : undefined,
        },
      });

      if (onForkSuccess) {
        onForkSuccess(response.skill_id);
      }

      setCustomName(`${skillName} (Fork)`);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to fork skill:", error);
    }
  };

  const canFork = customName.trim().length > 0;

  return (
    <SheetModal isOpen={open} onClose={() => onOpenChange(false)} size="md">
      {/* Header */}
      <div className="shrink-0 border-b border-neutral-200/60 px-5 pb-3 pt-5 dark:border-neutral-800/60">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          {t("skillMarketplace.fork.title", { name: skillName })}
        </h2>
        <p className="mt-1 text-[13px] text-neutral-500 dark:text-neutral-400">
          {t("skillMarketplace.fork.description")}
        </p>
      </div>

      {/* Scrollable Content */}
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        <div className="space-y-6 px-5 py-5">
          {/* Info Alert */}
          <div className="flex gap-2.5 rounded-lg bg-neutral-100/60 px-4 py-3 dark:bg-white/[0.04]">
            <InformationCircleIcon className="h-4 w-4 shrink-0 text-neutral-400" />
            <p className="text-[13px] text-neutral-600 dark:text-neutral-400">
              Adding this skill will create your own independent copy with the
              SKILL.md and all resource files.
            </p>
          </div>

          {/* Skill Name */}
          <FieldGroup
            label={t("skillMarketplace.fork.skillName")}
            required
            hint={t("skillMarketplace.fork.skillNameHint")}
          >
            <Input
              id="skill-name"
              type="text"
              placeholder={t("skillMarketplace.fork.skillNamePlaceholder")}
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              maxLength={100}
            />
          </FieldGroup>

          {/* Original Description */}
          {skillDescription && (
            <div>
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                {t("skillMarketplace.fork.originalDescription")}
              </p>
              <p className="mt-1 text-[13px] text-neutral-700 dark:text-neutral-300">
                {skillDescription}
              </p>
            </div>
          )}

          {/* No-requirements confirmation */}
          <div className="flex gap-2.5 rounded-lg bg-green-50/80 px-4 py-3 dark:bg-green-950/30">
            <CheckCircleIcon className="h-4 w-4 shrink-0 text-green-500" />
            <p className="text-[13px] text-green-700 dark:text-green-400">
              Skills have no external requirements. The SKILL.md and all
              resource files will be copied to your library.
            </p>
          </div>

          {/* Error Message */}
          {forkMutation.isError && (
            <div className="flex gap-2.5 rounded-lg bg-red-50/80 px-4 py-3 dark:bg-red-950/30">
              <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-red-500 dark:text-red-400" />
              <p className="text-[13px] text-red-700 dark:text-red-400">
                {forkMutation.error instanceof Error
                  ? forkMutation.error.message
                  : t("skillMarketplace.fork.error")}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-neutral-200/60 px-5 py-4 dark:border-neutral-800/60">
        <div className="flex w-full justify-between">
          <Button
            onClick={() => onOpenChange(false)}
            disabled={forkMutation.isPending}
            className="rounded-lg bg-neutral-100/80 px-4 py-2 text-[13px] font-medium text-neutral-700 transition-colors hover:bg-neutral-200/80 disabled:opacity-50 dark:bg-white/[0.06] dark:text-neutral-300 dark:hover:bg-white/[0.1]"
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleFork}
            disabled={!canFork || forkMutation.isPending}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
          >
            {forkMutation.isPending
              ? t("skillMarketplace.fork.forking")
              : t("skillMarketplace.fork.forkButton")}
          </Button>
        </div>
      </div>
    </SheetModal>
  );
}

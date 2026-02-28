"use client";

import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useSkillMarketplaceListing,
  useSkillListingHistory,
} from "@/hooks/useSkillMarketplace";
import { skillMarketplaceService } from "@/service/skillMarketplaceService";
import { DOCK_SAFE_AREA } from "@/components/layouts/BottomDock";
import { MOBILE_BREAKPOINT } from "@/configs/common";

interface SkillMarketplaceManageProps {
  marketplaceId: string;
  onBack: () => void;
}

export default function SkillMarketplaceManage({
  marketplaceId,
  onBack,
}: SkillMarketplaceManageProps) {
  const { t } = useTranslation();
  const { data: listing } = useSkillMarketplaceListing(marketplaceId);
  const { data: history } = useSkillListingHistory(marketplaceId);

  const [readme, setReadme] = useState(listing?.readme || "");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await skillMarketplaceService.updateListing(marketplaceId, {
        readme: readme || null,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="flex h-full flex-col bg-neutral-50 dark:bg-neutral-950"
      style={
        window.innerWidth <= MOBILE_BREAKPOINT
          ? {}
          : { paddingBottom: DOCK_SAFE_AREA }
      }
    >
      {/* Header */}
      <div className="sticky top-0 z-10 bg-neutral-50/80 backdrop-blur-xl dark:bg-black/80">
        <div className="mx-auto max-w-7xl px-4 py-2 md:px-6">
          <div className="flex items-center justify-between">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-sm text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              {t("skillMarketplace.detail.back")}
            </button>
          </div>
        </div>
        <div className="h-px bg-neutral-200/60 dark:bg-neutral-800/60" />
      </div>

      <div className="custom-scrollbar flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
          <h1 className="mb-6 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {listing?.name || "Manage Skill"}
          </h1>

          {/* README editor */}
          <div className="mb-6">
            <label className="mb-2 block text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
              {t("skillMarketplace.publish.readme.label")}
            </label>
            <textarea
              value={readme}
              onChange={(e) => setReadme(e.target.value)}
              placeholder={t("skillMarketplace.publish.readme.placeholder")}
              className="h-48 w-full rounded-sm border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-900 placeholder-neutral-400 outline-none transition-colors focus:ring-1 focus:ring-emerald-300 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder-neutral-500 dark:focus:ring-emerald-600"
            />
            <p className="mt-1 text-xs text-neutral-400">
              {t("skillMarketplace.publish.readme.hint")}
            </p>
          </div>

          {/* Save button */}
          <div className="mb-8">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
            >
              {isSaving
                ? t("skillMarketplace.publish.actions.publishing")
                : t("skillMarketplace.publish.actions.update")}
            </button>
          </div>

          {/* Version history */}
          {history && history.length > 0 && (
            <div>
              <h2 className="mb-3 text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
                Version History
              </h2>
              <div className="space-y-2">
                {history.map((snapshot) => (
                  <div
                    key={snapshot.id}
                    className="flex items-center justify-between rounded-lg bg-neutral-100/60 px-4 py-3 dark:bg-white/[0.04]"
                  >
                    <div>
                      <p className="text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
                        v{snapshot.version}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {snapshot.commit_message}
                      </p>
                    </div>
                    <p className="text-xs text-neutral-400">
                      {new Date(snapshot.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import {
  ArrowLeftIcon,
  HeartIcon,
  ClipboardDocumentIcon,
  SparklesIcon,
  FolderIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useSkillMarketplaceListing,
  useToggleSkillLike,
  useForkSkill,
} from "@/hooks/useSkillMarketplace";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/animate-ui/components/animate/tabs";
import { DOCK_SAFE_AREA } from "@/components/layouts/BottomDock";
import { MOBILE_BREAKPOINT } from "@/configs/common";

interface SkillMarketplaceDetailProps {
  marketplaceId: string;
  onBack: () => void;
  onManage: () => void;
}

type DetailTab = "readme" | "skillMd" | "resources";

export default function SkillMarketplaceDetail({
  marketplaceId,
  onBack,
  onManage,
}: SkillMarketplaceDetailProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<DetailTab>("readme");
  const [copied, setCopied] = useState(false);

  const {
    data: listing,
    isLoading,
    error,
  } = useSkillMarketplaceListing(marketplaceId);
  const toggleLike = useToggleSkillLike();
  const forkSkill = useForkSkill();

  const handleLike = () => {
    toggleLike.mutate(marketplaceId);
  };

  const handleFork = () => {
    forkSkill.mutate({ marketplaceId });
  };

  const handleCopyUrl = () => {
    void navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-emerald-600" />
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-red-500">{t("skillMarketplace.detail.error")}</p>
        <button
          onClick={onBack}
          className="text-sm text-emerald-600 hover:underline"
        >
          {t("skillMarketplace.detail.back")}
        </button>
      </div>
    );
  }

  const isOwner = listing.user_id !== null;

  return (
    <div
      className="flex h-full flex-col bg-neutral-50 dark:bg-neutral-950"
      style={
        window.innerWidth <= MOBILE_BREAKPOINT
          ? {}
          : { paddingBottom: DOCK_SAFE_AREA }
      }
    >
      {/* Back button */}
      <div className="sticky top-0 z-10 bg-neutral-50/80 backdrop-blur-xl dark:bg-black/80">
        <div className="mx-auto max-w-7xl px-4 py-2 md:px-6">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            {t("skillMarketplace.detail.back")}
          </button>
        </div>
        <div className="h-px bg-neutral-200/60 dark:bg-neutral-800/60" />
      </div>

      <div className="custom-scrollbar flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
          <div className="flex flex-col gap-8 lg:flex-row">
            {/* Main content */}
            <div className="flex-1 min-w-0">
              {/* Header */}
              <div className="mb-6 flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-emerald-500 via-teal-500 to-cyan-500 text-2xl font-bold text-white shadow-lg">
                  {listing.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                      {listing.name}
                    </h1>
                    {listing.scope === "official" && (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        {t("skillMarketplace.badge.official")}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                    {listing.description ||
                      t("skillMarketplace.detail.noDescription")}
                  </p>
                  {listing.tags && listing.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {listing.tags.map((tag, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="mb-6 flex gap-4">
                <div className="flex items-center gap-2 rounded-lg bg-red-50/80 px-3 py-2 dark:bg-red-950/30">
                  <HeartIcon className="h-4 w-4 text-red-500" />
                  <span className="text-sm font-medium text-red-700 dark:text-red-300">
                    {listing.likes_count}{" "}
                    {t("skillMarketplace.detail.stats.likes")}
                  </span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-blue-50/80 px-3 py-2 dark:bg-blue-950/30">
                  <SparklesIcon className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    {listing.forks_count}{" "}
                    {t("skillMarketplace.detail.stats.forks")}
                  </span>
                </div>
              </div>

              {/* Content tabs */}
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as DetailTab)}
              >
                <TabsList className="mb-4">
                  <TabsTrigger value="readme" className="text-xs">
                    {t("skillMarketplace.detail.tabs.readme")}
                  </TabsTrigger>
                  <TabsTrigger value="skillMd" className="text-xs">
                    {t("skillMarketplace.detail.tabs.skillMd")}
                  </TabsTrigger>
                  <TabsTrigger value="resources" className="text-xs">
                    {t("skillMarketplace.detail.tabs.resources")}
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="rounded-lg bg-white p-5 dark:bg-neutral-900">
                {activeTab === "readme" && (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    {listing.readme ? (
                      <div className="whitespace-pre-wrap text-[13px] text-neutral-700 dark:text-neutral-300">
                        {listing.readme}
                      </div>
                    ) : (
                      <p className="text-neutral-400">
                        {t("skillMarketplace.detail.readme.empty")}
                      </p>
                    )}
                  </div>
                )}

                {activeTab === "skillMd" && (
                  <div>
                    {listing.snapshot?.skill_md_content ? (
                      <pre className="overflow-x-auto rounded-lg bg-neutral-100/60 p-4 text-xs text-neutral-700 dark:bg-white/[0.04] dark:text-neutral-300">
                        {listing.snapshot.skill_md_content}
                      </pre>
                    ) : (
                      <p className="text-neutral-400">
                        {t("skillMarketplace.detail.skillMd.empty")}
                      </p>
                    )}
                  </div>
                )}

                {activeTab === "resources" && (
                  <div>
                    {listing.snapshot?.resource_manifest &&
                    listing.snapshot.resource_manifest.length > 0 ? (
                      <div className="space-y-2">
                        {listing.snapshot.resource_manifest.map((file, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 rounded-lg bg-neutral-100/60 px-3 py-2 dark:bg-white/[0.04]"
                          >
                            <FolderIcon className="h-4 w-4 text-neutral-400" />
                            <span className="text-[13px] text-neutral-700 dark:text-neutral-300">
                              {file.path}
                            </span>
                            <span className="ml-auto text-xs text-neutral-400">
                              {file.size_bytes > 1024
                                ? `${(file.size_bytes / 1024).toFixed(1)} KB`
                                : `${file.size_bytes} B`}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-neutral-400">
                        {t("skillMarketplace.detail.resources.empty")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div className="w-full shrink-0 space-y-4 lg:w-72">
              {/* Fork button */}
              <button
                onClick={handleFork}
                disabled={forkSkill.isPending}
                className="w-full rounded-lg bg-linear-to-r from-emerald-600 via-teal-600 to-cyan-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg transition-all hover:shadow-xl hover:scale-[1.02] disabled:opacity-50"
              >
                {forkSkill.isPending
                  ? t("skillMarketplace.fork.forking")
                  : t("skillMarketplace.detail.actions.fork")}
              </button>

              {/* Like button */}
              <button
                onClick={handleLike}
                className={`w-full rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-all ${
                  listing.has_liked
                    ? "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
                    : "bg-neutral-100/80 text-neutral-700 hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-300 dark:hover:bg-white/[0.1]"
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  {listing.has_liked ? (
                    <HeartSolidIcon className="h-4 w-4" />
                  ) : (
                    <HeartIcon className="h-4 w-4" />
                  )}
                  {listing.has_liked
                    ? t("skillMarketplace.detail.actions.liked")
                    : t("skillMarketplace.detail.actions.like")}
                </span>
              </button>

              {/* Manage button (owner only) */}
              {isOwner && listing.scope !== "official" && (
                <button
                  onClick={onManage}
                  className="w-full rounded-lg bg-neutral-100/80 px-4 py-2.5 text-[13px] font-semibold text-neutral-700 transition-colors hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-300 dark:hover:bg-white/[0.1]"
                >
                  {t("skillMarketplace.detail.actions.manage")}
                </button>
              )}

              {/* Share */}
              <div className="rounded-lg bg-neutral-100/60 p-4 dark:bg-white/[0.04]">
                <h4 className="mb-2 text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
                  {t("skillMarketplace.detail.actions.shareTitle")}
                </h4>
                <button
                  onClick={handleCopyUrl}
                  className="inline-flex items-center gap-1.5 text-xs text-neutral-500 transition-colors hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                >
                  <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                  {copied ? "Copied!" : "Copy link"}
                </button>
              </div>

              {/* Metadata */}
              <div className="rounded-lg bg-neutral-100/60 p-4 dark:bg-white/[0.04]">
                {listing.author_display_name && (
                  <div className="mb-3">
                    <p className="text-xs text-neutral-400">
                      {t("skillMarketplace.detail.meta.publishedBy")}
                    </p>
                    <p className="mt-0.5 text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
                      {listing.author_display_name}
                    </p>
                  </div>
                )}
                {listing.first_published_at && (
                  <div className="mb-3">
                    <p className="text-xs text-neutral-400">
                      {t("skillMarketplace.detail.meta.firstPublished")}
                    </p>
                    <p className="mt-0.5 text-[13px] text-neutral-700 dark:text-neutral-300">
                      {new Date(
                        listing.first_published_at,
                      ).toLocaleDateString()}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-neutral-400">
                    {t("skillMarketplace.detail.meta.lastUpdated")}
                  </p>
                  <p className="mt-0.5 text-[13px] text-neutral-700 dark:text-neutral-300">
                    {new Date(listing.updated_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* About forking */}
              <div className="rounded-lg bg-emerald-50/80 p-4 dark:bg-emerald-950/20">
                <h4 className="mb-1 text-[13px] font-medium text-emerald-800 dark:text-emerald-300">
                  {t("skillMarketplace.detail.aboutForking.title")}
                </h4>
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  {t("skillMarketplace.detail.aboutForking.description")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

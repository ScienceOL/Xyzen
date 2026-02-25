"use client";

import { DOCK_SAFE_AREA } from "@/components/layouts/BottomDock";
import { useDebounce } from "@/hooks/useDebounce";
import {
  useInfiniteSkillMarketplaceListings,
  usePrefetchSkillMarketplaceListing,
  useStarredSkillListings,
} from "@/hooks/useSkillMarketplace";
import {
  FunnelIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import { SparklesIcon } from "@heroicons/react/24/outline";
import { lazy, type ReactNode, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useInView } from "react-intersection-observer";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/animate-ui/components/radix/dropdown-menu";
import { MOBILE_BREAKPOINT } from "@/configs/common";
import SkillListingCard from "./SkillListingCard";
import SkillMarketplaceDetail from "./SkillMarketplaceDetail";
import SkillMarketplaceSections from "./SkillMarketplaceSections";

const SkillMarketplaceManage = lazy(() => import("./SkillMarketplaceManage"));

type SkillMarketplaceTab = "all" | "starred";
type ViewMode = "list" | "detail" | "manage";
type SortOption = "likes" | "forks" | "views" | "recent" | "oldest";

const SORT_OPTIONS: SortOption[] = [
  "recent",
  "likes",
  "forks",
  "views",
  "oldest",
];

interface SkillMarketplaceProps {
  sectionSwitcher?: ReactNode;
  headerPortal?: HTMLElement | null;
}

export default function SkillMarketplace({
  sectionSwitcher,
  headerPortal,
}: SkillMarketplaceProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SkillMarketplaceTab>("all");
  const [selectedMarketplaceId, setSelectedMarketplaceId] = useState<
    string | null
  >(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("recent");

  const debouncedSearch = useDebounce(searchQuery, 300);

  const {
    listings: allListings,
    isLoading: isLoadingAll,
    isFetchingNextPage: isFetchingNextPageAll,
    hasNextPage: hasNextPageAll,
    fetchNextPage: fetchNextPageAll,
    error: errorAll,
    refetch: refetchAll,
  } = useInfiniteSkillMarketplaceListings({
    query: debouncedSearch,
    tags: selectedTag ? [selectedTag] : undefined,
    sort_by: sortBy,
  });

  const {
    data: starredListings,
    isLoading: isLoadingStarred,
    error: errorStarred,
    refetch: refetchStarred,
  } = useStarredSkillListings();

  const listings = activeTab === "starred" ? starredListings : allListings;
  const isLoading = activeTab === "starred" ? isLoadingStarred : isLoadingAll;
  const error = activeTab === "starred" ? errorStarred : errorAll;
  const refetch = activeTab === "starred" ? refetchStarred : refetchAll;

  const prefetchListing = usePrefetchSkillMarketplaceListing();
  const { ref: loadMoreRef, inView: isLoadMoreInView } = useInView({
    rootMargin: "280px 0px",
    threshold: 0,
    skip: activeTab !== "all" || !hasNextPageAll,
  });

  useEffect(() => {
    if (activeTab !== "all") return;
    if (!isLoadMoreInView) return;
    if (!hasNextPageAll) return;
    if (isFetchingNextPageAll) return;
    void fetchNextPageAll();
  }, [
    activeTab,
    isLoadMoreInView,
    hasNextPageAll,
    isFetchingNextPageAll,
    fetchNextPageAll,
  ]);

  const handleSelectListing = (id: string) => {
    setSelectedMarketplaceId(id);
    setViewMode("detail");
  };

  const handleBackToList = () => {
    setSelectedMarketplaceId(null);
    setViewMode("list");
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedTag(null);
    setSortBy("recent");
  };

  const handleMouseEnter = (id: string) => {
    prefetchListing(id);
  };

  if (selectedMarketplaceId && viewMode === "detail") {
    return (
      <SkillMarketplaceDetail
        marketplaceId={selectedMarketplaceId}
        onBack={handleBackToList}
        onManage={() => setViewMode("manage")}
      />
    );
  }

  if (selectedMarketplaceId && viewMode === "manage") {
    return (
      <Suspense>
        <SkillMarketplaceManage
          marketplaceId={selectedMarketplaceId}
          onBack={handleBackToList}
        />
      </Suspense>
    );
  }

  return (
    <div
      className="flex h-full flex-col bg-neutral-50 dark:bg-neutral-950"
      style={
        window.innerWidth <= MOBILE_BREAKPOINT
          ? {}
          : { paddingBottom: DOCK_SAFE_AREA }
      }
    >
      {/* Header controls: search + sub-tabs */}
      {(() => {
        const controls = (
          <>
            {activeTab === "all" && (
              <div className="relative max-w-xs flex-1">
                <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder={t("skillMarketplace.search.placeholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg bg-neutral-200/50 py-1.5 pl-8 pr-3 text-sm text-neutral-900 placeholder-neutral-400 outline-none transition-colors focus:bg-white focus:ring-1 focus:ring-neutral-300 dark:bg-neutral-800/60 dark:text-neutral-100 dark:placeholder-neutral-500 dark:focus:bg-neutral-800 dark:focus:ring-neutral-600"
                />
              </div>
            )}
            <div className="flex items-center gap-0.5 rounded-none bg-neutral-100/60 p-0.5 dark:bg-white/[0.04]">
              {(
                [
                  { key: "all", label: t("skillMarketplace.tabs.all") },
                  {
                    key: "starred",
                    label: t("skillMarketplace.tabs.starred"),
                  },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className="relative px-3 py-1.5 text-[13px] transition-colors"
                >
                  {activeTab === key && (
                    <motion.div
                      layoutId="skill-marketplace-sub-tab"
                      className="absolute inset-0 bg-white shadow-sm dark:bg-white/[0.1]"
                      transition={{
                        type: "spring",
                        stiffness: 300,
                        damping: 30,
                      }}
                    />
                  )}
                  <span
                    className={`relative z-10 ${
                      activeTab === key
                        ? "font-medium text-neutral-900 dark:text-neutral-100"
                        : "text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
                    }`}
                  >
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </>
        );

        if (headerPortal) return createPortal(controls, headerPortal);

        return (
          <div className="sticky top-0 z-10 bg-neutral-50/80 backdrop-blur-xl dark:bg-black/80">
            <div className="mx-auto max-w-7xl px-4 pt-3 pb-2 md:px-6">
              <div className="flex items-center justify-between gap-3">
                {sectionSwitcher ?? (
                  <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                    {t("skillMarketplace.title")}
                  </h1>
                )}
                {controls}
              </div>
            </div>
            <div className="h-px bg-neutral-200/60 dark:bg-neutral-800/60" />
          </div>
        );
      })()}

      {/* Main Content */}
      <div className="custom-scrollbar flex-1 overflow-auto px-4 py-4 md:px-6 md:py-6">
        <div className="mx-auto max-w-7xl">
          {selectedTag && activeTab === "all" && (
            <div className="mb-4 flex items-center gap-1.5">
              <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                {t("skillMarketplace.filters.filteredBy")}
              </span>
              <button
                onClick={() => setSelectedTag(null)}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
              >
                #{selectedTag}
                <XMarkIcon className="h-3 w-3" />
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-emerald-600"></div>
            </div>
          ) : error ? (
            <div className="flex h-64 items-center justify-center text-red-500">
              {t("skillMarketplace.loadError")}
              <button onClick={() => refetch()} className="ml-2 underline">
                {t("skillMarketplace.retry")}
              </button>
            </div>
          ) : !listings || listings.length === 0 ? (
            <div className="flex min-h-100 flex-col items-center justify-center py-12 text-center">
              <div className="relative mb-8">
                <div className="absolute inset-0 animate-pulse rounded-full bg-linear-to-r from-emerald-400 via-teal-400 to-cyan-400 opacity-20 blur-2xl"></div>
                <div className="relative flex h-32 w-32 items-center justify-center rounded-full bg-linear-to-br from-emerald-500 to-teal-500">
                  {activeTab === "starred" ? (
                    <HeartSolidIcon className="h-16 w-16 text-white" />
                  ) : (
                    <SparklesIcon className="h-16 w-16 text-white" />
                  )}
                </div>
              </div>
              <h3 className="mb-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                {activeTab === "starred"
                  ? t("skillMarketplace.empty.starred.title")
                  : t("skillMarketplace.empty.all.title")}
              </h3>
              <p className="mb-6 max-w-md text-center text-neutral-600 dark:text-neutral-400">
                {activeTab === "starred"
                  ? t("skillMarketplace.empty.starred.body")
                  : searchQuery
                    ? t("skillMarketplace.empty.search.body")
                    : t("skillMarketplace.empty.all.body")}
              </p>

              {activeTab === "starred" && (
                <button
                  onClick={() => setActiveTab("all")}
                  className="rounded-lg bg-linear-to-r from-emerald-600 to-teal-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
                >
                  {t("skillMarketplace.empty.starred.browse")}
                </button>
              )}

              {(searchQuery || selectedTag || sortBy !== "recent") && (
                <button
                  onClick={clearFilters}
                  className="mt-2 text-sm text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  {t("skillMarketplace.filters.clear")}
                </button>
              )}
            </div>
          ) : (
            <div>
              {activeTab === "all" && !debouncedSearch && !selectedTag && (
                <SkillMarketplaceSections
                  onSelectListing={handleSelectListing}
                  onMouseEnterListing={handleMouseEnter}
                />
              )}

              {activeTab === "all" && listings && listings.length > 0 && (
                <div className="mb-4 mt-8 flex items-center gap-3">
                  <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
                  <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    {t("skillMarketplace.sections.allSkills")}
                  </h2>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200">
                        <FunnelIcon className="h-3 w-3" />
                        {t(`skillMarketplace.sort.${sortBy}`)}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center">
                      {SORT_OPTIONS.map((option) => (
                        <DropdownMenuItem
                          key={option}
                          onClick={() => setSortBy(option)}
                        >
                          <span className="flex-1">
                            {t(`skillMarketplace.sort.${option}`)}
                          </span>
                          {sortBy === option && (
                            <CheckIcon className="h-3.5 w-3.5 text-emerald-500" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
                </div>
              )}

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {listings.map((listing) => (
                  <SkillListingCard
                    key={listing.id}
                    listing={listing}
                    onClick={() => handleSelectListing(listing.id)}
                    onMouseEnter={() => handleMouseEnter(listing.id)}
                  />
                ))}
              </div>

              {activeTab === "all" && hasNextPageAll && (
                <div
                  ref={loadMoreRef}
                  className="mt-8 flex justify-center py-3"
                >
                  {isFetchingNextPageAll ? (
                    <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-emerald-600"></div>
                      <span>{t("skillMarketplace.infinite.loadingMore")}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-neutral-500 dark:text-neutral-400">
                      {t("skillMarketplace.infinite.scrollHint")}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

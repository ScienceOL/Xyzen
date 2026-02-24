"use client";

import { DOCK_SAFE_AREA } from "@/components/layouts/BottomDock";
import { useDebounce } from "@/hooks/useDebounce";
import {
  useInfiniteMarketplaceListings,
  usePrefetchMarketplaceListing,
  useStarredListings,
} from "@/hooks/useMarketplace";
import {
  FunnelIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useInView } from "react-intersection-observer";

import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/animate-ui/components/animate/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/animate-ui/components/radix/dropdown-menu";
import MyMarketplaceListings from "@/components/features/MyMarketplaceListings";
import { MOBILE_BREAKPOINT } from "@/configs/common";
import AgentListingCard from "./AgentListingCard";
import AgentMarketplaceDetail from "./AgentMarketplaceDetail";
import MarketplaceSections from "./MarketplaceSections";

const AgentMarketplaceManage = lazy(() => import("./AgentMarketplaceManage"));

type AgentMarketplaceTab = "all" | "starred" | "my-listings";
type ViewMode = "list" | "detail" | "manage";
type SortOption = "likes" | "forks" | "views" | "recent" | "oldest";

// Filter options
const SORT_OPTIONS: SortOption[] = [
  "recent",
  "likes",
  "forks",
  "views",
  "oldest",
];

/**
 * AgentMarketplace Component
 *
 * Main marketplace page for discovering and browsing community agents.
 */
export default function AgentMarketplace() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<AgentMarketplaceTab>("all");
  const [selectedMarketplaceId, setSelectedMarketplaceId] = useState<
    string | null
  >(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("recent");

  // Debounce search query
  const debouncedSearch = useDebounce(searchQuery, 300);

  const {
    listings: allListings,
    isLoading: isLoadingAll,
    isFetchingNextPage: isFetchingNextPageAll,
    hasNextPage: hasNextPageAll,
    fetchNextPage: fetchNextPageAll,
    error: errorAll,
    refetch: refetchAll,
  } = useInfiniteMarketplaceListings({
    query: debouncedSearch,
    tags: selectedTag ? [selectedTag] : undefined,
    sort_by: sortBy,
  });

  const {
    data: starredListings,
    isLoading: isLoadingStarred,
    error: errorStarred,
    refetch: refetchStarred,
  } = useStarredListings();

  const listings = activeTab === "starred" ? starredListings : allListings;
  const isLoading = activeTab === "starred" ? isLoadingStarred : isLoadingAll;
  const error = activeTab === "starred" ? errorStarred : errorAll;
  const refetch = activeTab === "starred" ? refetchStarred : refetchAll;

  const prefetchListing = usePrefetchMarketplaceListing();
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

  const handleManageListing = (id: string) => {
    setSelectedMarketplaceId(id);
    setViewMode("manage");
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
      <AgentMarketplaceDetail
        marketplaceId={selectedMarketplaceId}
        onBack={handleBackToList}
        onManage={() => setViewMode("manage")}
      />
    );
  }

  if (selectedMarketplaceId && viewMode === "manage") {
    return (
      <Suspense>
        <AgentMarketplaceManage
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
      {/* Header */}
      <div className="sticky top-0 z-10 bg-neutral-50/80 backdrop-blur-xl dark:bg-black/80">
        <div className="mx-auto max-w-7xl px-4 pt-3 pb-2 md:px-6">
          {/* Title + Tabs row */}
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {t("marketplace.title")}
            </h1>

            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as AgentMarketplaceTab)}
            >
              <TabsList className="h-7">
                <TabsTrigger value="all" className="text-xs px-2.5 py-0.5">
                  {t("marketplace.tabs.all")}
                </TabsTrigger>
                <TabsTrigger value="starred" className="text-xs px-2.5 py-0.5">
                  {t("marketplace.tabs.starred")}
                </TabsTrigger>
                <TabsTrigger
                  value="my-listings"
                  className="text-xs px-2.5 py-0.5"
                >
                  {t("marketplace.tabs.my")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
        <div className="h-px bg-neutral-200/60 dark:bg-neutral-800/60" />
      </div>

      {/* Main Content */}
      <div className="custom-scrollbar flex-1 overflow-auto px-4 py-4 md:px-6 md:py-6">
        <div className="mx-auto max-w-7xl">
          {/* Search bar — inside content, only for "all" tab */}
          {activeTab === "all" && (
            <div className="mb-4">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder={t("marketplace.search.placeholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg bg-neutral-200/50 py-1.5 pl-8 pr-3 text-sm text-neutral-900 placeholder-neutral-400 outline-none transition-colors focus:bg-white focus:ring-1 focus:ring-neutral-300 dark:bg-neutral-800/60 dark:text-neutral-100 dark:placeholder-neutral-500 dark:focus:bg-neutral-800 dark:focus:ring-neutral-600"
                />
              </div>
            </div>
          )}

          {/* Active tag filter chip */}
          {selectedTag && activeTab === "all" && (
            <div className="mb-4 flex items-center gap-1.5">
              <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                {t("marketplace.filters.filteredBy")}
              </span>
              <button
                onClick={() => setSelectedTag(null)}
                className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-600 transition-colors hover:bg-indigo-500/20 dark:text-indigo-400"
              >
                #{selectedTag}
                <XMarkIcon className="h-3 w-3" />
              </button>
            </div>
          )}
          {activeTab === "all" || activeTab === "starred" ? (
            <>
              {isLoading ? (
                <div className="flex h-64 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-indigo-600"></div>
                </div>
              ) : error ? (
                <div className="flex h-64 items-center justify-center text-red-500">
                  {t("marketplace.loadError")}
                  <button onClick={() => refetch()} className="ml-2 underline">
                    {t("marketplace.retry")}
                  </button>
                </div>
              ) : !listings || listings.length === 0 ? (
                <div className="flex min-h-100 flex-col items-center justify-center py-12 text-center">
                  <div className="relative mb-8">
                    <div className="absolute inset-0 animate-pulse rounded-full bg-linear-to-r from-purple-400 via-pink-400 to-indigo-400 opacity-20 blur-2xl"></div>
                    <div className="relative flex h-32 w-32 items-center justify-center rounded-full bg-linear-to-br from-purple-500 to-pink-500">
                      {activeTab === "starred" ? (
                        <HeartSolidIcon className="h-16 w-16 text-white" />
                      ) : (
                        <svg
                          className="h-16 w-16 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                  <h3 className="mb-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                    {activeTab === "starred"
                      ? t("marketplace.empty.starred.title")
                      : t("marketplace.empty.all.title")}
                  </h3>
                  <p className="mb-6 max-w-md text-center text-neutral-600 dark:text-neutral-400">
                    {activeTab === "starred"
                      ? t("marketplace.empty.starred.body")
                      : searchQuery
                        ? t("marketplace.empty.search.body")
                        : t("marketplace.empty.all.body")}
                  </p>

                  {/* Show "Browse Agents" button for Starred tab */}
                  {activeTab === "starred" && (
                    <button
                      onClick={() => setActiveTab("all")}
                      className="rounded-lg bg-linear-to-r from-purple-600 to-pink-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
                    >
                      {t("marketplace.empty.starred.browse")}
                    </button>
                  )}

                  {/* Show publish instructions for All tab when not searching */}
                  {activeTab === "all" && !searchQuery && (
                    <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                      <h4 className="mb-3 font-semibold text-neutral-900 dark:text-neutral-100">
                        {t("marketplace.empty.publish.title")}
                      </h4>
                      <ol className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
                        <li className="flex items-start gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400">
                            1
                          </span>
                          <span>{t("marketplace.empty.publish.steps.1")}</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400">
                            2
                          </span>
                          <span>{t("marketplace.empty.publish.steps.2")}</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400">
                            3
                          </span>
                          <span>{t("marketplace.empty.publish.steps.3")}</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400">
                            4
                          </span>
                          <span>{t("marketplace.empty.publish.steps.4")}</span>
                        </li>
                      </ol>
                    </div>
                  )}

                  {(searchQuery || selectedTag || sortBy !== "recent") && (
                    <button
                      onClick={clearFilters}
                      className="mt-2 text-sm text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      {t("marketplace.filters.clear")}
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  {activeTab === "all" && !debouncedSearch && !selectedTag && (
                    <MarketplaceSections
                      onSelectListing={handleSelectListing}
                      onMouseEnterListing={handleMouseEnter}
                    />
                  )}

                  {activeTab === "all" && listings && listings.length > 0 && (
                    <div className="mb-4 mt-8 flex items-center gap-3">
                      <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
                      <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                        {t("marketplace.sections.allAgents")}
                      </h2>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200">
                            <FunnelIcon className="h-3 w-3" />
                            {t(`marketplace.sort.${sortBy}`)}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="center">
                          {SORT_OPTIONS.map((option) => (
                            <DropdownMenuItem
                              key={option}
                              onClick={() => setSortBy(option)}
                            >
                              <span className="flex-1">
                                {t(`marketplace.sort.${option}`)}
                              </span>
                              {sortBy === option && (
                                <CheckIcon className="h-3.5 w-3.5 text-indigo-500" />
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
                      <AgentListingCard
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
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-indigo-600"></div>
                          <span>{t("marketplace.infinite.loadingMore")}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-neutral-500 dark:text-neutral-400">
                          {t("marketplace.infinite.scrollHint")}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <MyMarketplaceListings onSelectListing={handleManageListing} />
          )}
        </div>
      </div>
    </div>
  );
}

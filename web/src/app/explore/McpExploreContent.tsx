"use client";
import ExplorerMcpCard from "@/components/features/ExploreMcpCard";
import ExploreMcpListItem from "@/components/features/ExploreMcpListItem";
import { useXyzen } from "@/store";
import {
  FunnelIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import React, { useMemo, useState } from "react";

type ViewMode = "card" | "list";
type SortOption = "name" | "recent" | "popular";
type SourceFilter = "all" | "official" | "bohrium";

const McpExploreContent2: React.FC = () => {
  const { builtinMcpServers } = useXyzen();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [sortBy, setSortBy] = useState<SortOption>("name");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  // Filter and sort servers
  const filteredAndSortedServers = useMemo(() => {
    let filtered = [...builtinMcpServers];

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (mcp) =>
          mcp.name.toLowerCase().includes(query) ||
          mcp.description.toLowerCase().includes(query) ||
          mcp.module_name.toLowerCase().includes(query),
      );
    }

    // Apply source filter
    if (sourceFilter !== "all") {
      filtered = filtered.filter((mcp) => {
        const source = mcp.source || "official";
        return source === sourceFilter;
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "recent":
          // Assuming no timestamp, just reverse order
          return 0;
        case "popular":
          // Placeholder for popularity sorting
          return 0;
        default:
          return 0;
      }
    });

    return filtered;
  }, [builtinMcpServers, searchQuery, sourceFilter, sortBy]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="border-b border-neutral-200 dark:border-neutral-800 p-4 space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" />
          <input
            type="text"
            placeholder="Search MCP servers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Filters and View Options */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            {/* Source Filter */}
            <div className="flex items-center gap-2">
              <FunnelIcon className="h-4 w-4 text-neutral-500" />
              <select
                value={sourceFilter}
                onChange={(e) =>
                  setSourceFilter(e.target.value as SourceFilter)
                }
                className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Sources</option>
                <option value="official">Official</option>
                <option value="bohrium">Bohrium</option>
              </select>
            </div>

            {/* Sort Options */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="name">Sort by Name</option>
              <option value="recent">Sort by Recent</option>
              <option value="popular">Sort by Popular</option>
            </select>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 p-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900">
            <button
              onClick={() => setViewMode("card")}
              className={`p-1.5 rounded ${
                viewMode === "card"
                  ? "bg-white dark:bg-neutral-800 text-blue-600 dark:text-blue-400"
                  : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              }`}
              title="Card View"
            >
              <Squares2X2Icon className="h-5 w-5" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded ${
                viewMode === "list"
                  ? "bg-white dark:bg-neutral-800 text-blue-600 dark:text-blue-400"
                  : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              }`}
              title="List View"
            >
              <ListBulletIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Results Count */}
        <div className="text-sm text-neutral-500 dark:text-neutral-400">
          {filteredAndSortedServers.length}{" "}
          {filteredAndSortedServers.length === 1 ? "server" : "servers"} found
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredAndSortedServers.length > 0 ? (
          viewMode === "card" ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredAndSortedServers.map((mcp) => (
                <ExplorerMcpCard key={mcp.module_name} mcp={mcp} />
              ))}
            </div>
          ) : (
            <div className="space-y-3 max-w-5xl mx-auto">
              {filteredAndSortedServers.map((mcp) => (
                <ExploreMcpListItem key={mcp.module_name} mcp={mcp} />
              ))}
            </div>
          )
        ) : (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">🔍</div>
            <h3 className="text-lg font-semibold text-neutral-800 dark:text-white mb-2">
              No MCP Servers Found
            </h3>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Try adjusting your search or filter criteria
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default McpExploreContent2;

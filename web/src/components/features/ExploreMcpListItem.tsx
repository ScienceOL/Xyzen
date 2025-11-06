"use client";
import { Badge } from "@/components/base/Badge";
import type { ExplorableMcpServer } from "@/types/mcp";
import React from "react";

const DEFAULT_BANNER = "https://storage.sciol.ac.cn/library/origin.png";

const getSourceBadge = (source?: string) => {
  if (source === "official") {
    return (
      <Badge variant="green" className="text-xs flex items-center gap-1">
        <span>✓</span>
        <span>Official</span>
      </Badge>
    );
  }
  if (source === "bohrium") {
    return (
      <Badge variant="purple" className="text-xs">
        Bohrium
      </Badge>
    );
  }
  return null;
};

const ExploreMcpListItem: React.FC<{ mcp: ExplorableMcpServer }> = ({
  mcp,
}) => {
  const bannerUrl = mcp.banner || DEFAULT_BANNER;

  return (
    <div className="flex items-start gap-4 rounded-lg border border-neutral-200 bg-white p-4 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800/60 transition-colors">
      <img
        src={bannerUrl}
        className="h-20 w-32 rounded-md object-cover flex-shrink-0"
        alt={mcp.name}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h4 className="text-base font-semibold text-neutral-800 dark:text-white truncate">
            {mcp.name}
          </h4>
          <div className="flex items-center gap-2 flex-shrink-0">
            {getSourceBadge(mcp.source)}
            <Badge variant="blue" className="text-xs">
              MCP
            </Badge>
            {mcp.requires_auth && (
              <Badge variant="yellow" className="text-xs">
                Auth
              </Badge>
            )}
          </div>
        </div>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2 mb-2">
          {mcp.description}
        </p>
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          📦 {mcp.module_name}
        </div>
      </div>
    </div>
  );
};

export default ExploreMcpListItem;

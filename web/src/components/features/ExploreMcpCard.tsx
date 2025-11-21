"use client";
import { Badge } from "@/components/base/Badge";
import { CardBody, CardContainer, CardItem } from "@/components/ui/3d-card";
import type { BuiltinMcpData, ExplorableMcpServer } from "@/types/mcp";
import { isBuiltinMcp } from "@/types/mcp";
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

const ExplorerMcpCard: React.FC<{
  mcp: ExplorableMcpServer<BuiltinMcpData>;
}> = ({ mcp }) => {
  const bannerUrl = mcp.cover || DEFAULT_BANNER;

  return (
    <CardContainer className="py-4" containerClassName="p-0">
      <CardBody className="group/card relative h-auto w-full rounded-sm border border-neutral-200 bg-white p-6 dark:border-white/[0.2] dark:bg-black dark:hover:shadow-2xl dark:hover:shadow-emerald-500/[0.1]">
        <div className="flex items-start justify-between mb-2">
          <CardItem
            translateZ="50"
            className="text-xl font-bold text-neutral-600 dark:text-white flex-1"
          >
            {mcp.name}
          </CardItem>
          {getSourceBadge(mcp.source) && (
            <CardItem translateZ="50">{getSourceBadge(mcp.source)}</CardItem>
          )}
        </div>
        <CardItem
          as="p"
          translateZ="60"
          className="mt-2 max-w-sm text-sm text-neutral-500 dark:text-neutral-300"
        >
          {mcp.description}
        </CardItem>
        <CardItem translateZ="100" className="mt-4 w-full">
          <img
            src={bannerUrl}
            className="h-48 w-full rounded-sm object-cover group-hover/card:shadow-xl"
            alt={mcp.name}
          />
        </CardItem>
        <div className="mt-6 flex items-center justify-between">
          <CardItem translateZ={20} className="flex items-center gap-2">
            <Badge variant="blue" className="text-xs">
              MCP
            </Badge>
            {isBuiltinMcp(mcp) && mcp.data.requires_auth && (
              <Badge variant="yellow" className="text-xs">
                Auth
              </Badge>
            )}
          </CardItem>
          <CardItem
            translateZ={20}
            className="text-xs text-neutral-500 dark:text-neutral-400"
          >
            📦 {mcp.data.module_name}
          </CardItem>
        </div>
      </CardBody>
    </CardContainer>
  );
};

export default ExplorerMcpCard;

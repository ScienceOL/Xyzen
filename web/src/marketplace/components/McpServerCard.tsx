/**
 * MCP Server Card Component
 * 使用 3D Pin 效果的通用 MCP 卡片
 */

import { Badge } from "@/components/base/Badge";
import { PinContainer } from "@/components/ui/3d-pin";
import type { ExplorableMcpServer } from "@/types/mcp";
import { isBohriumMcp, isBuiltinMcp } from "@/types/mcp";
import {
  CheckBadgeIcon,
  RocketLaunchIcon,
  StarIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import React from "react";

interface McpServerCardProps {
  server: ExplorableMcpServer;
  isStarred?: boolean;
  onClick?: () => void;
}

const McpServerCard: React.FC<McpServerCardProps> = ({
  server,
  isStarred = false,
  onClick,
}) => {
  // 根据来源设置默认封面图
  const getCoverImage = () => {
    if (server.cover) return server.cover;

    switch (server.source) {
      case "official":
        return "https://storage.sciol.ac.cn/library/origin.png";
      case "bohrium":
        return "https://storage.sciol.ac.cn/library/browser-fav.png";
      case "smithery":
        return (
          server.cover || "https://storage.sciol.ac.cn/library/smithery.png"
        );
      default:
        return undefined;
    }
  };

  const getSourceBadge = () => {
    switch (server.source) {
      case "official":
        return <CheckBadgeIcon className="h-5 w-5 text-blue-500" />;
      case "bohrium":
        return (
          <img
            src="https://storage.sciol.ac.cn/library/browser-fav.png"
            alt="Bohrium"
            className="h-5 w-5 rounded-sm"
          />
        );
      case "smithery":
        return (
          <img
            src="https://storage.sciol.ac.cn/library/smithery.png"
            alt="Smithery"
            className="h-5 w-5 rounded-sm"
          />
        );
      default:
        return (
          <Badge variant="gray" className="text-xs">
            {server.source}
          </Badge>
        );
    }
  };

  return (
    <PinContainer
      title={server.name}
      containerClassName="w-full"
      className="w-full"
    >
      <div
        onClick={onClick}
        className="relative w-full min-w-[280px] cursor-pointer group"
      >
        {/* Cover Image - 4:1 长宽比 */}
        <div className="relative w-full aspect-[2/1] overflow-hidden rounded-t-lg mb-3">
          <img
            src={getCoverImage()}
            alt={server.name}
            className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-110"
          />
          {isStarred && (
            <div className="absolute right-2 top-2 rounded-full bg-yellow-400 p-1">
              <StarIconSolid className="h-3.5 w-3.5 text-yellow-900" />
            </div>
          )}
        </div>

        {/* Content - 压缩间距 */}
        <div className="space-y-2 pb-2">
          {/* Title & Badge */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="flex-1 text-sm sm:text-base font-bold text-white line-clamp-2 sm:line-clamp-1 break-words">
              {server.name}
            </h3>
            <div className="flex-shrink-0">{getSourceBadge()}</div>
          </div>

          {/* Description - 限制为2行 */}
          <p className="text-xs text-neutral-300 line-clamp-2 leading-relaxed break-words">
            {server.description}
          </p>

          {/* Tags - 最多显示2个 */}
          {isBohriumMcp(server) &&
            server.data.tags &&
            server.data.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {server.data.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag.id}
                    className="rounded px-1.5 py-0.5 text-[10px] truncate"
                    style={{
                      backgroundColor:
                        tag.theme === "blue"
                          ? "rgba(59, 130, 246, 0.15)"
                          : tag.theme === "green"
                            ? "rgba(34, 197, 94, 0.15)"
                            : tag.theme === "red"
                              ? "rgba(239, 68, 68, 0.15)"
                              : tag.theme === "purple"
                                ? "rgba(168, 85, 247, 0.15)"
                                : "rgba(115, 115, 115, 0.15)",
                      color:
                        tag.theme === "blue"
                          ? "#60a5fa"
                          : tag.theme === "green"
                            ? "#4ade80"
                            : tag.theme === "red"
                              ? "#f87171"
                              : tag.theme === "purple"
                                ? "#a78bfa"
                                : "#a3a3a3",
                    }}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            )}

          {isBuiltinMcp(server) &&
            (server.data.requires_auth || server.data.is_default) && (
              <div className="flex flex-wrap gap-1">
                {server.data.requires_auth && (
                  <span className="rounded px-1.5 py-0.5 text-[10px] bg-yellow-500/15 text-yellow-400">
                    需要认证
                  </span>
                )}
                {server.data.is_default && (
                  <span className="rounded px-1.5 py-0.5 text-[10px] bg-green-500/15 text-green-400">
                    默认启用
                  </span>
                )}
              </div>
            )}

          {/* Stats - 简化显示 */}
          {isBohriumMcp(server) && (
            <div className="flex items-center gap-2 sm:gap-3 pt-2 border-t border-white/10 text-[11px] text-neutral-400">
              <span className="flex items-center gap-1">
                <RocketLaunchIcon className="h-3.5 w-3.5" />
                {server.data.accessNum}
              </span>
              <span className="flex items-center gap-1">
                <StarIcon className="h-3.5 w-3.5" />
                {server.data.subscribeNum}
              </span>
            </div>
          )}
        </div>
      </div>
    </PinContainer>
  );
};

export default McpServerCard;

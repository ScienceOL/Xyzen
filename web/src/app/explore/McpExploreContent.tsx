"use client";
import { Badge } from "@/components/base/Badge";
import { cardHover, containerVariants, itemVariants } from "@/lib/animations";
import { useXyzen } from "@/store";
import type { BuiltinMcpServer } from "@/types/mcp";
import { motion } from "framer-motion";
import React from "react";

const ExplorerMcpCard: React.FC<{ mcp: BuiltinMcpServer }> = ({ mcp }) => {
  return (
    <motion.div
      variants={itemVariants}
      whileHover={cardHover}
      className="rounded-sm border border-neutral-200 bg-white p-3 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800/60"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="text-sm font-semibold text-neutral-800 dark:text-white truncate">
              {mcp.name}
            </h4>
            <Badge variant="blue" className="text-xs">
              MCP
            </Badge>
            {mcp.requires_auth && (
              <Badge variant="yellow" className="text-xs">
                Auth
              </Badge>
            )}
          </div>

          <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2 mb-2">
            {mcp.description}
          </p>

          <div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
            <span>📦 {mcp.module_name}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const McpExploreContent2: React.FC = () => {
  const { builtinMcpServers } = useXyzen();
  return (
    <motion.div
      className="space-y-3 p-4"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {builtinMcpServers.length > 0 ? (
        builtinMcpServers.map((mcp) => (
          <ExplorerMcpCard key={mcp.module_name} mcp={mcp} />
        ))
      ) : (
        <div className="text-center py-8">
          <div className="text-4xl mb-4">🏪</div>
          <h3 className="text-lg font-semibold text-neutral-800 dark:text-white mb-2">
            No MCP Servers Available
          </h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Built-in MCP servers will appear here when available
          </p>
        </div>
      )}
    </motion.div>
  );
};

export default McpExploreContent2;

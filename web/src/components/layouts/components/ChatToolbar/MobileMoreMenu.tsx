/**
 * Mobile More Menu
 *
 * A popup menu shown on mobile with search method, knowledge, and MCP info.
 */

import McpIcon from "@/assets/McpIcon";
import {
  SearchMethodSelector,
  type SearchMethod,
} from "../SearchMethodSelector";
import { KnowledgeSelector } from "../KnowledgeSelector";
import { AnimatePresence, motion } from "motion/react";

interface McpInfo {
  servers: Array<{
    id: string;
    tools?: Array<{ name: string }>;
  }>;
}

interface MobileMoreMenuProps {
  isOpen: boolean;
  searchMethod: SearchMethod;
  onSearchMethodChange: (method: SearchMethod) => void;
  supportsWebSearch: boolean;
  mcpEnabled: boolean;
  onMcpConflict: () => void;
  isKnowledgeConnected: boolean;
  onConnectKnowledge: () => void;
  onDisconnectKnowledge: () => void;
  mcpInfo: McpInfo | null;
  onClose: () => void;
}

export function MobileMoreMenu({
  isOpen,
  searchMethod,
  onSearchMethodChange,
  supportsWebSearch,
  mcpEnabled,
  onMcpConflict,
  isKnowledgeConnected,
  onConnectKnowledge,
  onDisconnectKnowledge,
  mcpInfo,
  onClose,
}: MobileMoreMenuProps) {
  const handleSearchMethodChange = (method: SearchMethod) => {
    onSearchMethodChange(method);
    onClose();
  };

  const handleConnectKnowledge = () => {
    onConnectKnowledge();
    onClose();
  };

  const handleDisconnectKnowledge = () => {
    onDisconnectKnowledge();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="absolute bottom-full left-0 right-0 mx-2 mb-2 z-50 rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-900 p-1.5"
        >
          <div className="flex flex-col gap-1">
            {/* Search Method Selector */}
            <div className="w-full">
              <SearchMethodSelector
                method={searchMethod}
                onMethodChange={handleSearchMethodChange}
                supportsBuiltinSearch={supportsWebSearch}
                mcpEnabled={mcpEnabled}
                onMcpConflict={onMcpConflict}
              />
            </div>

            {/* Knowledge Selector */}
            <div className="w-full">
              <KnowledgeSelector
                isConnected={isKnowledgeConnected}
                onConnect={handleConnectKnowledge}
                onDisconnect={handleDisconnectKnowledge}
              />
            </div>

            {/* MCP Tool Info */}
            {mcpInfo && (
              <div className="w-full px-2.5 py-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
                <div className="flex items-center justify-between text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  <div className="flex items-center gap-1.5">
                    <McpIcon className="h-3.5 w-3.5" />
                    <span>MCP 工具</span>
                  </div>
                  {mcpInfo.servers.length > 0 && (
                    <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">
                      {mcpInfo.servers.reduce(
                        (total, server) => total + (server.tools?.length || 0),
                        0,
                      )}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default MobileMoreMenu;

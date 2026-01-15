/**
 * Mobile More Menu
 *
 * A popup menu shown on mobile with tool selector and MCP info.
 */

import McpIcon from "@/assets/McpIcon";
import type { Agent } from "@/types/agents";
import { AnimatePresence, motion } from "motion/react";
import { ToolSelector } from "./ToolSelector";

interface McpInfo {
  servers: Array<{
    id: string;
    tools?: Array<{ name: string }>;
  }>;
}

interface MobileMoreMenuProps {
  isOpen: boolean;
  agent: Agent | null;
  onUpdateAgent: (agent: Agent) => Promise<void>;
  mcpInfo: McpInfo | null;
  sessionKnowledgeSetId?: string | null;
  onUpdateSessionKnowledge?: (knowledgeSetId: string | null) => Promise<void>;
}

export function MobileMoreMenu({
  isOpen,
  agent,
  onUpdateAgent,
  mcpInfo,
  sessionKnowledgeSetId,
  onUpdateSessionKnowledge,
}: MobileMoreMenuProps) {
  const handleUpdateAgent = async (updatedAgent: Agent) => {
    await onUpdateAgent(updatedAgent);
    // Don't close on toggle - let user configure multiple tools
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
            {/* Tool Selector */}
            {agent && (
              <div className="w-full">
                <ToolSelector
                  agent={agent}
                  onUpdateAgent={handleUpdateAgent}
                  hasKnowledgeSet={
                    !!agent.knowledge_set_id || !!sessionKnowledgeSetId
                  }
                  sessionKnowledgeSetId={sessionKnowledgeSetId}
                  onUpdateSessionKnowledge={onUpdateSessionKnowledge}
                />
              </div>
            )}

            {/* MCP Tool Info */}
            {mcpInfo && (
              <div className="w-full px-2.5 py-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
                <div className="flex items-center justify-between text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  <div className="flex items-center gap-1.5">
                    <McpIcon className="h-3.5 w-3.5" />
                    <span>MCP Tools</span>
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

"use client";
import { Modal } from "@/components/animate-ui/components/animate/modal";
import McpServerDetail from "@/marketplace/components/McpServerDetail";
import SmitheryServerDetail from "@/marketplace/components/SmitheryServerDetail";
import UnifiedMcpMarketList from "@/marketplace/components/UnifiedMcpMarketList";
import { useXyzen } from "@/store";
import {
  isBohriumMcp,
  isBuiltinMcp,
  isSmitheryMcp,
  type BohriumMcpData,
  type BuiltinMcpData,
  type ExplorableMcpServer,
  type SmitheryMcpData,
} from "@/types/mcp";
import React, { useMemo, useState } from "react";

const McpExploreContent: React.FC = () => {
  const { builtinMcpServers, quickAddBuiltinServer } = useXyzen();

  const [selected, setSelected] = useState<ExplorableMcpServer | null>(null);
  const isOpen = useMemo(() => !!selected, [selected]);

  const handleClose = () => setSelected(null);

  const handleQuickAdd = async () => {
    if (!selected) return;
    if (isBuiltinMcp(selected)) {
      // Official builtin quick add — pass the full explorable server
      await quickAddBuiltinServer(
        selected as ExplorableMcpServer<BuiltinMcpData>,
      );
      handleClose();
    }
  };

  return (
    <div className="p-6">
      <UnifiedMcpMarketList
        builtinServers={builtinMcpServers}
        onSelectServer={(server) => setSelected(server)}
      />

      {/* Detail Modal */}
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={selected?.name || ""}
        maxWidth="max-w-6xl"
        maxHeight="max-h-[90vh]"
      >
        <div className="overflow-y-auto max-h-[calc(90vh-120px)] custom-scrollbar">
          {selected ? (
            isBohriumMcp(selected) ? (
              <McpServerDetail
                appKey={(selected.data as BohriumMcpData).appKey}
                onBack={handleClose}
              />
            ) : isSmitheryMcp(selected) ? (
              <SmitheryServerDetail
                id={(selected.data as SmitheryMcpData).qualifiedName}
                onBack={handleClose}
              />
            ) : (
              <div className="space-y-4">
                {/* Cover / Banner */}
                <div className="overflow-hidden rounded-sm">
                  <img
                    src={
                      selected.cover ||
                      "https://storage.sciol.ac.cn/library/origin.png"
                    }
                    alt={selected.name}
                    className="h-48 w-full object-cover"
                  />
                </div>
                {/* Info */}
                <div>
                  <h3 className="text-xl font-semibold text-neutral-900 dark:text-white">
                    {selected.name}
                  </h3>
                  <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                    {selected.description}
                  </p>
                </div>
                {/* Quick Add */}
                <div className="flex justify-end gap-2">
                  <button
                    className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                    onClick={handleClose}
                  >
                    关闭
                  </button>
                  {isBuiltinMcp(selected) && (
                    <button
                      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                      onClick={handleQuickAdd}
                    >
                      一键添加
                    </button>
                  )}
                </div>
              </div>
            )
          ) : null}
        </div>
      </Modal>
    </div>
  );
};

export default McpExploreContent;

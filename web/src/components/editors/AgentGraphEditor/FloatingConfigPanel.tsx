import type {
  ComponentNodeConfig,
  GraphNodeConfig,
  LLMNodeConfig,
  ToolNodeConfig,
  TransformNodeConfig,
} from "@/types/graphConfig";
import { getNodeTypeInfo } from "@/types/graphConfig";
import { Button } from "@headlessui/react";
import { TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CommonSection,
  LLMSection,
  ToolSection,
  TransformSection,
  ComponentSection,
} from "./sections";

interface FloatingConfigPanelProps {
  node: GraphNodeConfig | null;
  onUpdate: (updates: {
    name?: string;
    description?: string | null;
    reads?: string[];
    writes?: string[];
    config?: Record<string, unknown>;
  }) => void;
  onClose: () => void;
  onDelete: () => void;
}

/**
 * Floating panel that appears on the right side when a node is selected.
 * Delegates to section components for kind-specific configuration.
 */
function FloatingConfigPanel({
  node,
  onUpdate,
  onClose,
  onDelete,
}: FloatingConfigPanelProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);

  // Local state mirrors node config; flush on blur
  const [localName, setLocalName] = useState(node?.name || "");
  const [localDescription, setLocalDescription] = useState(
    node?.description || "",
  );
  const [localConfig, setLocalConfig] = useState<Record<string, unknown>>(() =>
    node ? { ...node.config } : {},
  );

  // Sync local state when selected node changes
  useEffect(() => {
    if (node) {
      setLocalName(node.name);
      setLocalDescription(node.description || "");
      setLocalConfig({ ...node.config });
    }
  }, [node]);

  // Flush text-field changes to parent
  const flushChanges = useCallback(() => {
    if (!node) return;
    onUpdate({
      name: localName,
      description: localDescription || null,
      config: localConfig,
    });
  }, [node, localName, localDescription, localConfig, onUpdate]);

  // Kind-specific config change handler (immediate push for switches/tags)
  const handleConfigChange = useCallback(
    (updates: Record<string, unknown>) => {
      setLocalConfig((prev) => {
        const next = { ...prev, ...updates };
        onUpdate({ config: next });
        return next;
      });
    },
    [onUpdate],
  );

  // Reads/writes change handlers (immediate push)
  const handleReadsChange = useCallback(
    (reads: string[]) => onUpdate({ reads }),
    [onUpdate],
  );

  const handleWritesChange = useCallback(
    (writes: string[]) => onUpdate({ writes }),
    [onUpdate],
  );

  if (!node) return null;

  const typeInfo = getNodeTypeInfo(node.kind);

  return (
    <AnimatePresence>
      {node && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute right-3 top-3 bottom-3 z-50 flex w-80 flex-col overflow-hidden rounded-lg bg-white/95 shadow-2xl backdrop-blur-sm dark:bg-neutral-800/95 dark:shadow-neutral-900/50"
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-neutral-200/60 px-4 py-3 dark:border-neutral-800/60">
            <div className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: typeInfo.color }}
              />
              <span className="text-[13px] font-semibold text-neutral-800 dark:text-neutral-100">
                {typeInfo.label} — {t("agents.graphEditor.nodePanel.title")}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                onClick={onDelete}
                className="rounded-md p-1.5 transition-colors hover:bg-rose-100 dark:hover:bg-rose-900/30"
                title={t("agents.graphEditor.nodePanel.deleteNode")}
              >
                <TrashIcon className="h-4 w-4 text-rose-500" />
              </Button>
              <Button
                onClick={onClose}
                className="rounded-md p-1.5 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700"
              >
                <XMarkIcon className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
              </Button>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="custom-scrollbar flex-1 overflow-y-auto">
            <div className="space-y-6 px-4 py-4">
              {/* Common fields for all node kinds */}
              <CommonSection
                config={node}
                onNameChange={setLocalName}
                onDescriptionChange={(desc) => setLocalDescription(desc || "")}
                onReadsChange={handleReadsChange}
                onWritesChange={handleWritesChange}
                onBlur={flushChanges}
              />

              {/* Divider */}
              <div className="border-t border-neutral-200/60 dark:border-neutral-800/60" />

              {/* Kind-specific section */}
              {node.kind === "llm" && (
                <LLMSection
                  config={localConfig as unknown as LLMNodeConfig}
                  onChange={handleConfigChange}
                  onBlur={flushChanges}
                />
              )}

              {node.kind === "tool" && (
                <ToolSection
                  config={localConfig as unknown as ToolNodeConfig}
                  onChange={handleConfigChange}
                  onBlur={flushChanges}
                />
              )}

              {node.kind === "transform" && (
                <TransformSection
                  config={localConfig as unknown as TransformNodeConfig}
                  onChange={handleConfigChange}
                  onBlur={flushChanges}
                />
              )}

              {node.kind === "component" && (
                <ComponentSection
                  config={localConfig as unknown as ComponentNodeConfig}
                  onChange={handleConfigChange}
                  onBlur={flushChanges}
                />
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default memo(FloatingConfigPanel);

import type { GraphNodeConfig } from "@/types/graphConfig";
import { getNodeTypeInfo } from "@/types/graphConfig";
import { Button } from "@headlessui/react";
import { TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { memo, useCallback, useEffect, useRef, useState } from "react";

interface FloatingConfigPanelProps {
  node: GraphNodeConfig | null;
  onUpdate: (updates: Partial<GraphNodeConfig>) => void;
  onClose: () => void;
  onDelete: () => void;
}

/**
 * Floating panel that appears on the right side when a node is selected.
 * Provides a compact interface for configuring node properties.
 */
function FloatingConfigPanel({
  node,
  onUpdate,
  onClose,
  onDelete,
}: FloatingConfigPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState(node?.name || "");
  const [description, setDescription] = useState(node?.description || "");
  const [promptTemplate, setPromptTemplate] = useState("");
  const [outputKey, setOutputKey] = useState("");
  const [toolName, setToolName] = useState("");

  // Update local state when node changes
  useEffect(() => {
    if (node) {
      setName(node.name);
      setDescription(node.description || "");

      if (node.llm_config) {
        setPromptTemplate(node.llm_config.prompt_template || "");
        setOutputKey(node.llm_config.output_key || "response");
      }
      if (node.tool_config) {
        setToolName(node.tool_config.tool_name || "");
        setOutputKey(node.tool_config.output_key || "tool_result");
      }
    }
  }, [node]);

  // Debounced save
  const saveChanges = useCallback(() => {
    if (!node) return;

    const updates: Partial<GraphNodeConfig> = {
      name,
      description: description || null,
    };

    if (node.type === "llm" && node.llm_config) {
      updates.llm_config = {
        ...node.llm_config,
        prompt_template: promptTemplate,
        output_key: outputKey,
      };
    }

    if (node.type === "tool" && node.tool_config) {
      updates.tool_config = {
        ...node.tool_config,
        tool_name: toolName,
        output_key: outputKey,
      };
    }

    onUpdate(updates);
  }, [node, name, description, promptTemplate, outputKey, toolName, onUpdate]);

  const handleBlur = () => {
    saveChanges();
  };

  if (!node) return null;

  const typeInfo = getNodeTypeInfo(node.type);

  const inputClassName = `
    w-full px-3 py-2 text-sm rounded-lg border border-neutral-200
    bg-white dark:bg-neutral-900 dark:border-neutral-600 dark:text-neutral-100
    focus:ring-2 focus:ring-indigo-500 focus:border-transparent
    placeholder:text-neutral-400 dark:placeholder:text-neutral-500
    transition-colors
  `;

  return (
    <AnimatePresence>
      {node && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="
            absolute right-3 top-3 bottom-3 z-50 w-80
            bg-white rounded-xl shadow-2xl border border-neutral-200
            dark:bg-neutral-800 dark:border-neutral-600 dark:shadow-neutral-900/50
            overflow-hidden flex flex-col
          "
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 shrink-0">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: typeInfo.color }}
              />
              <span className="font-medium text-sm text-neutral-800 dark:text-neutral-100">
                {typeInfo.label} Node
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                onClick={onDelete}
                className="p-1.5 rounded-md hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors"
                title="Delete node"
              >
                <TrashIcon className="w-4 h-4 text-rose-500" />
              </Button>
              <Button
                onClick={onClose}
                className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
              >
                <XMarkIcon className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
              </Button>
            </div>
          </div>

          {/* Form */}
          <div className="flex-1 p-4 space-y-4 overflow-y-auto">
            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1.5">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleBlur}
                className={inputClassName}
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1.5">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={handleBlur}
                placeholder="Optional"
                className={inputClassName}
              />
            </div>

            {/* LLM-specific config */}
            {node.type === "llm" && (
              <>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1.5">
                    Prompt Template
                  </label>
                  <textarea
                    value={promptTemplate}
                    onChange={(e) => setPromptTemplate(e.target.value)}
                    onBlur={handleBlur}
                    rows={6}
                    placeholder="Use {{ state.field }} for variables"
                    className={`${inputClassName} font-mono resize-none`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1.5">
                    Output Key
                  </label>
                  <input
                    type="text"
                    value={outputKey}
                    onChange={(e) => setOutputKey(e.target.value)}
                    onBlur={handleBlur}
                    placeholder="response"
                    className={inputClassName}
                  />
                </div>
              </>
            )}

            {/* Tool-specific config */}
            {node.type === "tool" && (
              <>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1.5">
                    Tool Name
                  </label>
                  <input
                    type="text"
                    value={toolName}
                    onChange={(e) => setToolName(e.target.value)}
                    onBlur={handleBlur}
                    placeholder="MCP tool name"
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1.5">
                    Output Key
                  </label>
                  <input
                    type="text"
                    value={outputKey}
                    onChange={(e) => setOutputKey(e.target.value)}
                    onBlur={handleBlur}
                    placeholder="tool_result"
                    className={inputClassName}
                  />
                </div>
              </>
            )}

            {/* Router hint */}
            {node.type === "router" && (
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-xs text-amber-700 dark:text-amber-400">
                Configure conditions through edge connections.
              </div>
            )}

            {/* Subagent hint */}
            {node.type === "subagent" && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-xs text-emerald-700 dark:text-emerald-400">
                Configure subagent in JSON editor.
              </div>
            )}

            {/* Transform hint */}
            {node.type === "transform" && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs text-blue-700 dark:text-blue-400">
                Configure transform logic in JSON editor.
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default memo(FloatingConfigPanel);

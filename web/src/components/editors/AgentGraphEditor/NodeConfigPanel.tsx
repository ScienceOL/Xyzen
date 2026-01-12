import { memo, useState, useEffect, useCallback } from "react";
import type { GraphNodeConfig } from "@/types/graphConfig";
import { getNodeTypeInfo } from "@/types/graphConfig";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@headlessui/react";

interface NodeConfigPanelProps {
  node: GraphNodeConfig | null;
  onUpdate: (updates: Partial<GraphNodeConfig>) => void;
  onClose: () => void;
  onDelete: () => void;
}

/**
 * Panel for configuring a selected node's properties.
 */
function NodeConfigPanel({
  node,
  onUpdate,
  onClose,
  onDelete,
}: NodeConfigPanelProps) {
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

      // Load type-specific config
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

    // Type-specific updates
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

  // Auto-save on blur
  const handleBlur = () => {
    saveChanges();
  };

  if (!node) {
    return (
      <div className="p-4 text-center text-neutral-500 dark:text-neutral-400">
        <p className="text-sm">Select a node to configure</p>
      </div>
    );
  }

  const typeInfo = getNodeTypeInfo(node.type);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: typeInfo.color }}
          />
          <span className="font-medium text-sm text-neutral-800 dark:text-neutral-200">
            {typeInfo.label} Node
          </span>
        </div>
        <Button
          onClick={onClose}
          className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <XMarkIcon className="w-5 h-5 text-neutral-500" />
        </Button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleBlur}
            className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300
              bg-white dark:bg-neutral-800 dark:border-neutral-600
              focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={handleBlur}
            placeholder="Optional description"
            className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300
              bg-white dark:bg-neutral-800 dark:border-neutral-600
              focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {/* LLM-specific config */}
        {node.type === "llm" && (
          <>
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                Prompt Template
              </label>
              <textarea
                value={promptTemplate}
                onChange={(e) => setPromptTemplate(e.target.value)}
                onBlur={handleBlur}
                rows={6}
                placeholder="Enter your prompt template. Use {{ state.field }} for variables."
                className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300
                  bg-white dark:bg-neutral-800 dark:border-neutral-600
                  focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                  font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                Output Key
              </label>
              <input
                type="text"
                value={outputKey}
                onChange={(e) => setOutputKey(e.target.value)}
                onBlur={handleBlur}
                placeholder="response"
                className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300
                  bg-white dark:bg-neutral-800 dark:border-neutral-600
                  focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </>
        )}

        {/* Tool-specific config */}
        {node.type === "tool" && (
          <>
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                Tool Name
              </label>
              <input
                type="text"
                value={toolName}
                onChange={(e) => setToolName(e.target.value)}
                onBlur={handleBlur}
                placeholder="Enter MCP tool name"
                className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300
                  bg-white dark:bg-neutral-800 dark:border-neutral-600
                  focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                Output Key
              </label>
              <input
                type="text"
                value={outputKey}
                onChange={(e) => setOutputKey(e.target.value)}
                onBlur={handleBlur}
                placeholder="tool_result"
                className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300
                  bg-white dark:bg-neutral-800 dark:border-neutral-600
                  focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </>
        )}

        {/* Router-specific config */}
        {node.type === "router" && (
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-md">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Router conditions are configured through edge connections. Connect
              multiple edges and set conditions on each.
            </p>
          </div>
        )}

        {/* Subagent-specific config */}
        {node.type === "subagent" && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-md">
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              Configure subagent reference in the JSON editor for now. Visual
              configuration coming soon.
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-700">
        <Button
          onClick={onDelete}
          className="w-full py-2 text-sm font-medium text-rose-600 hover:text-rose-700
            hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-md transition-colors"
        >
          Delete Node
        </Button>
      </div>
    </div>
  );
}

export default memo(NodeConfigPanel);

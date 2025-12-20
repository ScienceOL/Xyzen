"use client";

/**
 * AgentExplorer - Placeholder Component
 *
 * This component previously displayed graph agents from the community.
 * Graph agents have been removed from the system as part of the simplification effort.
 *
 * This placeholder is kept to avoid breaking imports, but shows a message
 * that this feature is no longer available.
 */
export default function AgentExplorer() {
  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-4xl mb-4">🔧</div>
        <h3 className="text-lg font-semibold text-neutral-800 dark:text-white mb-2">
          Agent Explorer
        </h3>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
          This feature has been simplified. You can create and manage your
          custom agents directly from the Agents panel.
        </p>
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          Click the "+ 添加助手" button to create a new agent with custom
          prompts and tools.
        </p>
      </div>
    </div>
  );
}

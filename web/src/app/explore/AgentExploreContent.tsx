"use client";

/**
 * AgentExploreContent - Placeholder Component
 *
 * Graph agents have been removed from the system as part of the simplification effort.
 * This placeholder shows a message that this feature is no longer available.
 */
export default function AgentExploreContent() {
  return (
    <div className="flex h-[calc(100vh-200px)] items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6">🔧</div>
        <h3 className="text-xl font-semibold text-neutral-800 dark:text-white mb-3">
          Graph Agents Removed
        </h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
          Graph agents have been simplified and removed from this version. You
          can create and manage your custom agents directly from the Agents
          panel.
        </p>
        <p className="text-xs text-neutral-500 dark:text-neutral-500 mb-6">
          Use the "+ 添加助手" button in the sidebar to create a new agent with
          custom prompts, tools, and knowledge sets.
        </p>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-sm text-sm text-indigo-600 dark:text-indigo-400">
          💡 Agents can now be bound to knowledge sets for scoped file access
        </div>
      </div>
    </div>
  );
}

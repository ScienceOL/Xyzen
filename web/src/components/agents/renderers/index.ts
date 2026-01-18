/**
 * Component Renderers
 *
 * Specialized UI renderers for different agent components.
 *
 * Usage:
 *   import { initializeRenderers, getRenderer, DefaultRenderer } from "@/components/agents/renderers";
 *
 *   // At app startup
 *   initializeRenderers();
 *
 *   // In component
 *   const CustomRenderer = getRenderer(phase.componentKey);
 *   const Renderer = CustomRenderer || DefaultRenderer;
 *   return <Renderer phase={phase} isActive={isActive} />;
 */

export * from "./registry";
export { default as DefaultRenderer } from "./DefaultRenderer";
export { registerDeepResearchRenderers } from "./deep-research";

import { registerDeepResearchRenderers } from "./deep-research";

/**
 * Initialize all component renderers.
 * Call this at app startup (e.g., in main.tsx).
 */
export function initializeRenderers(): void {
  // Register all renderer sets
  registerDeepResearchRenderers();
}

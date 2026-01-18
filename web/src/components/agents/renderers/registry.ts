/**
 * Component Renderer Registry
 *
 * Provides a registry for mapping component keys to specialized renderers.
 * This enables different UI rendering for different agent components.
 *
 * Usage:
 *   1. Register renderers at app startup (see initializeRenderers)
 *   2. Use getRenderer() to get the appropriate renderer for a componentKey
 *   3. Fall back to DefaultRenderer if no specialized renderer exists
 */

import type { ComponentType } from "react";
import type { PhaseExecution } from "@/types/agentEvents";

/**
 * Props passed to component renderers
 */
export interface ComponentRendererProps {
  /** The phase execution data containing content and metadata */
  phase: PhaseExecution;
  /** Whether this phase is currently active (running) */
  isActive: boolean;
}

/**
 * Type for a component renderer - a React component that renders phase content
 */
export type ComponentRenderer = ComponentType<ComponentRendererProps>;

/**
 * Internal registry mapping component keys to their renderers
 */
const rendererRegistry = new Map<string, ComponentRenderer>();

/**
 * Register a renderer for a specific component key.
 *
 * @param componentKey - The component key (e.g., "system:deep_research:clarify")
 * @param renderer - The React component to use for rendering
 *
 * @example
 * ```ts
 * import ClarificationRenderer from "./deep-research/ClarificationRenderer";
 * registerRenderer("system:deep_research:clarify", ClarificationRenderer);
 * ```
 */
export function registerRenderer(
  componentKey: string,
  renderer: ComponentRenderer,
): void {
  rendererRegistry.set(componentKey, renderer);
}

/**
 * Get the renderer for a component key.
 *
 * @param componentKey - The component key to look up
 * @returns The registered renderer, or null if not found
 *
 * @example
 * ```tsx
 * const CustomRenderer = getRenderer(phase.componentKey);
 * if (CustomRenderer) {
 *   return <CustomRenderer phase={phase} isActive={isActive} />;
 * }
 * // Fall back to default rendering
 * ```
 */
export function getRenderer(componentKey?: string): ComponentRenderer | null {
  if (!componentKey) return null;
  return rendererRegistry.get(componentKey) || null;
}

/**
 * Check if a renderer is registered for a component key.
 *
 * @param componentKey - The component key to check
 * @returns true if a renderer is registered
 */
export function hasRenderer(componentKey?: string): boolean {
  if (!componentKey) return false;
  return rendererRegistry.has(componentKey);
}

/**
 * Get all registered component keys.
 * Useful for debugging and testing.
 */
export function getRegisteredKeys(): string[] {
  return Array.from(rendererRegistry.keys());
}

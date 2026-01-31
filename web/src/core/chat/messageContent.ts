/**
 * Message Content Resolution Module
 *
 * This module provides utilities for resolving the display content of a message.
 * Content can come from multiple sources with the following priority:
 *
 * CONTENT SOURCE PRIORITY (highest to lowest):
 * 1. message.content - Direct field, populated after editing or at streaming_end
 * 2. agentExecution.phases[last].streamedContent - Accumulated streaming content
 * 3. Empty string - Fallback when no content is available
 *
 * SCENARIO MAPPING:
 * - Simple chat (no agentExecution): Uses message.content directly
 * - ReAct agent: Creates fallback "Response" phase, content in phase.streamedContent
 * - Multi-phase agent: Content distributed across phases, final in last phase
 * - After page refresh: message.content populated from DB, agentExecution reconstructed
 *
 * NOTE: For agents without explicit node_start events (like LangChain's create_react_agent),
 * a fallback "Response" phase is created in chatSlice.ts streaming_start handler.
 * See: store/slices/chatSlice.ts - streaming_start case
 */

import type { Message } from "@/store/types";
import type { PhaseExecution } from "@/types/agentEvents";

/**
 * Content resolution result with metadata for rendering decisions
 */
export interface ResolvedContent {
  /** The actual text content to display */
  text: string;
  /** Source of the content for debugging/logging */
  source: "message.content" | "phase.streamedContent" | "empty";
  /** Whether content is still being streamed (available for future use, e.g., streaming indicators) */
  isIncomplete: boolean;
}

/**
 * Display mode for message rendering.
 * Determines which rendering path to use in ChatBubble.
 */
export type MessageDisplayMode =
  | "loading" // Show loading indicator
  | "simple" // No agent execution, render content directly
  | "timeline_streaming" // Show timeline with content streaming into phases
  | "timeline_complete" // Show timeline + final content below
  | "waiting"; // Agent started but no content yet

/**
 * Get the last non-empty phase content from a phases array.
 * Iterates backwards to find the most recent phase with content.
 *
 * @param phases - Array of phases to search
 * @returns The content of the last non-empty phase, or null if none found
 */
export function getLastNonEmptyPhaseContent(
  phases: Pick<PhaseExecution, "streamedContent">[] | null | undefined,
): string | null {
  if (!phases || phases.length === 0) {
    return null;
  }

  for (let i = phases.length - 1; i >= 0; i -= 1) {
    const phaseContent = phases[i]?.streamedContent;
    // Use trim only to detect emptiness; return the original string to preserve whitespace.
    if (phaseContent && phaseContent.trim().length > 0) {
      return phaseContent;
    }
  }

  return null;
}

/**
 * Resolve the display content for a message.
 *
 * This is the single source of truth for what content should be displayed
 * for any given message state. Use this for both rendering and copy operations.
 *
 * @param message - The message to resolve content for
 * @returns ResolvedContent with text and metadata
 */
export function resolveMessageContent(message: Message): ResolvedContent {
  const { content, agentExecution, isStreaming } = message;

  // Priority 1: Direct content field (populated after edit or streaming_end)
  if (content) {
    return {
      text: content,
      source: "message.content",
      isIncomplete: Boolean(isStreaming),
    };
  }

  // Priority 2: Phase streamed content (for agent executions)
  if (agentExecution?.phases?.length) {
    const phaseContent = getLastNonEmptyPhaseContent(agentExecution.phases);
    if (phaseContent) {
      return {
        text: phaseContent,
        source: "phase.streamedContent",
        isIncomplete: agentExecution.status === "running",
      };
    }
  }

  // Fallback: Empty
  return {
    text: "",
    source: "empty",
    isIncomplete: Boolean(isStreaming || agentExecution?.status === "running"),
  };
}

/**
 * Analyze message state to determine how it should be rendered.
 *
 * This replaces the complex conditional logic in ChatBubble.tsx with explicit,
 * testable display mode determination.
 *
 * @param message - The message to analyze
 * @returns MessageDisplayMode indicating how to render the message
 */
export function getMessageDisplayMode(message: Message): MessageDisplayMode {
  const { isLoading, isStreaming, agentExecution } = message;

  // Explicit loading state
  if (isLoading) {
    return "loading";
  }

  // No agent execution = simple chat
  if (!agentExecution) {
    return "simple";
  }

  // Agent execution with no phases yet = waiting
  if (
    agentExecution.phases.length === 0 &&
    agentExecution.status === "running"
  ) {
    return "waiting";
  }

  // Agent execution with phases
  if (agentExecution.phases.length > 0) {
    // Still running or streaming = show in timeline
    if (isStreaming || agentExecution.status === "running") {
      return "timeline_streaming";
    }
    // Completed = show final content below timeline
    return "timeline_complete";
  }

  // Fallback to simple
  return "simple";
}

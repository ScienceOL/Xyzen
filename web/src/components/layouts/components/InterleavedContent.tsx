/**
 * InterleavedContent renders markdown text interleaved with grouped tool call
 * accordions. Tool calls are grouped by their `contentOffset` position in the
 * streamed content, so users see exactly where tool calls happened in the flow.
 *
 * Fallback: when no tool call has a `contentOffset` (e.g. DB-loaded messages
 * from before this feature), renders a single ToolCallGroup at the top
 * followed by the full markdown content — matching the previous layout.
 */

import Markdown from "@/lib/Markdown";
import type { ToolCall } from "@/store/types";
import { memo, useMemo } from "react";
import ToolCallGroup from "./ToolCallGroup";

interface InterleavedContentProps {
  content: string;
  toolCalls: ToolCall[];
}

interface Segment {
  type: "text" | "tools";
  /** Markdown string for text segments */
  text?: string;
  /** Tool calls for tool segments */
  tools?: ToolCall[];
}

/**
 * Compute interleaved segments from content + tool calls with offsets.
 *
 * Groups consecutive tool calls at the same offset into one ToolCallGroup,
 * then splits the content string at those offsets to produce alternating
 * text / tools segments.
 */
function computeSegments(content: string, toolCalls: ToolCall[]): Segment[] {
  // Check if any tool call has a contentOffset — if not, use fallback layout
  const hasOffsets = toolCalls.some((tc) => tc.contentOffset !== undefined);

  if (!hasOffsets) {
    // Fallback: single group on top + full content below
    const segments: Segment[] = [];
    if (toolCalls.length > 0) {
      segments.push({ type: "tools", tools: toolCalls });
    }
    if (content) {
      segments.push({ type: "text", text: content });
    }
    return segments;
  }

  // Group tool calls by offset, preserving order within each group
  const grouped = new Map<number, ToolCall[]>();
  for (const tc of toolCalls) {
    const offset = tc.contentOffset ?? 0;
    const group = grouped.get(offset);
    if (group) {
      group.push(tc);
    } else {
      grouped.set(offset, [tc]);
    }
  }

  // Sort offsets ascending
  const sortedOffsets = Array.from(grouped.keys()).sort((a, b) => a - b);

  const raw: Segment[] = [];
  let cursor = 0;

  for (const offset of sortedOffsets) {
    // Text before this group of tool calls
    if (offset > cursor) {
      const text = content.slice(cursor, offset).trim();
      if (text) {
        raw.push({ type: "text", text });
      }
    }
    // The tool call group
    const tools = grouped.get(offset)!;
    raw.push({ type: "tools", tools });
    cursor = Math.max(cursor, offset);
  }

  // Remaining text after last tool call group
  if (cursor < content.length) {
    const text = content.slice(cursor).trim();
    if (text) {
      raw.push({ type: "text", text });
    }
  }

  // Merge consecutive tool segments (happens when consecutive tool calls
  // have different offsets but only whitespace/separators between them)
  const segments: Segment[] = [];
  for (const seg of raw) {
    const prev = segments[segments.length - 1];
    if (seg.type === "tools" && prev?.type === "tools") {
      prev.tools = [...(prev.tools ?? []), ...(seg.tools ?? [])];
    } else {
      segments.push(seg);
    }
  }

  return segments;
}

function InterleavedContent({ content, toolCalls }: InterleavedContentProps) {
  const segments = useMemo(
    () => computeSegments(content, toolCalls),
    [content, toolCalls],
  );

  return (
    <div>
      {segments.map((segment, i) => {
        if (segment.type === "tools" && segment.tools) {
          return <ToolCallGroup key={`tools-${i}`} toolCalls={segment.tools} />;
        }
        if (segment.type === "text" && segment.text) {
          return <Markdown key={`text-${i}`} content={segment.text} />;
        }
        return null;
      })}
    </div>
  );
}

export default memo(InterleavedContent);

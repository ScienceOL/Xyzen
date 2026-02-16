/**
 * ChunkBuffer — batches streaming_chunk and thinking_chunk at rAF cadence.
 *
 * Extracted from the inline `flushChunks` closure inside `connectToChannel`
 * to keep `chatSlice.ts` focused on event dispatch logic.
 *
 * Usage:
 *   const buffer = new ChunkBuffer(topicId, getChannel, mutateChannel);
 *   buffer.pushStreaming(streamId, content, executionId);
 *   buffer.pushThinking(streamId, content);
 *   buffer.flushSync();   // force-flush before a non-chunk event
 *   buffer.destroy();     // cancel pending rAF on disconnect
 */

import { generateClientId } from "@/core/chat/messageProcessor";
import {
  ensureFallbackResponsePhase,
  findMessageIndexByStream,
  syncChannelResponding,
} from "@/core/chat/channelHelpers";
import type { ChatChannel } from "@/store/types";

interface ChunkEntry {
  type: "streaming" | "thinking";
  id: string;
  content: string;
  execution_id?: string;
}

export class ChunkBuffer {
  private buffer: ChunkEntry[] = [];
  private rafId: number | null = null;

  constructor(
    // private _topicId: string,
    // private _getChannel: () => ChatChannel | undefined,
    private mutateChannel: (fn: (channel: ChatChannel) => void) => void,
  ) {}

  /** Buffer a streaming content chunk. */
  pushStreaming(streamId: string, content: string, executionId?: string): void {
    this.buffer.push({
      type: "streaming",
      id: streamId,
      content,
      execution_id: executionId,
    });
    this.scheduleFlush();
  }

  /** Buffer a thinking content chunk. */
  pushThinking(streamId: string, content: string): void {
    this.buffer.push({ type: "thinking", id: streamId, content });
    this.scheduleFlush();
  }

  /** Force-flush any pending chunks synchronously (call before non-chunk events). */
  flushSync(): void {
    if (this.buffer.length === 0) return;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.flush();
  }

  /** Cancel any pending rAF (call on disconnect / cleanup). */
  destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.buffer = [];
  }

  /** True if there are buffered chunks waiting to flush. */
  get hasPending(): boolean {
    return this.buffer.length > 0;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private scheduleFlush(): void {
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => this.flush());
    }
  }

  private flush(): void {
    this.rafId = null;
    if (this.buffer.length === 0) return;
    const batch = this.buffer;
    this.buffer = [];

    this.mutateChannel((channel) => {
      for (const chunk of batch) {
        if (chunk.type === "streaming") {
          this.applyStreamingChunk(channel, chunk);
        } else {
          this.applyThinkingChunk(channel, chunk);
        }
      }

      syncChannelResponding(channel);
    });
  }

  private applyStreamingChunk(channel: ChatChannel, chunk: ChunkEntry): void {
    const streamingIndex = findMessageIndexByStream(
      channel,
      chunk.id,
      chunk.execution_id,
    );

    if (streamingIndex === -1) {
      channel.messages.push({
        id: chunk.id,
        streamId: chunk.id,
        clientId: generateClientId(),
        role: "assistant" as const,
        content: chunk.content,
        created_at: new Date().toISOString(),
        status: "streaming",
        isStreaming: true,
      });
      return;
    }

    const msg = channel.messages[streamingIndex];
    msg.streamId = chunk.id;
    msg.status = "streaming";
    msg.isStreaming = true;
    msg.isThinking = false;

    if (msg.agentExecution) {
      ensureFallbackResponsePhase(msg);
      const execution = msg.agentExecution;
      if (!execution || execution.phases.length === 0) {
        return;
      }

      let targetPhase = execution.currentNode
        ? execution.phases.find((p) => p.id === execution.currentNode)
        : null;

      if (!targetPhase) {
        targetPhase = execution.phases.find((p) => p.status === "running");
      }

      if (!targetPhase) {
        targetPhase = execution.phases[execution.phases.length - 1];
      }

      const existingContent = targetPhase.streamedContent || "";
      if (
        existingContent.length > 100 &&
        chunk.content.length > existingContent.length &&
        chunk.content.startsWith(existingContent.slice(0, 100))
      ) {
        targetPhase.streamedContent = chunk.content;
      } else {
        targetPhase.streamedContent = existingContent + chunk.content;
      }
    } else {
      const currentContent = msg.content;
      channel.messages[streamingIndex].content = currentContent + chunk.content;
    }
  }

  private applyThinkingChunk(channel: ChatChannel, chunk: ChunkEntry): void {
    let thinkingIndex = channel.messages.findIndex((m) => m.id === chunk.id);

    if (thinkingIndex === -1) {
      thinkingIndex = channel.messages.findLastIndex(
        (m) => m.isThinking && m.agentExecution?.status === "running",
      );
    }

    if (thinkingIndex !== -1) {
      const currentThinking =
        channel.messages[thinkingIndex].thinkingContent ?? "";
      channel.messages[thinkingIndex].thinkingContent =
        currentThinking + chunk.content;
    }
  }
}

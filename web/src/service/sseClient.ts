/**
 * SSE client for persistent, replayable event delivery via Redis Streams.
 *
 * Replaces the server→client half of the WebSocket protocol.
 * Uses fetch() + ReadableStream instead of EventSource because
 * EventSource doesn't support Authorization headers.
 */

import { authService } from "@/service/authService";
import { logout } from "@/core/auth";
import { useXyzen } from "@/store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SSECallbacks {
  /** Called for each chat event (same shape as the WS messageEventCallback). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMessageEvent: (event: { type: string; data: any }) => void;
  /** Called when connection status changes. */
  onStatusChange: (status: { connected: boolean; error?: string }) => void;
}

interface SSEConnection {
  topicId: string;
  controller: AbortController;
  lastEventId: string | null;
  retryCount: number;
  callbacks: SSECallbacks;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RETRIES = 8;
const BASE_RETRY_MS = 1000;
const MAX_RETRY_MS = 15_000;

// ---------------------------------------------------------------------------
// SSE line parser
// ---------------------------------------------------------------------------

interface SSEEvent {
  id?: string;
  event?: string;
  data?: string;
}

/**
 * Parses a raw SSE text chunk into events.
 * Handles multi-line data fields and comment lines.
 */
function* parseSSEChunk(
  buffer: string,
): Generator<{ event: SSEEvent; remaining: string }> {
  // SSE events are separated by double newlines
  let remaining = buffer;
  while (true) {
    const idx = remaining.indexOf("\n\n");
    if (idx === -1) break;

    const block = remaining.slice(0, idx);
    remaining = remaining.slice(idx + 2);

    const event: SSEEvent = {};
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) continue; // comment (keepalive)
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const field = line.slice(0, colonIdx);
      const value = line.slice(colonIdx + 1).trimStart();
      switch (field) {
        case "id":
          event.id = value;
          break;
        case "event":
          event.event = value;
          break;
        case "data":
          // Concatenate multiple data lines with newline
          event.data = event.data ? `${event.data}\n${value}` : value;
          break;
      }
    }

    if (event.data !== undefined || event.event !== undefined) {
      yield { event, remaining };
    }
  }
  // Return remaining unparsed buffer
  yield { event: {}, remaining };
}

// ---------------------------------------------------------------------------
// SSEClient
// ---------------------------------------------------------------------------

class SSEClient {
  private connections = new Map<string, SSEConnection>();
  private retryTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

  private get baseUrl(): string {
    const url = useXyzen.getState().backendUrl;
    if (!url || url === "") {
      if (typeof window !== "undefined") {
        return `${window.location.protocol}//${window.location.host}`;
      }
    }
    return url;
  }

  /**
   * Open an SSE connection to a topic's event stream.
   * If a connection already exists for this topic, it is closed first.
   */
  connect(topicId: string, callbacks: SSECallbacks): void {
    // Clean up existing connection for this topic
    this.disconnect(topicId);

    const controller = new AbortController();
    const conn: SSEConnection = {
      topicId,
      controller,
      lastEventId: null,
      retryCount: 0,
      callbacks,
    };
    this.connections.set(topicId, conn);
    this._startStream(conn);
  }

  /** Close the SSE connection for a topic. */
  disconnect(topicId: string): void {
    const conn = this.connections.get(topicId);
    if (conn) {
      conn.controller.abort();
      this.connections.delete(topicId);
    }
    const timeout = this.retryTimeouts.get(topicId);
    if (timeout) {
      clearTimeout(timeout);
      this.retryTimeouts.delete(topicId);
    }
  }

  /** Close all SSE connections. */
  disconnectAll(): void {
    for (const topicId of [...this.connections.keys()]) {
      this.disconnect(topicId);
    }
  }

  /** Get all topic IDs with active SSE connections. */
  getOpenTopicIds(): string[] {
    return [...this.connections.keys()];
  }

  /** Check if a connection exists for a topic. */
  hasConnection(topicId: string): boolean {
    return this.connections.has(topicId);
  }

  /** Update the callbacks for an existing connection (e.g., when switching primary). */
  updateCallbacks(topicId: string, callbacks: SSECallbacks): boolean {
    const conn = this.connections.get(topicId);
    if (!conn) return false;
    conn.callbacks = callbacks;
    return true;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private async _startStream(conn: SSEConnection): Promise<void> {
    const { topicId, controller, callbacks } = conn;
    const token = authService.getToken();

    if (!token) {
      callbacks.onStatusChange({
        connected: false,
        error: "Authentication required",
      });
      return;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "text/event-stream",
    };
    if (conn.lastEventId) {
      headers["Last-Event-ID"] = conn.lastEventId;
    }

    const url = `${this.baseUrl}/xyzen/api/v1/topics/${topicId}/events`;

    try {
      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 401) {
          authService.removeToken();
          callbacks.onStatusChange({
            connected: false,
            error: "Authentication failed",
          });
          logout();
          return;
        }
        throw new Error(`SSE HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error("SSE response has no body");
      }

      // Connected successfully
      conn.retryCount = 0;
      callbacks.onStatusChange({ connected: true });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });

        // Parse and dispatch events from buffer
        let lastRemaining = sseBuffer;
        for (const { event, remaining } of parseSSEChunk(sseBuffer)) {
          lastRemaining = remaining;
          if (event.data !== undefined) {
            // Update cursor for reconnect
            if (event.id) {
              conn.lastEventId = event.id;
            }

            // Parse and dispatch the event
            try {
              const parsed = JSON.parse(event.data);
              const eventType = event.event || parsed.type || "message";
              callbacks.onMessageEvent({
                type: eventType,
                data: parsed.data !== undefined ? parsed.data : parsed,
              });
            } catch {
              // Non-JSON data — skip
              console.warn("SSE: failed to parse event data", event.data);
            }
          }
        }
        sseBuffer = lastRemaining;
      }

      // Stream ended cleanly — server closed connection
      this._handleDisconnect(conn);
    } catch (err) {
      if (controller.signal.aborted) return; // intentional disconnect
      console.error(`SSE error for topic ${topicId}:`, err);
      this._handleDisconnect(conn);
    }
  }

  private _handleDisconnect(conn: SSEConnection): void {
    const { topicId, callbacks } = conn;

    // Check if this connection is still the active one
    if (this.connections.get(topicId) !== conn) return;

    callbacks.onStatusChange({ connected: false });

    if (conn.retryCount >= MAX_RETRIES) {
      callbacks.onStatusChange({
        connected: false,
        error: "Connection closed. Please refresh the page.",
      });
      this.connections.delete(topicId);
      return;
    }

    // Exponential backoff reconnect
    const delay = Math.min(
      BASE_RETRY_MS * Math.pow(2, conn.retryCount),
      MAX_RETRY_MS,
    );
    conn.retryCount++;

    // Create a new AbortController for the retry
    conn.controller = new AbortController();

    const timeout = setTimeout(() => {
      this.retryTimeouts.delete(topicId);
      // Only reconnect if this connection is still active
      if (this.connections.get(topicId) === conn) {
        this._startStream(conn);
      }
    }, delay);
    this.retryTimeouts.set(topicId, timeout);
  }
}

export const sseClient = new SSEClient();
export default sseClient;

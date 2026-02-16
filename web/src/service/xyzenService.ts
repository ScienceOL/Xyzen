import type { ChatEvent } from "@/types/chatEvents";
import type { Message } from "@/store/types";
import { authService } from "./authService";

interface StatusChangePayload {
  connected: boolean;
  error: string | null;
}

type ServiceCallback<T> = (payload: T) => void;
export type MessageEventCallback = (event: ChatEvent) => void;

const HEARTBEAT_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 5;

/** Per-topic connection state. */
interface ConnectionState {
  ws: WebSocket;
  sessionId: string;
  topicId: string;
  onMessage: ServiceCallback<Message>;
  onStatusChange: ServiceCallback<StatusChangePayload>;
  onMessageEvent: MessageEventCallback | null;
  onReconnect: (() => void) | null;
  retryCount: number;
  retryTimeout: ReturnType<typeof setTimeout> | null;
  heartbeatWatchdogId: ReturnType<typeof setTimeout> | null;
  wasDisconnected: boolean;
}

class XyzenService {
  /** All active WS connections, keyed by topicId. */
  private connections = new Map<string, ConnectionState>();

  /** The topic whose connection is used for sending messages. */
  private primaryTopicId: string | null = null;

  private backendUrl = "";

  public setBackendUrl(url: string) {
    this.backendUrl = url;
  }

  // ---------------------------------------------------------------------------
  // Public query helpers
  // ---------------------------------------------------------------------------

  /** Check if an open WS exists for the given topic. */
  public hasConnection(topicId: string): boolean {
    const conn = this.connections.get(topicId);
    return !!conn && conn.ws.readyState === WebSocket.OPEN;
  }

  /** Get the current primary topicId. */
  public getPrimaryTopicId(): string | null {
    return this.primaryTopicId;
  }

  // ---------------------------------------------------------------------------
  // Connect / set primary
  // ---------------------------------------------------------------------------

  /**
   * Promote an existing connection to primary (used when switching back to a
   * topic that already has a live WS). Updates callbacks so the chatSlice
   * event handler for the new connectToChannel closure is used.
   */
  public setPrimary(
    topicId: string,
    onMessage: ServiceCallback<Message>,
    onStatusChange: ServiceCallback<StatusChangePayload>,
    onMessageEvent?: MessageEventCallback,
    onReconnect?: () => void,
  ): boolean {
    const conn = this.connections.get(topicId);
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) return false;

    this.primaryTopicId = topicId;

    // Update callbacks to the new closure's handlers
    conn.onMessage = onMessage;
    conn.onStatusChange = onStatusChange;
    conn.onMessageEvent = onMessageEvent || null;
    conn.onReconnect = onReconnect || null;

    // Re-wire ws.onmessage to use updated callbacks
    conn.ws.onmessage = (event) => {
      this.handleWsMessage(conn, event);
    };

    return true;
  }

  /**
   * Open a new WS for the given session/topic. If a connection already exists
   * for this topic it is closed first.
   */
  public connect(
    sessionId: string,
    topicId: string,
    onMessage: ServiceCallback<Message>,
    onStatusChange: ServiceCallback<StatusChangePayload>,
    onMessageEvent?: MessageEventCallback,
    onReconnect?: () => void,
  ) {
    // Close any existing connection for this topic first
    this.closeConnection(topicId);

    this.primaryTopicId = topicId;

    const token = authService.getToken();
    if (!token) {
      console.error("XyzenService: No authentication token available");
      onStatusChange({ connected: false, error: "Authentication required" });
      return;
    }

    const wsUrl = `${this.backendUrl.replace(
      /^http(s?):\/\//,
      "ws$1://",
    )}/xyzen/ws/v1/chat/sessions/${sessionId}/topics/${topicId}?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(wsUrl);

    const conn: ConnectionState = {
      ws,
      sessionId,
      topicId,
      onMessage,
      onStatusChange,
      onMessageEvent: onMessageEvent || null,
      onReconnect: onReconnect || null,
      retryCount: 0,
      retryTimeout: null,
      heartbeatWatchdogId: null,
      wasDisconnected: false,
    };

    this.connections.set(topicId, conn);

    ws.onopen = () => {
      console.log(`XyzenService: WebSocket connected [${topicId}]`);
      const wasReconnect = conn.wasDisconnected;
      conn.wasDisconnected = false;
      conn.retryCount = 0;
      this.resetHeartbeat(conn);
      conn.onStatusChange({ connected: true, error: null });
      if (wasReconnect && conn.onReconnect) {
        conn.onReconnect();
      }
    };

    ws.onmessage = (event) => {
      this.handleWsMessage(conn, event);
    };

    ws.onclose = (event) => {
      this.clearHeartbeat(conn);
      console.log(
        `XyzenService: WebSocket disconnected [${topicId}] (code: ${event.code}, reason: ${event.reason})`,
      );
      this.handleDisconnect(conn, event.reason);
    };

    ws.onerror = (error) => {
      console.error(`XyzenService: WebSocket error [${topicId}]:`, error);
    };
  }

  // ---------------------------------------------------------------------------
  // Close helpers
  // ---------------------------------------------------------------------------

  /** Close a single topic's connection. */
  public closeConnection(topicId: string): void {
    const conn = this.connections.get(topicId);
    if (!conn) return;

    this.clearHeartbeat(conn);
    if (conn.retryTimeout) {
      clearTimeout(conn.retryTimeout);
      conn.retryTimeout = null;
    }
    conn.ws.onclose = null;
    conn.ws.onerror = null;
    conn.ws.onopen = null;
    conn.ws.onmessage = null;
    conn.ws.close();
    this.connections.delete(topicId);

    if (this.primaryTopicId === topicId) {
      this.primaryTopicId = null;
    }
  }

  /** Close ALL connections (used on logout / disconnectFromChannel). */
  public disconnect(): void {
    for (const [topicId] of this.connections) {
      this.closeConnection(topicId);
    }
    this.primaryTopicId = null;
  }

  /** Return all currently open topicIds. */
  public getOpenTopicIds(): string[] {
    const ids: string[] = [];
    for (const [topicId, conn] of this.connections) {
      if (conn.ws.readyState === WebSocket.OPEN) {
        ids.push(topicId);
      }
    }
    return ids;
  }

  // ---------------------------------------------------------------------------
  // Send helpers — operate on the primary connection
  // ---------------------------------------------------------------------------

  public sendMessage(message: string): boolean {
    return this.sendOnPrimary(JSON.stringify({ message }));
  }

  public sendStructuredMessage(data: Record<string, unknown>): boolean {
    return this.sendOnPrimary(JSON.stringify(data));
  }

  public sendAbort(): boolean {
    const ok = this.sendOnPrimary(JSON.stringify({ type: "abort" }));
    if (ok) console.log("XyzenService: Abort signal sent");
    return ok;
  }

  private sendOnPrimary(payload: string): boolean {
    if (!this.primaryTopicId) {
      console.error("XyzenService: No primary connection.");
      return false;
    }
    const conn = this.connections.get(this.primaryTopicId);
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) {
      console.error("XyzenService: Primary WebSocket is not connected.");
      return false;
    }
    try {
      conn.ws.send(payload);
      return true;
    } catch (e) {
      console.error("XyzenService: Failed to send:", e);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal: message handling
  // ---------------------------------------------------------------------------

  private handleWsMessage(
    conn: ConnectionState,
    event: globalThis.MessageEvent,
  ): void {
    this.resetHeartbeat(conn);

    try {
      const eventData = JSON.parse(event.data as string);

      // Handle server ping — reply with pong, don't propagate
      if (eventData.type === "ping") {
        if (conn.ws.readyState === WebSocket.OPEN) {
          conn.ws.send(JSON.stringify({ type: "pong" }));
        }
        return;
      }

      if (eventData.type && conn.onMessageEvent) {
        conn.onMessageEvent(eventData);
      } else {
        conn.onMessage?.(eventData);
      }
    } catch (error) {
      console.error(
        `XyzenService: Failed to parse message data [${conn.topicId}]:`,
        error,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Internal: heartbeat
  // ---------------------------------------------------------------------------

  private resetHeartbeat(conn: ConnectionState): void {
    this.clearHeartbeat(conn);
    conn.heartbeatWatchdogId = setTimeout(() => {
      console.warn(
        `XyzenService: Heartbeat timeout [${conn.topicId}], closing socket`,
      );
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.close(4001, "Heartbeat timeout");
      }
    }, HEARTBEAT_TIMEOUT_MS);
  }

  private clearHeartbeat(conn: ConnectionState): void {
    if (conn.heartbeatWatchdogId) {
      clearTimeout(conn.heartbeatWatchdogId);
      conn.heartbeatWatchdogId = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal: disconnect & retry
  // ---------------------------------------------------------------------------

  private handleDisconnect(conn: ConnectionState, reason?: string): void {
    conn.wasDisconnected = true;

    if (conn.retryCount < MAX_RETRIES) {
      const delay = Math.min(1000 * Math.pow(2, conn.retryCount), 10000);
      conn.retryCount++;
      console.log(
        `XyzenService: Reconnecting [${conn.topicId}] in ${delay}ms... (Attempt ${conn.retryCount}/${MAX_RETRIES})`,
      );

      conn.retryTimeout = setTimeout(() => {
        // Remove stale entry — reconnect will create a new one
        this.connections.delete(conn.topicId);
        const wasPrimary = this.primaryTopicId === conn.topicId;

        // Re-create the WebSocket. connect() will set primary again if we were primary.
        if (!wasPrimary) {
          // Non-primary reconnect: use internal helper to avoid changing primaryTopicId
          this.connectNonPrimary(conn);
        } else {
          this.connect(
            conn.sessionId,
            conn.topicId,
            conn.onMessage,
            conn.onStatusChange,
            conn.onMessageEvent || undefined,
            conn.onReconnect || undefined,
          );
        }
      }, delay);
    } else {
      console.error(
        `XyzenService: Max reconnect attempts reached [${conn.topicId}]. Giving up.`,
      );
      conn.onStatusChange({
        connected: false,
        error: reason || "Connection closed. Please refresh the page.",
      });
      this.connections.delete(conn.topicId);
      if (this.primaryTopicId === conn.topicId) {
        this.primaryTopicId = null;
      }
    }
  }

  /**
   * Reconnect a non-primary connection without altering primaryTopicId.
   */
  private connectNonPrimary(oldConn: ConnectionState): void {
    const {
      sessionId,
      topicId,
      onMessage,
      onStatusChange,
      onMessageEvent,
      onReconnect,
    } = oldConn;

    const token = authService.getToken();
    if (!token) return;

    const wsUrl = `${this.backendUrl.replace(
      /^http(s?):\/\//,
      "ws$1://",
    )}/xyzen/ws/v1/chat/sessions/${sessionId}/topics/${topicId}?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(wsUrl);
    const conn: ConnectionState = {
      ws,
      sessionId,
      topicId,
      onMessage,
      onStatusChange,
      onMessageEvent,
      onReconnect,
      retryCount: oldConn.retryCount,
      retryTimeout: null,
      heartbeatWatchdogId: null,
      wasDisconnected: true,
    };

    this.connections.set(topicId, conn);

    ws.onopen = () => {
      console.log(`XyzenService: WebSocket reconnected [${topicId}]`);
      conn.wasDisconnected = false;
      conn.retryCount = 0;
      this.resetHeartbeat(conn);
      conn.onStatusChange({ connected: true, error: null });
      conn.onReconnect?.();
    };
    ws.onmessage = (event) => this.handleWsMessage(conn, event);
    ws.onclose = (event) => {
      this.clearHeartbeat(conn);
      this.handleDisconnect(conn, event.reason);
    };
    ws.onerror = (error) => {
      console.error(`XyzenService: WebSocket error [${topicId}]:`, error);
    };
  }
}

// Export a singleton instance of the service
const xyzenService = new XyzenService();
export default xyzenService;

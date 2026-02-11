import type { Message } from "@/store/types";
import { authService } from "./authService";

interface StatusChangePayload {
  connected: boolean;
  error: string | null;
}

interface MessageEvent {
  type:
    | "message"
    | "processing"
    | "loading"
    | "streaming_start"
    | "streaming_chunk"
    | "streaming_end"
    | "message_saved"
    | "message_ack"
    | "tool_call_request"
    | "tool_call_response"
    | "insufficient_balance"
    | "error"
    | "topic_updated"
    | "thinking_start"
    | "thinking_chunk"
    | "thinking_end"
    // Agent execution events
    | "agent_start"
    | "agent_end"
    | "agent_error"
    | "phase_start"
    | "phase_end"
    | "node_start"
    | "node_end"
    | "subagent_start"
    | "subagent_end"
    | "progress_update"
    | "iteration_start"
    | "iteration_end"
    | "state_update"
    // Abort events
    | "stream_aborted"
    // Heartbeat
    | "ping";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Message | Record<string, any>;
}

type ServiceCallback<T> = (payload: T) => void;
type MessageEventCallback = (event: MessageEvent) => void;

const HEARTBEAT_TIMEOUT_MS = 45_000;

class XyzenService {
  private ws: WebSocket | null = null;
  private onMessageCallback: ServiceCallback<Message> | null = null;
  private onMessageEventCallback: MessageEventCallback | null = null;
  private onStatusChangeCallback: ServiceCallback<StatusChangePayload> | null =
    null;
  private onReconnectCallback: (() => void) | null = null;
  private backendUrl = "";

  // Retry logic state
  private retryCount = 0;
  private maxRetries = 5;
  private retryTimeout: NodeJS.Timeout | null = null;
  private lastSessionId: string | null = null;
  private lastTopicId: string | null = null;

  // Reconnect detection
  private wasDisconnected = false;

  // Heartbeat watchdog
  private heartbeatWatchdogId: ReturnType<typeof setTimeout> | null = null;

  public setBackendUrl(url: string) {
    this.backendUrl = url;
  }

  public connect(
    sessionId: string,
    topicId: string,
    onMessage: ServiceCallback<Message>,
    onStatusChange: ServiceCallback<StatusChangePayload>,
    onMessageEvent?: MessageEventCallback,
    onReconnect?: () => void,
  ) {
    // If a connection is already open for the same session/topic, do nothing
    if (
      this.ws &&
      this.ws.readyState === WebSocket.OPEN &&
      this.lastSessionId === sessionId &&
      this.lastTopicId === topicId
    ) {
      console.log("WebSocket is already connected.");
      return;
    }

    // Reset retry state if this is a new connection request (different session/topic)
    // or if we are forcing a new connection (e.g. manual reconnect)
    if (this.lastSessionId !== sessionId || this.lastTopicId !== topicId) {
      this.retryCount = 0;
    }

    // Clear any pending retry timer
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }

    // Store context
    this.lastSessionId = sessionId;
    this.lastTopicId = topicId;
    this.onMessageCallback = onMessage;
    this.onMessageEventCallback = onMessageEvent || null;
    this.onStatusChangeCallback = onStatusChange;
    this.onReconnectCallback = onReconnect || null;

    // Get authentication token
    const token = authService.getToken();
    if (!token) {
      console.error("XyzenService: No authentication token available");
      this.onStatusChangeCallback?.({
        connected: false,
        error: "Authentication required",
      });
      return;
    }

    // Close existing socket if any (to be safe)
    if (this.ws) {
      // Remove listeners to prevent triggering old handlers
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
    }

    // Build WebSocket URL with token as query parameter
    const wsUrl = `${this.backendUrl.replace(
      /^http(s?):\/\//,
      "ws$1://",
    )}/xyzen/ws/v1/chat/sessions/${sessionId}/topics/${topicId}?token=${encodeURIComponent(token)}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log("XyzenService: WebSocket connected");
      const wasReconnect = this.wasDisconnected;
      this.wasDisconnected = false;
      this.retryCount = 0;
      this.resetHeartbeatWatchdog();
      this.onStatusChangeCallback?.({ connected: true, error: null });
      if (wasReconnect && this.onReconnectCallback) {
        this.onReconnectCallback();
      }
    };

    this.ws.onmessage = (event) => {
      this.resetHeartbeatWatchdog();

      try {
        const eventData = JSON.parse(event.data);

        // Handle server ping — reply with pong, don't propagate
        if (eventData.type === "ping") {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: "pong" }));
          }
          return;
        }

        // Handle different message types
        if (eventData.type && this.onMessageEventCallback) {
          this.onMessageEventCallback(eventData);
        } else {
          // Legacy support - assume it's a direct message
          this.onMessageCallback?.(eventData);
        }
      } catch (error) {
        console.error("XyzenService: Failed to parse message data:", error);
      }
    };

    this.ws.onclose = (event) => {
      this.clearHeartbeatWatchdog();
      console.log(
        `XyzenService: WebSocket disconnected (code: ${event.code}, reason: ${event.reason})`,
      );
      this.handleDisconnect(event.reason);
    };

    this.ws.onerror = (error) => {
      console.error("XyzenService: WebSocket error:", error);
      // We rely on onclose to handle the actual disconnect/retry logic
      // to avoid double handling.
    };
  }

  private resetHeartbeatWatchdog() {
    this.clearHeartbeatWatchdog();
    this.heartbeatWatchdogId = setTimeout(() => {
      console.warn("XyzenService: Heartbeat timeout, closing socket");
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(4001, "Heartbeat timeout");
      }
    }, HEARTBEAT_TIMEOUT_MS);
  }

  private clearHeartbeatWatchdog() {
    if (this.heartbeatWatchdogId) {
      clearTimeout(this.heartbeatWatchdogId);
      this.heartbeatWatchdogId = null;
    }
  }

  private handleDisconnect(reason?: string) {
    this.wasDisconnected = true;

    // If we haven't reached max retries, try to reconnect
    if (this.retryCount < this.maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, this.retryCount), 10000);
      this.retryCount++;
      console.log(
        `XyzenService: Reconnecting in ${delay}ms... (Attempt ${this.retryCount}/${this.maxRetries})`,
      );

      this.retryTimeout = setTimeout(() => {
        // Ensure we still have the necessary context to reconnect
        if (
          this.lastSessionId &&
          this.lastTopicId &&
          this.onMessageCallback &&
          this.onStatusChangeCallback
        ) {
          this.connect(
            this.lastSessionId,
            this.lastTopicId,
            this.onMessageCallback,
            this.onStatusChangeCallback,
            this.onMessageEventCallback || undefined,
            this.onReconnectCallback || undefined,
          );
        }
      }, delay);
    } else {
      // Max retries reached, notify failure
      console.error("XyzenService: Max reconnect attempts reached. Giving up.");
      this.onStatusChangeCallback?.({
        connected: false,
        error: reason || "Connection closed. Please refresh the page.",
      });
    }
  }

  public sendMessage(message: string): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ message }));
        return true;
      } catch (e) {
        console.error("XyzenService: Failed to send message:", e);
        return false;
      }
    }
    console.error("XyzenService: WebSocket is not connected.");
    return false;
  }

  public sendStructuredMessage(data: Record<string, unknown>): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(data));
        return true;
      } catch (e) {
        console.error("XyzenService: Failed to send structured message:", e);
        return false;
      }
    }
    console.error("XyzenService: WebSocket is not connected.");
    return false;
  }

  public sendAbort(): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: "abort" }));
        console.log("XyzenService: Abort signal sent");
        return true;
      } catch (e) {
        console.error("XyzenService: Failed to send abort:", e);
        return false;
      }
    }
    console.error(
      "XyzenService: WebSocket is not connected, cannot send abort.",
    );
    return false;
  }

  public disconnect() {
    // Clear heartbeat watchdog
    this.clearHeartbeatWatchdog();

    // Clear retry timer
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }

    // Reset state
    this.retryCount = 0;
    this.wasDisconnected = false;
    this.lastSessionId = null;
    this.lastTopicId = null;

    // Close socket
    if (this.ws) {
      // Prevent automatic retry logic from firing
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onopen = null;
      this.ws.close();
      this.ws = null;
    }
  }
}

// Export a singleton instance of the service
const xyzenService = new XyzenService();
export default xyzenService;

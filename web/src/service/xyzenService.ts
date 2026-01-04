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
    | "tool_call_request"
    | "tool_call_response"
    | "insufficient_balance"
    | "error"
    | "topic_updated"
    | "thinking_start"
    | "thinking_chunk"
    | "thinking_end";
  data:
    | Message
    | {
        id: string;
        content?: string;
        error?: string;
        stream_id?: string;
        db_id?: string;
        created_at?: string;
        // Tool call fields
        name?: string;
        description?: string;
        arguments?: Record<string, unknown>;
        status?: string;
        timestamp?: number;
        toolCallId?: string;
        confirmed?: boolean;
        // Insufficient balance fields
        error_code?: string;
        message?: string;
        message_cn?: string;
        details?: Record<string, unknown>;
        action_required?: string;
      };
}

type ServiceCallback<T> = (payload: T) => void;
type MessageEventCallback = (event: MessageEvent) => void;

class XyzenService {
  private ws: WebSocket | null = null;
  private onMessageCallback: ServiceCallback<Message> | null = null;
  private onMessageEventCallback: MessageEventCallback | null = null;
  private onStatusChangeCallback: ServiceCallback<StatusChangePayload> | null =
    null;
  private backendUrl = "";

  // Retry logic state
  private retryCount = 0;
  private maxRetries = 5;
  private retryTimeout: NodeJS.Timeout | null = null;
  private lastSessionId: string | null = null;
  private lastTopicId: string | null = null;

  public setBackendUrl(url: string) {
    this.backendUrl = url;
  }

  public connect(
    sessionId: string,
    topicId: string,
    onMessage: ServiceCallback<Message>,
    onStatusChange: ServiceCallback<StatusChangePayload>,
    onMessageEvent?: MessageEventCallback,
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
      // Successful connection resets the retry counter
      this.retryCount = 0;
      this.onStatusChangeCallback?.({ connected: true, error: null });
    };

    this.ws.onmessage = (event) => {
      try {
        const eventData = JSON.parse(event.data);

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

  private handleDisconnect(reason?: string) {
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

  public sendMessage(message: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ message }));
    } else {
      console.error("XyzenService: WebSocket is not connected.");
    }
  }

  public sendStructuredMessage(data: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.error("XyzenService: WebSocket is not connected.");
    }
  }

  public disconnect() {
    // Clear retry timer
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }

    // Reset state
    this.retryCount = 0;
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

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
    | "topic_updated";
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
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log("WebSocket is already connected.");
      return;
    }

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

    // Build WebSocket URL with token as query parameter
    const wsUrl = `${this.backendUrl.replace(
      /^http(s?):\/\//,
      "ws$1://",
    )}/xyzen/ws/v1/chat/sessions/${sessionId}/topics/${topicId}?token=${encodeURIComponent(token)}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log("XyzenService: WebSocket connected");
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
      this.onStatusChangeCallback?.({
        connected: false,
        error: event.reason || "Connection closed.",
      });
    };

    this.ws.onerror = (error) => {
      console.error("XyzenService: WebSocket error:", error);
      this.onStatusChangeCallback?.({
        connected: false,
        error: "A connection error occurred.",
      });
    };
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
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Export a singleton instance of the service
const xyzenService = new XyzenService();
export default xyzenService;

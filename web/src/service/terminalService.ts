import { useXyzen } from "@/store";

/**
 * Terminal WebSocket service.
 *
 * Manages a single WebSocket connection to the backend terminal endpoint,
 * which bridges to a Runner's PTY session.
 *
 * Features:
 * - Session persistence: stores sessionId for reconnection
 * - Automatic reconnection with exponential backoff (1s→30s, jitter, max 10 attempts)
 * - Input buffering during disconnection (flushed on reconnect)
 * - Ping/pong latency measurement every 5 seconds
 */

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_MAX_ATTEMPTS = 10;
const PING_INTERVAL_MS = 5000;
const INPUT_BUFFER_MAX_BYTES = 10 * 1024; // 10KB
const INPUT_BUFFER_STALE_MS = 30_000;

export interface TerminalCallbacks {
  onOutput: (data: string) => void; // base64-encoded PTY output
  onExit: (exitCode: number) => void;
  onError: (message: string) => void;
  onOpen: () => void;
  onClose: () => void;
  onReconnecting?: (attempt: number, max: number) => void;
  onReconnected?: () => void;
  onLatency?: (ms: number) => void;
  onSessionCreated?: (sessionId: string) => void;
}

export class TerminalConnection {
  private ws: WebSocket | null = null;
  private callbacks: TerminalCallbacks;
  private closed = false;
  private backendUrl = "";
  private token = "";

  // Session persistence
  private sessionId: string | null = null;

  // Reconnection state
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private wasConnected = false; // true if we ever had a successful connection with a session

  // Input buffering
  private inputBuffer: string[] = [];
  private inputBufferSize = 0;
  private inputBufferTimestamp = 0;

  // Latency measurement
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pingSentAt = 0;

  constructor(callbacks: TerminalCallbacks) {
    this.callbacks = callbacks;
  }

  get currentSessionId(): string | null {
    return this.sessionId;
  }

  connect(backendUrl: string, token: string): void {
    this.backendUrl = backendUrl;
    this.token = token;
    this.closed = false;
    this.reconnectAttempt = 0;
    this._connect();
  }

  private _connect(): void {
    if (this.closed) return;

    const wsUrl = `${this.backendUrl.replace(/^http(s?):\/\//, "ws$1://")}/xyzen/ws/v1/terminal?token=${encodeURIComponent(this.token)}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;

      if (this.sessionId && this.wasConnected) {
        // Reconnecting — try to attach to existing session
        this.send({
          type: "attach",
          payload: { session_id: this.sessionId },
        });
      } else {
        this.callbacks.onOpen();
      }

      // Start ping/pong
      this._startPing();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "output":
            this.callbacks.onOutput(msg.payload?.data ?? "");
            break;
          case "exit":
            this.callbacks.onExit(msg.payload?.exit_code ?? -1);
            break;
          case "error":
            this.callbacks.onError(msg.payload?.message ?? "Unknown error");
            break;
          case "pong":
            if (this.pingSentAt > 0) {
              const latency = Date.now() - this.pingSentAt;
              this.pingSentAt = 0;
              this.callbacks.onLatency?.(latency);
            }
            break;
          case "created":
            // New session created — store session ID
            this.sessionId = msg.payload?.session_id ?? null;
            this.wasConnected = true;
            this.callbacks.onSessionCreated?.(this.sessionId ?? "");
            break;
          case "attached":
            // Successfully reattached to existing session
            this.callbacks.onReconnected?.();
            this._flushInputBuffer();
            break;
          case "attach_failed":
            // Session expired or invalid — fall back to new session via onOpen
            this.sessionId = null;
            this.wasConnected = false;
            this.callbacks.onOpen();
            break;
          default:
            break;
        }
      } catch {
        // Ignore parse errors
      }
    };

    this.ws.onclose = () => {
      this._stopPing();

      if (this.closed) {
        this.callbacks.onClose();
        return;
      }

      // Unintentional disconnect — try to reconnect if we had a session
      if (this.sessionId && this.wasConnected) {
        this._scheduleReconnect();
      } else {
        this.callbacks.onClose();
      }
    };

    this.ws.onerror = () => {
      // onerror is always followed by onclose, so we handle reconnection there
    };
  }

  createSession(
    command: string,
    args: string[],
    cols: number,
    rows: number,
  ): void {
    this.send({
      type: "create",
      payload: { command, args, cols, rows },
    });
  }

  sendInput(data: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: "input", payload: { data } });
    } else if (!this.closed && this.sessionId) {
      // Buffer input during disconnect
      const dataSize = new Blob([data]).size;
      if (this.inputBufferSize + dataSize <= INPUT_BUFFER_MAX_BYTES) {
        this.inputBuffer.push(data);
        this.inputBufferSize += dataSize;
        if (this.inputBuffer.length === 1) {
          this.inputBufferTimestamp = Date.now();
        }
      }
    }
  }

  resize(cols: number, rows: number): void {
    this.send({
      type: "resize",
      payload: { cols, rows },
    });
  }

  close(): void {
    this.closed = true;
    this._stopReconnect();
    this._stopPing();
    this.send({ type: "close" });
    this.sessionId = null;
    this.wasConnected = false;
    setTimeout(() => {
      this.ws?.close();
      this.ws = null;
    }, 500);
  }

  destroy(): void {
    this.closed = true;
    this._stopReconnect();
    this._stopPing();
    this.ws?.close();
    this.ws = null;
    // Don't clear sessionId on destroy — allow reattach if modal reopens
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get isReconnecting(): boolean {
    return this.reconnectTimer !== null;
  }

  // --- Private helpers ---

  private send(msg: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private _scheduleReconnect(): void {
    if (this.closed) return;
    if (this.reconnectAttempt >= RECONNECT_MAX_ATTEMPTS) {
      this.sessionId = null;
      this.wasConnected = false;
      this.callbacks.onClose();
      return;
    }

    this.reconnectAttempt++;
    // Exponential backoff with jitter
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt - 1) +
        Math.random() * 1000,
      RECONNECT_MAX_MS,
    );

    this.callbacks.onReconnecting?.(
      this.reconnectAttempt,
      RECONNECT_MAX_ATTEMPTS,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._connect();
    }, delay);
  }

  private _stopReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private _startPing(): void {
    this._stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.pingSentAt = Date.now();
        this.send({ type: "ping" });
      }
    }, PING_INTERVAL_MS);
  }

  private _stopPing(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private _flushInputBuffer(): void {
    // Discard stale buffer
    if (
      this.inputBuffer.length > 0 &&
      Date.now() - this.inputBufferTimestamp > INPUT_BUFFER_STALE_MS
    ) {
      this.inputBuffer = [];
      this.inputBufferSize = 0;
      return;
    }

    for (const data of this.inputBuffer) {
      this.send({ type: "input", payload: { data } });
    }
    this.inputBuffer = [];
    this.inputBufferSize = 0;
  }
}

/**
 * Create a terminal connection using the current store state for backendUrl and token.
 */
export function createTerminalConnection(
  callbacks: TerminalCallbacks,
): TerminalConnection | null {
  const state = useXyzen.getState();
  const backendUrl = state.backendUrl;
  const token = state.token;

  if (!backendUrl || !token) {
    return null;
  }

  const conn = new TerminalConnection(callbacks);
  conn.connect(backendUrl, token);
  return conn;
}

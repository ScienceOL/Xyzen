import { SheetModal } from "@/components/animate-ui/components/animate/sheet-modal";
import { LocalEchoController } from "@/core/terminal/localEcho";
import {
  createTerminalConnection,
  type TerminalConnection,
} from "@/service/terminalService";
import { useXyzen } from "@/store";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { TerminalToolbar } from "./TerminalToolbar";

type Status =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error"
  | "reconnecting";

// --- Theme definitions ---

const DARK_THEME = {
  background: "#1a1a2e",
  foreground: "#e0e0e0",
  cursor: "#e0e0e0",
  selectionBackground: "#44475a",
  black: "#21222c",
  red: "#ff5555",
  green: "#50fa7b",
  yellow: "#f1fa8c",
  blue: "#bd93f9",
  magenta: "#ff79c6",
  cyan: "#8be9fd",
  white: "#f8f8f2",
  brightBlack: "#6272a4",
  brightRed: "#ff6e6e",
  brightGreen: "#69ff94",
  brightYellow: "#ffffa5",
  brightBlue: "#d6acff",
  brightMagenta: "#ff92df",
  brightCyan: "#a4ffff",
  brightWhite: "#ffffff",
};

const LIGHT_THEME = {
  background: "#fafafa",
  foreground: "#383a42",
  cursor: "#383a42",
  selectionBackground: "#d0d0d0",
  black: "#383a42",
  red: "#e45649",
  green: "#50a14f",
  yellow: "#c18401",
  blue: "#4078f2",
  magenta: "#a626a4",
  cyan: "#0184bc",
  white: "#fafafa",
  brightBlack: "#a0a1a7",
  brightRed: "#e06c75",
  brightGreen: "#98c379",
  brightYellow: "#e5c07b",
  brightBlue: "#61afef",
  brightMagenta: "#c678dd",
  brightCyan: "#56b6c2",
  brightWhite: "#ffffff",
};

function isDarkMode(): boolean {
  return document.documentElement.classList.contains("dark");
}

export function TerminalModal() {
  const { t } = useTranslation();
  const {
    isTerminalOpen,
    closeTerminal,
    terminalCommand,
    terminalArgs,
    runners,
    setTerminalSessionId,
    setTerminalLatency,
  } = useXyzen(
    useShallow((s) => ({
      isTerminalOpen: s.isTerminalOpen,
      closeTerminal: s.closeTerminal,
      terminalCommand: s.terminalCommand,
      terminalArgs: s.terminalArgs,
      runners: s.runners,
      setTerminalSessionId: s.setTerminalSessionId,
      setTerminalLatency: s.setTerminalLatency,
    })),
  );

  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const connRef = useRef<TerminalConnection | null>(null);
  const localEchoRef = useRef<LocalEchoController | null>(null);
  const [status, setStatus] = useState<Status>("disconnected");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [reconnectInfo, setReconnectInfo] = useState<{
    attempt: number;
    max: number;
  } | null>(null);

  // Check if any runner is online
  const hasOnlineRunner = runners.some((r) => r.is_online && r.is_active);

  const cleanup = useCallback(() => {
    connRef.current?.destroy();
    connRef.current = null;
    localEchoRef.current = null;
    xtermRef.current?.dispose();
    xtermRef.current = null;
    fitAddonRef.current = null;
    setStatus("disconnected");
    setErrorMsg(null);
    setLatencyMs(0);
    setReconnectInfo(null);
  }, []);

  const handleClose = useCallback(() => {
    // Intentional close — tell server to kill the PTY
    connRef.current?.close();
    connRef.current = null;
    localEchoRef.current = null;
    xtermRef.current?.dispose();
    xtermRef.current = null;
    fitAddonRef.current = null;
    setStatus("disconnected");
    setErrorMsg(null);
    setLatencyMs(0);
    setReconnectInfo(null);
    setTerminalSessionId(null);
    closeTerminal();
  }, [closeTerminal, setTerminalSessionId]);

  // Initialize xterm and connect when modal opens
  useEffect(() => {
    if (!isTerminalOpen || !termRef.current) return;

    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      if (!termRef.current) return;

      const dark = isDarkMode();

      // Create xterm instance
      const xterm = new XTerm({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
        theme: dark ? DARK_THEME : LIGHT_THEME,
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();
      xterm.loadAddon(fitAddon);
      xterm.loadAddon(webLinksAddon);

      // Load WebGL renderer (fallback to canvas on error)
      void (async () => {
        try {
          const { WebglAddon } = await import("@xterm/addon-webgl");
          const webgl = new WebglAddon();
          webgl.onContextLoss(() => webgl.dispose());
          xterm.loadAddon(webgl);
        } catch {
          // Fallback to canvas renderer
        }
      })();

      // Load Unicode11 addon
      void (async () => {
        try {
          const { Unicode11Addon } = await import("@xterm/addon-unicode11");
          const unicode11 = new Unicode11Addon();
          xterm.loadAddon(unicode11);
          xterm.unicode.activeVersion = "11";
        } catch {
          // Ignore
        }
      })();

      xterm.open(termRef.current);
      fitAddon.fit();

      xtermRef.current = xterm;
      fitAddonRef.current = fitAddon;

      // Local echo controller
      const localEcho = new LocalEchoController(xterm);
      localEchoRef.current = localEcho;

      // Connect to backend
      setStatus("connecting");
      setErrorMsg(null);

      const conn = createTerminalConnection({
        onOutput: (data: string) => {
          try {
            const bin = atob(data);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) {
              bytes[i] = bin.charCodeAt(i);
            }
            // Reconcile local echo predictions
            const output = localEcho.handleOutput(bytes);
            if (output.length > 0) {
              xterm.write(output);
            }
          } catch {
            xterm.write(data);
          }
        },
        onExit: (exitCode: number) => {
          localEcho.clear();
          xterm.writeln(
            `\r\n\x1b[33m[Process exited with code ${exitCode}]\x1b[0m`,
          );
          setStatus("disconnected");
        },
        onError: (message: string) => {
          localEcho.clear();
          xterm.writeln(`\r\n\x1b[31m[Error: ${message}]\x1b[0m`);
          setErrorMsg(message);
          setStatus("error");
        },
        onOpen: () => {
          setStatus("connected");
          setReconnectInfo(null);

          // Create PTY session
          const cols = xterm.cols;
          const rows = xterm.rows;
          conn?.createSession(
            terminalCommand || "",
            terminalArgs || [],
            cols,
            rows,
          );
        },
        onClose: () => {
          localEcho.clear();
          xterm.writeln("\r\n\x1b[33m[Connection closed]\x1b[0m");
          setStatus("disconnected");
          setReconnectInfo(null);
        },
        onReconnecting: (attempt: number, max: number) => {
          setStatus("reconnecting");
          setReconnectInfo({ attempt, max });
        },
        onReconnected: () => {
          setStatus("connected");
          setReconnectInfo(null);
        },
        onLatency: (ms: number) => {
          setLatencyMs(ms);
          setTerminalLatency(ms);
        },
        onSessionCreated: (sessionId: string) => {
          setTerminalSessionId(sessionId);
        },
      });

      if (!conn) {
        setErrorMsg("Failed to create connection - check authentication");
        setStatus("error");
        return;
      }

      connRef.current = conn;

      // Forward terminal input to WebSocket with local echo
      xterm.onData((data: string) => {
        // Try local echo prediction
        localEcho.handleInput(data);

        // Encode string -> UTF-8 bytes -> base64 (btoa only handles Latin-1)
        const encoder = new TextEncoder();
        const bytes = encoder.encode(data);
        let bin = "";
        for (let i = 0; i < bytes.length; i++) {
          bin += String.fromCharCode(bytes[i]);
        }
        conn.sendInput(btoa(bin));
      });

      // Handle resize
      const resizeObserver = new ResizeObserver(() => {
        if (fitAddonRef.current && xtermRef.current) {
          fitAddonRef.current.fit();
          const cols = xtermRef.current.cols;
          const rows = xtermRef.current.rows;
          connRef.current?.resize(cols, rows);
        }
      });

      if (termRef.current) {
        resizeObserver.observe(termRef.current);
      }

      // Watch for dark/light mode changes
      const observer = new MutationObserver(() => {
        const nowDark = isDarkMode();
        if (xtermRef.current) {
          xtermRef.current.options.theme = nowDark ? DARK_THEME : LIGHT_THEME;
        }
      });
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });

      return () => {
        resizeObserver.disconnect();
        observer.disconnect();
      };
    }, 100);

    return () => {
      clearTimeout(timer);
      cleanup();
    };
  }, [
    isTerminalOpen,
    terminalCommand,
    terminalArgs,
    cleanup,
    setTerminalLatency,
    setTerminalSessionId,
  ]);

  const statusColor =
    status === "connected"
      ? "text-green-500"
      : status === "connecting" || status === "reconnecting"
        ? "text-amber-500"
        : status === "error"
          ? "text-red-500"
          : "text-neutral-400";

  const statusLabel =
    status === "connected"
      ? t("terminal.status.connected")
      : status === "connecting"
        ? t("terminal.status.connecting")
        : status === "reconnecting"
          ? t("terminal.status.reconnecting")
          : status === "error"
            ? t("terminal.status.error")
            : t("terminal.status.disconnected");

  // Latency badge color
  const latencyColor =
    latencyMs < 100
      ? "text-green-500"
      : latencyMs < 300
        ? "text-amber-500"
        : "text-red-500";

  const dark = isDarkMode();
  const terminalBg = dark ? DARK_THEME.background : LIGHT_THEME.background;

  return (
    <SheetModal isOpen={isTerminalOpen} onClose={handleClose} size="xl">
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200/60 px-5 pb-3 pt-5 dark:border-neutral-800/60">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
              {t("terminal.title")}
            </h2>
            <div className="flex items-center gap-1.5">
              <div
                className={`h-2 w-2 rounded-full ${
                  status === "connected"
                    ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.4)]"
                    : status === "connecting" || status === "reconnecting"
                      ? "animate-pulse bg-amber-500"
                      : status === "error"
                        ? "bg-red-500"
                        : "bg-neutral-300 dark:bg-neutral-600"
                }`}
              />
              <span className={`text-xs ${statusColor}`}>{statusLabel}</span>
            </div>
            {/* Latency badge */}
            {status === "connected" && latencyMs > 0 && (
              <span
                className={`rounded bg-neutral-100/60 px-1.5 py-0.5 text-[11px] font-medium tabular-nums dark:bg-white/[0.04] ${latencyColor}`}
              >
                {latencyMs}ms
              </span>
            )}
          </div>
          {terminalCommand && (
            <span className="rounded bg-neutral-100/60 px-2 py-0.5 text-xs text-neutral-500 dark:bg-white/[0.04] dark:text-neutral-400">
              {terminalCommand} {terminalArgs.join(" ")}
            </span>
          )}
        </div>

        {/* Terminal area */}
        <div
          className="relative flex flex-1 flex-col overflow-hidden"
          style={{ backgroundColor: terminalBg }}
        >
          {!hasOnlineRunner && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-900/80 backdrop-blur-sm">
              <div className="text-center">
                <p className="text-[13px] text-neutral-300">
                  {t("terminal.noRunner")}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  {t("terminal.noRunnerHint")}
                </p>
              </div>
            </div>
          )}
          {errorMsg && status === "error" && (
            <div className="absolute left-0 right-0 top-0 z-10 bg-red-50/90 px-4 py-2 text-xs text-red-600 dark:bg-red-950/60 dark:text-red-400">
              {errorMsg}
            </div>
          )}
          {/* Reconnecting overlay */}
          {status === "reconnecting" && reconnectInfo && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-900/60 backdrop-blur-[2px]">
              <div className="text-center">
                <div className="mx-auto mb-3 h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                <p className="text-[13px] font-medium text-amber-400">
                  {t("terminal.reconnecting.title")}
                </p>
                <p className="mt-1 text-xs text-neutral-400">
                  {t("terminal.reconnecting.attempt", {
                    current: reconnectInfo.attempt,
                    max: reconnectInfo.max,
                  })}
                </p>
              </div>
            </div>
          )}
          <div ref={termRef} className="min-h-0 flex-1 p-2" />
          <TerminalToolbar xtermRef={xtermRef} />
        </div>
      </div>
    </SheetModal>
  );
}

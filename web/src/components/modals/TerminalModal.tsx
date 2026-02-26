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
import { AnimatePresence, motion } from "framer-motion";
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

// --- StatusDot sub-component ---

const dotSpring = { type: "spring" as const, stiffness: 500, damping: 30 };

const DOT_VARIANTS: Record<
  Status,
  { bg: string; shadow?: string; animate?: object }
> = {
  connected: {
    bg: "bg-green-500",
    shadow: "0 0 6px rgba(34,197,94,0.4)",
  },
  connecting: { bg: "bg-amber-500" },
  reconnecting: { bg: "bg-amber-500" },
  error: { bg: "bg-red-500" },
  disconnected: { bg: "bg-neutral-300 dark:bg-neutral-600" },
};

function StatusDot({ status }: { status: Status }) {
  const v = DOT_VARIANTS[status];
  const isPulsing = status === "connecting" || status === "reconnecting";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status}
        className={`h-2 w-2 rounded-full ${v.bg}`}
        initial={{ scale: 0, opacity: 0 }}
        animate={{
          scale: isPulsing ? [1, 1.3, 1] : 1,
          opacity: 1,
          boxShadow: v.shadow ?? "none",
        }}
        exit={{ scale: 0, opacity: 0 }}
        transition={
          isPulsing
            ? {
                scale: { repeat: Infinity, duration: 1.2 },
                opacity: { duration: 0.15 },
              }
            : { ...dotSpring, opacity: { duration: 0.15 } }
        }
      />
    </AnimatePresence>
  );
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
              <StatusDot status={status} />
              <AnimatePresence mode="wait">
                <motion.span
                  key={status}
                  className={`text-xs ${statusColor}`}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 4 }}
                  transition={{ duration: 0.15 }}
                >
                  {statusLabel}
                </motion.span>
              </AnimatePresence>
            </div>
            {/* Latency badge */}
            <AnimatePresence>
              {status === "connected" && latencyMs > 0 && (
                <motion.span
                  className={`rounded bg-neutral-100/60 px-1.5 py-0.5 text-[11px] font-medium tabular-nums dark:bg-white/[0.04] ${latencyColor}`}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                >
                  {latencyMs}ms
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          {/* Command badge */}
          <AnimatePresence>
            {terminalCommand && (
              <motion.span
                className="rounded bg-neutral-100/60 px-2 py-0.5 text-xs text-neutral-500 dark:bg-white/[0.04] dark:text-neutral-400"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.15 }}
              >
                {terminalCommand} {terminalArgs.join(" ")}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Terminal area */}
        <div
          className="relative flex flex-1 flex-col overflow-hidden rounded-b-lg"
          style={{ backgroundColor: terminalBg }}
        >
          {/* No runner overlay */}
          <AnimatePresence>
            {!hasOnlineRunner && (
              <motion.div
                className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-900/80 backdrop-blur-md"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <motion.div
                  className="text-center"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ delay: 0.05, duration: 0.2 }}
                >
                  <p className="text-[13px] text-neutral-300">
                    {t("terminal.noRunner")}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {t("terminal.noRunnerHint")}
                  </p>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error banner */}
          <AnimatePresence>
            {errorMsg && status === "error" && (
              <motion.div
                className="absolute left-0 right-0 top-0 z-10 bg-red-50/90 px-4 py-2 text-xs text-red-600 backdrop-blur-sm dark:bg-red-950/60 dark:text-red-400"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
              >
                {errorMsg}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Reconnecting overlay */}
          <AnimatePresence>
            {status === "reconnecting" && reconnectInfo && (
              <motion.div
                className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-900/60 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="text-center">
                  <motion.div
                    className="mx-auto mb-3 h-5 w-5 rounded-full border-2 border-amber-500 border-t-transparent"
                    animate={{ rotate: 360 }}
                    transition={{
                      repeat: Infinity,
                      duration: 0.8,
                      ease: "linear",
                    }}
                  />
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
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={termRef} className="min-h-0 flex-1 p-2" />
          <TerminalToolbar xtermRef={xtermRef} />
        </div>
      </div>
    </SheetModal>
  );
}

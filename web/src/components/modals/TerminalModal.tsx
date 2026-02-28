import { SheetModal } from "@/components/animate-ui/components/animate/sheet-modal";
import { LocalEchoController } from "@/core/terminal/localEcho";
import {
  createAndConnect,
  detachConnection,
  getConnection,
  registerConnection,
  unregisterConnection,
  type TerminalConnection,
} from "@/service/terminalService";
import { useXyzen } from "@/store";
import type { TerminalSessionStatus } from "@/store/slices/terminalSlice";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { AnimatePresence, motion } from "framer-motion";
import { TerminalToolbar } from "./TerminalToolbar";
import { TerminalSessionList } from "./TerminalSessionList";
import { PlusIcon } from "@heroicons/react/24/outline";

type DisplayStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "detached"
  | "error"
  | "reconnecting"
  | "exited";

// --- Theme definitions ---

// Transparent black background so the frosted glass container shows through
const TERMINAL_BG = "rgba(0, 0, 0, 0)";

const DARK_THEME = {
  background: TERMINAL_BG,
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
  background: TERMINAL_BG,
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

type DotColor = "green" | "red" | "amber";

function statusToDotColor(
  status: DisplayStatus | TerminalSessionStatus,
): DotColor {
  switch (status) {
    case "connected":
      return "green";
    case "connecting":
    case "reconnecting":
    case "detached":
      return "amber";
    default: // error, exited, disconnected
      return "red";
  }
}

const DOT_COLORS: Record<DotColor, { bg: string; shadow?: string }> = {
  green: { bg: "bg-green-500", shadow: "0 0 6px rgba(34,197,94,0.4)" },
  amber: { bg: "bg-amber-500" },
  red: { bg: "bg-red-500" },
};

function StatusDot({
  status,
  className = "h-2 w-2",
}: {
  status: DisplayStatus | TerminalSessionStatus;
  className?: string;
}) {
  const color = statusToDotColor(status);
  const v = DOT_COLORS[color];
  const isPulsing = color === "amber";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={color}
        className={`rounded-full ${className} ${v.bg}`}
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

// --- Session Tab chip ---

function SessionTab({
  id,
  label,
  status,
  isActive,
  onClick,
}: {
  id: string;
  label: string;
  status: TerminalSessionStatus;
  isActive: boolean;
  onClick: (id: string) => void;
}) {
  return (
    <motion.button
      type="button"
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
        isActive
          ? "bg-indigo-500/10 text-indigo-600 ring-1 ring-indigo-500/30 dark:text-indigo-400"
          : "bg-neutral-100/60 text-neutral-500 hover:bg-neutral-200/60 dark:bg-white/[0.04] dark:text-neutral-400 dark:hover:bg-white/[0.06]"
      }`}
      whileTap={{ scale: 0.95 }}
      onClick={() => onClick(id)}
    >
      <StatusDot status={status} className="h-1.5 w-1.5" />
      <span className="max-w-[80px] truncate">{label}</span>
    </motion.button>
  );
}

export function TerminalModal() {
  const { t } = useTranslation();
  const {
    isTerminalOpen,
    closeTerminalModal,
    activeSessionId,
    terminalSessions,
    runners,
    addSession,
    updateSession,
    removeSession,
    setActiveSession,
  } = useXyzen(
    useShallow((s) => ({
      isTerminalOpen: s.isTerminalOpen,
      closeTerminalModal: s.closeTerminalModal,
      activeSessionId: s.activeSessionId,
      terminalSessions: s.terminalSessions,
      runners: s.runners,
      addSession: s.addSession,
      updateSession: s.updateSession,
      removeSession: s.removeSession,
      setActiveSession: s.setActiveSession,
    })),
  );

  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const connRef = useRef<TerminalConnection | null>(null);
  const localEchoRef = useRef<LocalEchoController | null>(null);
  const cleanupObserversRef = useRef<(() => void) | null>(null);
  const [displayStatus, setDisplayStatus] =
    useState<DisplayStatus>("disconnected");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [reconnectInfo, setReconnectInfo] = useState<{
    attempt: number;
    max: number;
  } | null>(null);

  // Show session list when user clicks "New Session" without a pending command
  const [showSessionList, setShowSessionList] = useState(false);

  // Check if any runner is online
  const hasOnlineRunner = runners.some((r) => r.is_online && r.is_active);

  const sessions = Object.values(terminalSessions);

  // --- xterm helpers ---

  const disposeXterm = useCallback(() => {
    cleanupObserversRef.current?.();
    cleanupObserversRef.current = null;
    localEchoRef.current = null;
    xtermRef.current?.dispose();
    xtermRef.current = null;
    fitAddonRef.current = null;
  }, []);

  const createXterm = useCallback(
    (container: HTMLElement): { xterm: XTerm; fitAddon: FitAddon } => {
      const dark = isDarkMode();

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

      // Load WebGL renderer on non-touch devices only
      const isTouchDevice =
        "ontouchstart" in window || navigator.maxTouchPoints > 0;
      if (!isTouchDevice) {
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
      }

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

      xterm.open(container);
      fitAddon.fit();

      xtermRef.current = xterm;
      fitAddonRef.current = fitAddon;

      const localEcho = new LocalEchoController(xterm);
      localEchoRef.current = localEcho;

      // ResizeObserver
      const resizeObserver = new ResizeObserver(() => {
        if (fitAddonRef.current && xtermRef.current) {
          fitAddonRef.current.fit();
          const cols = xtermRef.current.cols;
          const rows = xtermRef.current.rows;
          connRef.current?.resize(cols, rows);
        }
      });
      resizeObserver.observe(container);

      // Dark mode observer
      const mutObserver = new MutationObserver(() => {
        const nowDark = isDarkMode();
        if (xtermRef.current) {
          xtermRef.current.options.theme = nowDark ? DARK_THEME : LIGHT_THEME;
        }
      });
      mutObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });

      cleanupObserversRef.current = () => {
        resizeObserver.disconnect();
        mutObserver.disconnect();
      };

      return { xterm, fitAddon };
    },
    [],
  );

  // --- Connection helpers ---

  const makeCallbacks = useCallback(
    (sessionId?: string) => ({
      onOutput: (data: string) => {
        try {
          const bin = atob(data);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) {
            bytes[i] = bin.charCodeAt(i);
          }
          const output = localEchoRef.current?.handleOutput(bytes) ?? bytes;
          if (output.length > 0) {
            xtermRef.current?.write(output);
          }
        } catch {
          xtermRef.current?.write(data);
        }
      },
      onExit: (exitCode: number) => {
        localEchoRef.current?.clear();
        xtermRef.current?.writeln(
          `\r\n\x1b[33m[Process exited with code ${exitCode}]\x1b[0m`,
        );
        setDisplayStatus("exited");
        const sid = sessionId ?? connRef.current?.currentSessionId;
        if (sid) {
          updateSession(sid, { status: "exited", exitCode });
          unregisterConnection(sid);
        }
      },
      onError: (message: string) => {
        localEchoRef.current?.clear();
        xtermRef.current?.writeln(`\r\n\x1b[31m[Error: ${message}]\x1b[0m`);
        setErrorMsg(message);
        setDisplayStatus("error");
        const sid = sessionId ?? connRef.current?.currentSessionId;
        if (sid) {
          updateSession(sid, { status: "error", errorMsg: message });
        }
      },
      onOpen: () => {
        // WS connected, no session yet — create new session
        setDisplayStatus("connected");
        setReconnectInfo(null);

        const xterm = xtermRef.current;
        const conn = connRef.current;
        if (!xterm || !conn) return;

        const state = useXyzen.getState();
        const cmd = state.pendingCommand || "";
        const args = state.pendingArgs || [];
        conn.createSession(cmd, args, xterm.cols, xterm.rows);

        // Clear pending
        useXyzen.setState({ pendingCommand: "", pendingArgs: [] });
      },
      onClose: () => {
        localEchoRef.current?.clear();
        xtermRef.current?.writeln("\r\n\x1b[33m[Connection closed]\x1b[0m");
        setDisplayStatus("disconnected");
        setReconnectInfo(null);
      },
      onReconnecting: (attempt: number, max: number) => {
        setDisplayStatus("reconnecting");
        setReconnectInfo({ attempt, max });
        const sid = sessionId ?? connRef.current?.currentSessionId;
        if (sid) {
          updateSession(sid, { status: "reconnecting" });
        }
      },
      onReconnected: () => {
        setDisplayStatus("connected");
        setReconnectInfo(null);
        const sid = sessionId ?? connRef.current?.currentSessionId;
        if (sid) {
          updateSession(sid, { status: "connected" });
        }
      },
      onLatency: (ms: number) => {
        setLatencyMs(ms);
        const sid = sessionId ?? connRef.current?.currentSessionId;
        if (sid) {
          updateSession(sid, { latencyMs: ms });
        }
      },
      onSessionCreated: (newSessionId: string) => {
        const state = useXyzen.getState();
        addSession({
          id: newSessionId,
          command: state.pendingCommand || "",
          args: state.pendingArgs || [],
          status: "connected",
          createdAt: Date.now(),
          latencyMs: 0,
        });
        registerConnection(newSessionId, connRef.current!);
        setDisplayStatus("connected");
      },
      onAttached: (attachedId: string) => {
        setDisplayStatus("connected");
        setReconnectInfo(null);
        updateSession(attachedId, { status: "connected" });
        // Force resize → SIGWINCH so the shell redraws its prompt
        const xterm = xtermRef.current;
        if (xterm && connRef.current) {
          connRef.current.resize(xterm.cols, xterm.rows);
        }
      },
      onAttachFailed: (failedId: string) => {
        xtermRef.current?.writeln(
          "\r\n\x1b[33m[Session expired — removed]\x1b[0m",
        );
        removeSession(failedId);
        unregisterConnection(failedId);
        setDisplayStatus("disconnected");
        // Show session list so user can pick another or create new
        setShowSessionList(true);
        setActiveSession(null);
      },
    }),
    [addSession, updateSession, removeSession, setActiveSession],
  );

  const wireXtermInput = useCallback(
    (xterm: XTerm, conn: TerminalConnection) => {
      xterm.onData((data: string) => {
        localEchoRef.current?.handleInput(data);
        const encoder = new TextEncoder();
        const bytes = encoder.encode(data);
        let bin = "";
        for (let i = 0; i < bytes.length; i++) {
          bin += String.fromCharCode(bytes[i]);
        }
        conn.sendInput(btoa(bin));
      });
    },
    [],
  );

  // --- Connect to a new session ---

  const connectNewSession = useCallback(() => {
    if (!termRef.current) return;

    disposeXterm();
    setDisplayStatus("connecting");
    setErrorMsg(null);
    setLatencyMs(0);
    setReconnectInfo(null);
    setShowSessionList(false);

    const { xterm } = createXterm(termRef.current);

    const conn = createAndConnect(makeCallbacks());
    if (!conn) {
      setErrorMsg("Failed to create connection - check authentication");
      setDisplayStatus("error");
      return;
    }

    connRef.current = conn;
    wireXtermInput(xterm, conn);
  }, [createXterm, disposeXterm, makeCallbacks, wireXtermInput]);

  // --- Attach to existing session ---

  const attachToSession = useCallback(
    (sessionId: string) => {
      if (!termRef.current) return;

      // Detach current connection if any
      const currentActive = useXyzen.getState().activeSessionId;
      if (currentActive && currentActive !== sessionId) {
        detachConnection(currentActive);
        updateSession(currentActive, { status: "detached" });
      }

      disposeXterm();
      setActiveSession(sessionId);
      setDisplayStatus("connecting");
      setErrorMsg(null);
      setLatencyMs(0);
      setReconnectInfo(null);
      setShowSessionList(false);

      const { xterm } = createXterm(termRef.current);

      const conn = createAndConnect(makeCallbacks(sessionId));
      if (!conn) {
        setErrorMsg("Failed to create connection - check authentication");
        setDisplayStatus("error");
        return;
      }

      connRef.current = conn;
      registerConnection(sessionId, conn);

      // Once WS is open, the onOpen callback will fire — but we want attach, not create.
      // Override: send attach after WS opens
      const origOnOpen = conn["callbacks"].onOpen;
      conn["callbacks"].onOpen = () => {
        // Don't create a new session — attach to existing
        setDisplayStatus("connected");
        setReconnectInfo(null);
        conn.attachSession(sessionId);
        // Restore original for future reconnects
        conn["callbacks"].onOpen = origOnOpen;
      };

      wireXtermInput(xterm, conn);
    },
    [
      createXterm,
      disposeXterm,
      makeCallbacks,
      wireXtermInput,
      setActiveSession,
      updateSession,
    ],
  );

  // --- Modal open/close lifecycle ---

  useEffect(() => {
    if (!isTerminalOpen) return;

    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      if (!termRef.current) return;

      const state = useXyzen.getState();

      if (state.pendingCommand || state.pendingArgs.length > 0) {
        // Have a pending command → create new session
        connectNewSession();
      } else if (
        state.activeSessionId &&
        state.terminalSessions[state.activeSessionId]
      ) {
        const session = state.terminalSessions[state.activeSessionId];
        if (
          session.status === "detached" ||
          session.status === "connected" ||
          session.status === "connecting"
        ) {
          // Reattach to existing session
          attachToSession(state.activeSessionId);
        } else {
          // Session in terminal state (exited/error) — show list
          setShowSessionList(true);
        }
      } else if (Object.keys(state.terminalSessions).length > 0) {
        // No active session but have sessions — show list
        setShowSessionList(true);
      } else {
        // No sessions at all — create new default session
        connectNewSession();
      }
    }, 100);

    return () => {
      clearTimeout(timer);
    };
    // Only trigger on modal open — don't re-trigger on session changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTerminalOpen]);

  // --- Handle modal close ---

  const handleClose = useCallback(() => {
    // Detach current session (don't kill)
    const state = useXyzen.getState();
    const currentId = state.activeSessionId;
    if (currentId && getConnection(currentId)) {
      detachConnection(currentId);
      updateSession(currentId, { status: "detached" });
    } else if (connRef.current) {
      // Connection exists but not in pool (e.g. session not yet created)
      connRef.current.destroy();
      connRef.current = null;
    }

    disposeXterm();
    setDisplayStatus("disconnected");
    setErrorMsg(null);
    setLatencyMs(0);
    setReconnectInfo(null);
    setShowSessionList(false);
    closeTerminalModal();
  }, [closeTerminalModal, disposeXterm, updateSession]);

  // --- Session tab switch ---

  const handleTabClick = useCallback(
    (id: string) => {
      if (id === activeSessionId) return;
      attachToSession(id);
    },
    [activeSessionId, attachToSession],
  );

  // --- New session from session list ---

  const handleNewSession = useCallback(() => {
    // Open without pending command — will launch default shell
    useXyzen.setState({ pendingCommand: "", pendingArgs: [] });
    connectNewSession();
  }, [connectNewSession]);

  // --- Handle attach from session list ---

  const handleAttachFromList = useCallback(
    (id: string) => {
      attachToSession(id);
    },
    [attachToSession],
  );

  // --- Derived display values ---

  // Latency badge color
  const latencyColor =
    latencyMs < 100
      ? "text-green-500"
      : latencyMs < 300
        ? "text-amber-500"
        : "text-red-500";

  const showXterm = activeSessionId && !showSessionList;

  return (
    <SheetModal isOpen={isTerminalOpen} onClose={handleClose} size="xl">
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200/60 px-5 pb-3 pt-5 dark:border-neutral-800/60">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
              {t("terminal.title")}
            </h2>
            {/* Latency badge — visible when active session is connected */}
            <AnimatePresence>
              {showXterm && displayStatus === "connected" && latencyMs > 0 && (
                <motion.span
                  className={`rounded bg-neutral-100/60 px-1.5 py-0.5 text-[11px] font-medium tabular-nums dark:bg-white/[0.04] ${latencyColor}`}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{
                    type: "spring",
                    stiffness: 500,
                    damping: 30,
                  }}
                >
                  {latencyMs}ms
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          {/* Session tabs + new session button */}
          <div className="flex items-center gap-1.5">
            {sessions.map((s) => (
              <SessionTab
                key={s.id}
                id={s.id}
                label={s.command || "Shell"}
                status={s.status}
                isActive={s.id === activeSessionId && !showSessionList}
                onClick={handleTabClick}
              />
            ))}
            <motion.button
              type="button"
              className="rounded-lg bg-neutral-100/60 p-1.5 text-neutral-400 transition-colors hover:bg-neutral-200/60 dark:bg-white/[0.04] dark:hover:bg-white/[0.06]"
              whileTap={{ scale: 0.92 }}
              onClick={handleNewSession}
              title={t("terminal.sessions.new")}
            >
              <PlusIcon className="h-3.5 w-3.5" />
            </motion.button>
          </div>
        </div>

        {/* Content area */}
        <div className="relative min-h-0 flex-1 overflow-hidden bg-black/90 backdrop-blur-md">
          {/* Session list overlay — shown when no active xterm */}
          {!showXterm && (
            <div className="absolute inset-0 z-20">
              <TerminalSessionList
                onAttach={handleAttachFromList}
                onNewSession={handleNewSession}
              />
            </div>
          )}

          {/* No runner overlay */}
          <AnimatePresence>
            {!hasOnlineRunner && showXterm && (
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
            {errorMsg && displayStatus === "error" && showXterm && (
              <motion.div
                className="absolute left-0 right-0 top-0 z-10 bg-red-50/90 px-4 py-2 text-xs text-red-600 backdrop-blur-sm dark:bg-red-950/60 dark:text-red-400"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 25,
                }}
              >
                {errorMsg}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Reconnecting overlay */}
          <AnimatePresence>
            {displayStatus === "reconnecting" && reconnectInfo && showXterm && (
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

          <div ref={termRef} className="h-full w-full p-2" />
        </div>
        {showXterm && <TerminalToolbar xtermRef={xtermRef} />}
      </div>
    </SheetModal>
  );
}

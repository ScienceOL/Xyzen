import type { StateCreator } from "zustand";
import type { XyzenState } from "../types";

export type TerminalSessionStatus =
  | "connecting"
  | "connected"
  | "detached"
  | "reconnecting"
  | "error"
  | "exited";

export interface TerminalSession {
  id: string; // Backend session_id ("pty_xxx")
  command: string;
  args: string[];
  status: TerminalSessionStatus;
  createdAt: number;
  exitCode?: number;
  errorMsg?: string;
  latencyMs: number;
}

export interface TerminalSlice {
  isTerminalOpen: boolean;
  activeSessionId: string | null;
  terminalSessions: Record<string, TerminalSession>;
  pendingCommand: string;
  pendingArgs: string[];

  openTerminal: (command?: string, args?: string[]) => void;
  closeTerminalModal: () => void;
  addSession: (session: TerminalSession) => void;
  updateSession: (id: string, patch: Partial<TerminalSession>) => void;
  removeSession: (id: string) => void;
  setActiveSession: (id: string | null) => void;
}

export const createTerminalSlice: StateCreator<
  XyzenState,
  [["zustand/immer", never]],
  [],
  TerminalSlice
> = (set) => ({
  isTerminalOpen: false,
  activeSessionId: null,
  terminalSessions: {},
  pendingCommand: "",
  pendingArgs: [],

  openTerminal: (command = "", args: string[] = []) => {
    set((state) => {
      state.isTerminalOpen = true;
      state.pendingCommand = command;
      state.pendingArgs = args;
    });
  },

  closeTerminalModal: () => {
    set((state) => {
      state.isTerminalOpen = false;
      // Don't touch sessions — they remain for reattach
    });
  },

  addSession: (session: TerminalSession) => {
    set((state) => {
      state.terminalSessions[session.id] = session;
      state.activeSessionId = session.id;
    });
  },

  updateSession: (id: string, patch: Partial<TerminalSession>) => {
    set((state) => {
      const session = state.terminalSessions[id];
      if (session) {
        Object.assign(session, patch);
      }
    });
  },

  removeSession: (id: string) => {
    set((state) => {
      delete state.terminalSessions[id];
      if (state.activeSessionId === id) {
        const remaining = Object.keys(state.terminalSessions);
        state.activeSessionId = remaining.length > 0 ? remaining[0] : null;
      }
    });
  },

  setActiveSession: (id: string | null) => {
    set({ activeSessionId: id });
  },
});

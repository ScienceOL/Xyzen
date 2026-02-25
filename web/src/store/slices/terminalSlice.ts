import type { StateCreator } from "zustand";
import type { XyzenState } from "../types";

export interface TerminalSlice {
  isTerminalOpen: boolean;
  terminalCommand: string;
  terminalArgs: string[];
  terminalSessionId: string | null;
  terminalLatencyMs: number;
  openTerminal: (command?: string, args?: string[]) => void;
  closeTerminal: () => void;
  setTerminalSessionId: (sessionId: string | null) => void;
  setTerminalLatency: (ms: number) => void;
}

export const createTerminalSlice: StateCreator<
  XyzenState,
  [["zustand/immer", never]],
  [],
  TerminalSlice
> = (set) => ({
  isTerminalOpen: false,
  terminalCommand: "",
  terminalArgs: [],
  terminalSessionId: null,
  terminalLatencyMs: 0,

  openTerminal: (command = "", args: string[] = []) => {
    set({
      isTerminalOpen: true,
      terminalCommand: command,
      terminalArgs: args,
    });
  },

  closeTerminal: () => {
    set({
      isTerminalOpen: false,
      terminalCommand: "",
      terminalArgs: [],
    });
  },

  setTerminalSessionId: (sessionId: string | null) => {
    set({ terminalSessionId: sessionId });
  },

  setTerminalLatency: (ms: number) => {
    set({ terminalLatencyMs: ms });
  },
});

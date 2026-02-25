import { runnerService, type RunnerRead } from "@/service/runnerService";
import type { StateCreator } from "zustand";
import type { XyzenState } from "../types";

export interface RunnerSlice {
  runners: RunnerRead[];
  runnersLoading: boolean;
  fetchRunners: () => Promise<void>;
  createRunnerToken: (
    name: string,
  ) => Promise<{ token: string; connect_command: string } | null>;
  deleteRunner: (id: string) => Promise<void>;
  updateRunner: (
    id: string,
    data: { name?: string; is_active?: boolean },
  ) => Promise<void>;
}

export const createRunnerSlice: StateCreator<
  XyzenState,
  [["zustand/immer", never]],
  [],
  RunnerSlice
> = (set) => ({
  runners: [],
  runnersLoading: false,

  fetchRunners: async () => {
    set({ runnersLoading: true });
    try {
      const runners = await runnerService.listRunners();
      set({ runners, runnersLoading: false });
    } catch {
      set({ runnersLoading: false });
    }
  },

  createRunnerToken: async (name: string) => {
    try {
      const result = await runnerService.createRunnerToken(name);
      set((state) => {
        state.runners.unshift(result.runner);
      });
      return { token: result.token, connect_command: result.connect_command };
    } catch {
      return null;
    }
  },

  deleteRunner: async (id: string) => {
    try {
      await runnerService.deleteRunner(id);
      set((state) => {
        state.runners = state.runners.filter((r) => r.id !== id);
      });
    } catch {
      // ignore
    }
  },

  updateRunner: async (
    id: string,
    data: { name?: string; is_active?: boolean },
  ) => {
    try {
      const updated = await runnerService.updateRunner(id, data);
      set((state) => {
        const idx = state.runners.findIndex((r) => r.id === id);
        if (idx >= 0) {
          state.runners[idx] = updated;
        }
      });
    } catch {
      // ignore
    }
  },
});

import type { StateCreator } from "zustand";
import type { User, XyzenState } from "../../types";

export interface AuthSlice {
  user: User | null;
  token: string | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setStatus: (status: "idle" | "loading" | "succeeded" | "failed") => void;
}

export const createAuthSlice: StateCreator<
  XyzenState,
  [["zustand/immer", never]],
  [],
  AuthSlice
> = (set) => ({
  user: null,
  token: null,
  status: "idle",
  setUser: (user) => set({ user }),
  setToken: (token) => set({ token }),
  setStatus: (status) => set({ status }),
});

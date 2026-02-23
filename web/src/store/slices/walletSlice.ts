import { redemptionService } from "@/service/redemptionService";
import { userEventService } from "@/service/userEventService";
import type { StateCreator } from "zustand";
import type { XyzenState } from "../types";

export interface WalletBalance {
  free: number;
  paid: number;
  earned: number;
  total: number;
}

export interface WalletSlice {
  walletBalance: WalletBalance | null;
  walletLoading: boolean;
  fetchWallet: () => Promise<void>;
  connectWalletEvents: () => () => void;
  _handleCreditUpdated: (data: Record<string, unknown>) => void;
}

export const createWalletSlice: StateCreator<
  XyzenState,
  [["zustand/immer", never]],
  [],
  WalletSlice
> = (set) => ({
  walletBalance: null,
  walletLoading: false,

  fetchWallet: async () => {
    set({ walletLoading: true });
    try {
      const wallet = await redemptionService.getUserWallet();
      set({
        walletBalance: {
          free: wallet.free_balance,
          paid: wallet.paid_balance,
          earned: wallet.earned_balance,
          total: wallet.virtual_balance,
        },
        walletLoading: false,
      });
    } catch {
      set({ walletLoading: false });
    }
  },

  connectWalletEvents: () => {
    userEventService.connect();
    const unsub = userEventService.on("credit_updated", (event) => {
      const data = event.data;
      set({
        walletBalance: {
          free: (data.free_balance as number) ?? 0,
          paid: (data.paid_balance as number) ?? 0,
          earned: (data.earned_balance as number) ?? 0,
          total: (data.virtual_balance as number) ?? 0,
        },
      });
    });
    return () => {
      unsub();
      userEventService.disconnect();
    };
  },

  _handleCreditUpdated: (data) => {
    set({
      walletBalance: {
        free: (data.free_balance as number) ?? 0,
        paid: (data.paid_balance as number) ?? 0,
        earned: (data.earned_balance as number) ?? 0,
        total: (data.virtual_balance as number) ?? 0,
      },
    });
  },
});

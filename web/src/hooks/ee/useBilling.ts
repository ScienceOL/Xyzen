import { hasFeature } from "@/core/edition/edition";
import { useAuth } from "@/hooks/useAuth";
import { useXyzen } from "@/store";
import type { WalletBalance } from "@/store/slices/walletSlice";

export function useBilling(): {
  balance: WalletBalance;
  points: number | null;
  isLoading: boolean;
} | null {
  const auth = useAuth();
  const enabled =
    (auth.isAuthenticated || !!auth.token) && hasFeature("billing");
  const walletBalance = useXyzen((s) => s.walletBalance);
  const walletLoading = useXyzen((s) => s.walletLoading);

  if (!enabled) return null;
  return {
    balance: walletBalance ?? { free: 0, paid: 0, earned: 0, total: 0 },
    points: walletBalance?.total ?? null,
    isLoading: walletLoading,
  };
}

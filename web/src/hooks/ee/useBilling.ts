import { hasFeature } from "@/core/edition/edition";
import { useAuth } from "@/hooks/useAuth";
import { useUserWallet } from "@/hooks/useUserWallet";

export function useBilling() {
  const auth = useAuth();
  const enabled =
    (auth.isAuthenticated || !!auth.token) && hasFeature("billing");
  const wallet = useUserWallet(auth.token, enabled);

  if (!enabled) return null;
  return { wallet, points: wallet.data?.virtual_balance ?? null };
}

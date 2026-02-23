import { useAuth } from "@/hooks/useAuth";
import { hasFeature } from "@/core/edition/edition";
import { useXyzen } from "@/store";
import { useEffect } from "react";

/**
 * Bootstrap hook that connects the wallet WebSocket and performs
 * an initial HTTP fetch when the user is authenticated and billing is enabled.
 *
 * Call from root App.tsx.
 */
export function useWalletSync(): void {
  const auth = useAuth();
  const enabled =
    (auth.isAuthenticated || !!auth.token) && hasFeature("billing");

  const fetchWallet = useXyzen((s) => s.fetchWallet);
  const connectWalletEvents = useXyzen((s) => s.connectWalletEvents);

  useEffect(() => {
    if (!enabled) return;

    // Initial HTTP fetch
    fetchWallet();

    // Connect WebSocket for real-time updates
    const cleanup = connectWalletEvents();
    return cleanup;
  }, [enabled, fetchWallet, connectWalletEvents]);
}

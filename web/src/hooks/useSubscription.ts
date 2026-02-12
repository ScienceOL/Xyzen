import { subscriptionService } from "@/service/subscriptionService";
import { useQuery } from "@tanstack/react-query";

export function useSubscription(token: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["subscription", token],
    queryFn: () => subscriptionService.getSubscription(),
    enabled: enabled && !!token,
    staleTime: 60_000,
  });
}

export function useSubscriptionUsage(token: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["subscription-usage", token],
    queryFn: () => subscriptionService.getUsage(),
    enabled: enabled && !!token,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

import { queryKeys } from "@/hooks/queries/queryKeys";
import { subscriptionService } from "@/service/subscriptionService";
import { useQuery } from "@tanstack/react-query";

export function usePlanCatalog() {
  return useQuery({
    queryKey: queryKeys.subscription.catalog(),
    queryFn: () => subscriptionService.getCatalog(),
    staleTime: 5 * 60_000,
  });
}

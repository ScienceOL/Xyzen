import { redemptionService } from "@/service/redemptionService";
import { useQuery } from "@tanstack/react-query";

export function useUserWallet(token: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["userWallet", token],
    queryFn: async () => redemptionService.getUserWallet(),
    enabled: enabled && !!token,
    staleTime: 30_000,
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { developerService } from "@/service/developerService";

export const developerKeys = {
  all: ["developer"] as const,
  wallet: () => [...developerKeys.all, "wallet"] as const,
  earnings: (params?: { marketplace_id?: string }) =>
    [...developerKeys.all, "earnings", params] as const,
  earningsSummary: () => [...developerKeys.all, "earnings-summary"] as const,
  rewardRates: () => [...developerKeys.all, "reward-rates"] as const,
  listingEarnings: (id: string) =>
    [...developerKeys.all, "listing-earnings", id] as const,
};

export function useDeveloperWallet() {
  return useQuery({
    queryKey: developerKeys.wallet(),
    queryFn: () => developerService.getWallet(),
    staleTime: 2 * 60 * 1000,
  });
}

export function useDeveloperEarnings(params?: {
  marketplace_id?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: developerKeys.earnings(params),
    queryFn: () => developerService.getEarnings(params),
    staleTime: 2 * 60 * 1000,
  });
}

export function useDeveloperEarningsSummary() {
  return useQuery({
    queryKey: developerKeys.earningsSummary(),
    queryFn: () => developerService.getEarningsSummary(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useRewardRates() {
  return useQuery({
    queryKey: developerKeys.rewardRates(),
    queryFn: () => developerService.getRewardRates(),
    staleTime: 30 * 60 * 1000,
  });
}

export function useListingEarnings(marketplaceId: string | undefined) {
  return useQuery({
    queryKey: developerKeys.listingEarnings(marketplaceId ?? ""),
    queryFn: () => developerService.getListingEarnings(marketplaceId!),
    enabled: !!marketplaceId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useWithdrawEarnings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (amount: number) => developerService.withdraw(amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: developerKeys.wallet() });
      queryClient.invalidateQueries({ queryKey: ["redemption"] });
    },
  });
}

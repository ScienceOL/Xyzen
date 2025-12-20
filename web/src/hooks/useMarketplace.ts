import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { marketplaceService } from "@/service/marketplaceService";
import type {
  ForkRequest,
  ForkResponse,
  LikeResponse,
  MarketplaceListingWithSnapshot,
  PublishRequest,
  PublishResponse,
  SearchParams,
} from "@/service/marketplaceService";

/**
 * Query key factory for marketplace queries
 */
export const marketplaceKeys = {
  all: ["marketplace"] as const,
  listings: () => [...marketplaceKeys.all, "listings"] as const,
  listingsWithParams: (params: SearchParams) =>
    [...marketplaceKeys.listings(), params] as const,
  listing: (id: string) => [...marketplaceKeys.all, "listing", id] as const,
  requirements: (id: string) =>
    [...marketplaceKeys.all, "requirements", id] as const,
  myListings: () => [...marketplaceKeys.all, "my-listings"] as const,
};

/**
 * Hook to search marketplace listings
 */
export function useMarketplaceListings(params: SearchParams = {}) {
  return useQuery({
    queryKey: marketplaceKeys.listingsWithParams(params),
    queryFn: async () => {
      try {
        return await marketplaceService.searchListings(params);
      } catch (error) {
        console.error("Failed to fetch marketplace listings:", error);
        return []; // Return empty array on error to show empty state
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  });
}

/**
 * Hook to get a single marketplace listing with snapshot
 */
export function useMarketplaceListing(marketplaceId: string | undefined) {
  return useQuery({
    queryKey: marketplaceId
      ? marketplaceKeys.listing(marketplaceId)
      : ["marketplace", "listing", "undefined"],
    queryFn: () =>
      marketplaceId
        ? marketplaceService.getListing(marketplaceId)
        : Promise.reject(new Error("No marketplace ID provided")),
    enabled: !!marketplaceId,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

/**
 * Hook to get requirements for a marketplace listing
 */
export function useMarketplaceRequirements(marketplaceId: string | undefined) {
  return useQuery({
    queryKey: marketplaceId
      ? marketplaceKeys.requirements(marketplaceId)
      : ["marketplace", "requirements", "undefined"],
    queryFn: () =>
      marketplaceId
        ? marketplaceService.getRequirements(marketplaceId)
        : Promise.reject(new Error("No marketplace ID provided")),
    enabled: !!marketplaceId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to get current user's marketplace listings
 */
export function useMyMarketplaceListings() {
  return useQuery({
    queryKey: marketplaceKeys.myListings(),
    queryFn: () => marketplaceService.getMyListings(),
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

/**
 * Hook to publish an agent to marketplace
 */
export function usePublishAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: PublishRequest) =>
      marketplaceService.publishAgent(request),
    onSuccess: (_data: PublishResponse) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: marketplaceKeys.all });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

/**
 * Hook to unpublish a marketplace listing
 */
export function useUnpublishAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (marketplaceId: string) =>
      marketplaceService.unpublishAgent(marketplaceId),
    onSuccess: () => {
      // Invalidate all marketplace queries
      queryClient.invalidateQueries({ queryKey: marketplaceKeys.all });
    },
  });
}

/**
 * Hook to fork an agent from marketplace
 */
export function useForkAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      marketplaceId,
      request,
    }: {
      marketplaceId: string;
      request?: ForkRequest;
    }) => marketplaceService.forkAgent(marketplaceId, request),
    onSuccess: (_data: ForkResponse, variables) => {
      // Invalidate agents list (new agent was created)
      queryClient.invalidateQueries({ queryKey: ["agents"] });

      // Invalidate the marketplace listing (fork count updated)
      queryClient.invalidateQueries({
        queryKey: marketplaceKeys.listing(variables.marketplaceId),
      });

      // Invalidate all listings (fork count changed)
      queryClient.invalidateQueries({
        queryKey: marketplaceKeys.listings(),
      });
    },
  });
}

/**
 * Hook to toggle like on a marketplace listing
 */
export function useToggleLike() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (marketplaceId: string) =>
      marketplaceService.toggleLike(marketplaceId),
    onMutate: async (marketplaceId: string) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: marketplaceKeys.listing(marketplaceId),
      });

      // Snapshot the previous value
      const previousListing =
        queryClient.getQueryData<MarketplaceListingWithSnapshot>(
          marketplaceKeys.listing(marketplaceId),
        );

      // Optimistically update the cache
      if (previousListing) {
        queryClient.setQueryData<MarketplaceListingWithSnapshot>(
          marketplaceKeys.listing(marketplaceId),
          {
            ...previousListing,
            has_liked: !previousListing.has_liked,
            likes_count: previousListing.has_liked
              ? previousListing.likes_count - 1
              : previousListing.likes_count + 1,
          },
        );
      }

      // Return context with previous value
      return { previousListing };
    },
    onError: (_err, marketplaceId, context) => {
      // Rollback on error
      if (context?.previousListing) {
        queryClient.setQueryData(
          marketplaceKeys.listing(marketplaceId),
          context.previousListing,
        );
      }
    },
    onSuccess: (data: LikeResponse, marketplaceId) => {
      // Update with actual server response
      const currentListing =
        queryClient.getQueryData<MarketplaceListingWithSnapshot>(
          marketplaceKeys.listing(marketplaceId),
        );

      if (currentListing) {
        queryClient.setQueryData<MarketplaceListingWithSnapshot>(
          marketplaceKeys.listing(marketplaceId),
          {
            ...currentListing,
            has_liked: data.is_liked,
            likes_count: data.likes_count,
          },
        );
      }

      // Invalidate listings to update counts
      queryClient.invalidateQueries({
        queryKey: marketplaceKeys.listings(),
      });
    },
  });
}

/**
 * Hook to prefetch a marketplace listing
 */
export function usePrefetchMarketplaceListing() {
  const queryClient = useQueryClient();

  return (marketplaceId: string) => {
    queryClient.prefetchQuery({
      queryKey: marketplaceKeys.listing(marketplaceId),
      queryFn: () => marketplaceService.getListing(marketplaceId),
      staleTime: 1000 * 60 * 2, // 2 minutes
    });
  };
}

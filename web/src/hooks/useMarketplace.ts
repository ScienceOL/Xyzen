import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { marketplaceService } from "@/service/marketplaceService";
import type {
  ForkRequest,
  ForkResponse,
  LikeResponse,
  MarketplaceListing,
  MarketplaceListingWithSnapshot,
  PublishRequest,
  PublishResponse,
  SearchParams,
  UpdateAgentRequest,
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
  starredListings: () => [...marketplaceKeys.all, "starred"] as const,
  history: (id: string) => [...marketplaceKeys.all, "history", id] as const,
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
 * Hook to get starred marketplace listings
 */
export function useStarredListings() {
  return useQuery({
    queryKey: marketplaceKeys.starredListings(),
    queryFn: async () => {
      const listings = await marketplaceService.getStarredListings();
      // Starred listings are by definition liked, so ensure has_liked is true
      return listings.map((listing) => ({
        ...listing,
        has_liked: true,
      }));
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to get version history of a marketplace listing
 */
export function useListingHistory(marketplaceId: string | undefined) {
  return useQuery({
    queryKey: marketplaceId
      ? marketplaceKeys.history(marketplaceId)
      : ["marketplace", "history", "undefined"],
    queryFn: () =>
      marketplaceId
        ? marketplaceService.getListingHistory(marketplaceId)
        : Promise.reject(new Error("No marketplace ID provided")),
    enabled: !!marketplaceId,
    staleTime: 1000 * 60 * 5, // 5 minutes
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
 * Hook to publish a specific version
 */
export function usePublishVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      marketplaceId,
      version,
    }: {
      marketplaceId: string;
      version: number;
    }) => marketplaceService.publishVersion(marketplaceId, version),
    onSuccess: (_data, variables) => {
      // Invalidate listing and history
      queryClient.invalidateQueries({
        queryKey: marketplaceKeys.listing(variables.marketplaceId),
      });
      queryClient.invalidateQueries({
        queryKey: marketplaceKeys.history(variables.marketplaceId),
      });
    },
  });
}

/**
 * Hook to update agent and publish
 */
export function useUpdateAgentAndPublish() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      marketplaceId,
      request,
    }: {
      marketplaceId: string;
      request: UpdateAgentRequest;
    }) => marketplaceService.updateAgentAndPublish(marketplaceId, request),
    onSuccess: (_data, variables) => {
      // Invalidate listing and history
      queryClient.invalidateQueries({
        queryKey: marketplaceKeys.listing(variables.marketplaceId),
      });
      queryClient.invalidateQueries({
        queryKey: marketplaceKeys.history(variables.marketplaceId),
      });
      queryClient.invalidateQueries({
        queryKey: marketplaceKeys.listings(),
      });
    },
  });
}

/**
 * Hook to pull listing update
 */
export function usePullListingUpdate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (agentId: string) =>
      marketplaceService.pullListingUpdate(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

/**
 * Hook to toggle like on a marketplace listing
 */
// ... existing imports

export function useToggleLike() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (marketplaceId: string) =>
      marketplaceService.toggleLike(marketplaceId),
    onMutate: async (marketplaceId: string) => {
      // 1. Cancel relevant queries
      await queryClient.cancelQueries({
        queryKey: marketplaceKeys.listing(marketplaceId),
      });
      await queryClient.cancelQueries({
        queryKey: marketplaceKeys.all, // Broadly cancel to catch lists
      });

      // 2. Snapshot previous values
      const previousListing =
        queryClient.getQueryData<MarketplaceListingWithSnapshot>(
          marketplaceKeys.listing(marketplaceId),
        );

      // Snapshot list queries
      // We find all queries that look like listing lists
      const previousListQueries = queryClient.getQueriesData<
        MarketplaceListing[]
      >({
        queryKey: marketplaceKeys.listings(),
      });

      // Snapshot starred listings
      const previousStarredListings = queryClient.getQueryData<
        MarketplaceListing[]
      >(marketplaceKeys.starredListings());

      // 3. Optimistic Update - Single Listing
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

      // 4. Optimistic Update - Lists
      previousListQueries.forEach(([queryKey, oldData]) => {
        if (!oldData) return;

        queryClient.setQueryData(
          queryKey,
          oldData.map((listing) => {
            if (listing.id === marketplaceId) {
              return {
                ...listing,
                has_liked: !listing.has_liked,
                likes_count: listing.has_liked
                  ? listing.likes_count - 1
                  : listing.likes_count + 1,
              };
            }
            return listing;
          }),
        );
      });

      // 5. Optimistic Update - Starred Listings
      if (previousStarredListings) {
        const targetListing = previousStarredListings.find(
          (l) => l.id === marketplaceId,
        );
        if (targetListing && targetListing.has_liked) {
          // If unliking, remove from starred list
          queryClient.setQueryData<MarketplaceListing[]>(
            marketplaceKeys.starredListings(),
            previousStarredListings.filter((l) => l.id !== marketplaceId),
          );
        } else if (targetListing) {
          // If liking, update the like status
          queryClient.setQueryData<MarketplaceListing[]>(
            marketplaceKeys.starredListings(),
            previousStarredListings.map((l) =>
              l.id === marketplaceId
                ? {
                    ...l,
                    has_liked: true,
                    likes_count: l.likes_count + 1,
                  }
                : l,
            ),
          );
        }
      }

      // Return context
      return { previousListing, previousListQueries, previousStarredListings };
    },
    onError: (_err, marketplaceId, context) => {
      // Rollback
      if (context?.previousListing) {
        queryClient.setQueryData(
          marketplaceKeys.listing(marketplaceId),
          context.previousListing,
        );
      }
      if (context?.previousListQueries) {
        context.previousListQueries.forEach(([queryKey, oldData]) => {
          queryClient.setQueryData(queryKey, oldData);
        });
      }
      // Rollback starred listings
      if (context?.previousStarredListings) {
        queryClient.setQueryData(
          marketplaceKeys.starredListings(),
          context.previousStarredListings,
        );
      }
    },
    onSuccess: (data: LikeResponse, marketplaceId) => {
      // Update Single Listing
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

      // Update Lists (to ensure consistency without full refetch if possible)
      // This prevents the UI from flickering back to old state if invalidation is slow
      const listQueries = queryClient.getQueriesData<MarketplaceListing[]>({
        queryKey: marketplaceKeys.listings(),
      });

      listQueries.forEach(([queryKey, oldData]) => {
        if (!oldData) return;
        queryClient.setQueryData(
          queryKey,
          oldData.map((listing) => {
            if (listing.id === marketplaceId) {
              return {
                ...listing,
                has_liked: data.is_liked,
                likes_count: data.likes_count,
              };
            }
            return listing;
          }),
        );
      });

      // Update starred listings
      const starredListings = queryClient.getQueryData<MarketplaceListing[]>(
        marketplaceKeys.starredListings(),
      );
      if (starredListings) {
        if (data.is_liked) {
          // Update like status if agent is in starred list
          queryClient.setQueryData<MarketplaceListing[]>(
            marketplaceKeys.starredListings(),
            starredListings.map((listing) =>
              listing.id === marketplaceId
                ? {
                    ...listing,
                    has_liked: data.is_liked,
                    likes_count: data.likes_count,
                  }
                : listing,
            ),
          );
        } else {
          // Remove from starred list if unliked
          queryClient.setQueryData<MarketplaceListing[]>(
            marketplaceKeys.starredListings(),
            starredListings.filter((listing) => listing.id !== marketplaceId),
          );
        }
      }

      // Invalidate starred listings to ensure consistency
      queryClient.invalidateQueries({
        queryKey: marketplaceKeys.starredListings(),
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

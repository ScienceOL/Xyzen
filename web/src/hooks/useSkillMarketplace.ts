import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { skillMarketplaceService } from "@/service/skillMarketplaceService";
import type {
  SkillForkRequest,
  SkillForkResponse,
  SkillLikeResponse,
  SkillMarketplaceListing,
  SkillMarketplaceListingWithSnapshot,
  SkillPublishRequest,
  SkillPublishResponse,
  SkillSearchParams,
} from "@/service/skillMarketplaceService";

/**
 * Query key factory for skill marketplace queries
 */
export const skillMarketplaceKeys = {
  all: ["skill-marketplace"] as const,
  listings: () => [...skillMarketplaceKeys.all, "listings"] as const,
  listingsWithParams: (params: SkillSearchParams) =>
    [...skillMarketplaceKeys.listings(), params] as const,
  listingsInfinite: (
    params: Omit<SkillSearchParams, "limit" | "offset">,
    pageSize: number,
  ) =>
    [
      ...skillMarketplaceKeys.listings(),
      "infinite",
      { ...params, pageSize },
    ] as const,
  listing: (id: string) =>
    [...skillMarketplaceKeys.all, "listing", id] as const,
  myListings: () => [...skillMarketplaceKeys.all, "my-listings"] as const,
  starredListings: () => [...skillMarketplaceKeys.all, "starred"] as const,
  history: (id: string) =>
    [...skillMarketplaceKeys.all, "history", id] as const,
  trending: (limit: number) =>
    [...skillMarketplaceKeys.all, "trending", limit] as const,
  recentlyPublished: (limit: number) =>
    [...skillMarketplaceKeys.all, "recently-published", limit] as const,
};

const DEFAULT_PAGE_SIZE = 20;

/**
 * Hook for infinite scroll skill marketplace listings
 */
export function useInfiniteSkillMarketplaceListings(
  params: Omit<SkillSearchParams, "limit" | "offset"> = {},
  pageSize: number = DEFAULT_PAGE_SIZE,
) {
  const query = useInfiniteQuery({
    queryKey: skillMarketplaceKeys.listingsInfinite(params, pageSize),
    queryFn: async ({ pageParam }) => {
      return skillMarketplaceService.searchListings({
        ...params,
        limit: pageSize,
        offset: pageParam,
      });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < pageSize) {
        return undefined;
      }
      return allPages.length * pageSize;
    },
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  const listings = query.data?.pages.flatMap((page) => page) ?? [];

  return {
    ...query,
    listings,
  };
}

/**
 * Hook to get a single skill marketplace listing with snapshot
 */
export function useSkillMarketplaceListing(marketplaceId: string | undefined) {
  return useQuery({
    queryKey: marketplaceId
      ? skillMarketplaceKeys.listing(marketplaceId)
      : ["skill-marketplace", "listing", "undefined"],
    queryFn: () =>
      marketplaceId
        ? skillMarketplaceService.getListing(marketplaceId)
        : Promise.reject(new Error("No marketplace ID provided")),
    enabled: !!marketplaceId,
    staleTime: 1000 * 60 * 2,
  });
}

/**
 * Hook to get starred skill marketplace listings
 */
export function useStarredSkillListings() {
  return useQuery({
    queryKey: skillMarketplaceKeys.starredListings(),
    queryFn: async () => {
      const listings = await skillMarketplaceService.getStarredListings();
      return listings.map((listing) => ({
        ...listing,
        has_liked: true,
      }));
    },
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Hook to get trending skill marketplace listings
 */
export function useTrendingSkillListings(limit = 10) {
  return useQuery({
    queryKey: skillMarketplaceKeys.trending(limit),
    queryFn: () => skillMarketplaceService.getTrendingListings(limit),
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Hook to get recently published skill marketplace listings
 */
export function useRecentlyPublishedSkillListings(limit = 6) {
  return useQuery({
    queryKey: skillMarketplaceKeys.recentlyPublished(limit),
    queryFn: () => skillMarketplaceService.getRecentlyPublishedListings(limit),
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Hook to get version history of a skill marketplace listing
 */
export function useSkillListingHistory(marketplaceId: string | undefined) {
  return useQuery({
    queryKey: marketplaceId
      ? skillMarketplaceKeys.history(marketplaceId)
      : ["skill-marketplace", "history", "undefined"],
    queryFn: () =>
      marketplaceId
        ? skillMarketplaceService.getListingHistory(marketplaceId)
        : Promise.reject(new Error("No marketplace ID provided")),
    enabled: !!marketplaceId,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Hook to publish a skill to marketplace
 */
export function usePublishSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: SkillPublishRequest) =>
      skillMarketplaceService.publishSkill(request),
    onSuccess: (_data: SkillPublishResponse) => {
      queryClient.invalidateQueries({ queryKey: skillMarketplaceKeys.all });
      queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

/**
 * Hook to fork a skill from marketplace
 */
export function useForkSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      marketplaceId,
      request,
    }: {
      marketplaceId: string;
      request?: SkillForkRequest;
    }) => skillMarketplaceService.forkSkill(marketplaceId, request),
    onSuccess: (_data: SkillForkResponse, variables) => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      queryClient.invalidateQueries({
        queryKey: skillMarketplaceKeys.listing(variables.marketplaceId),
      });
      queryClient.invalidateQueries({
        queryKey: skillMarketplaceKeys.listings(),
      });
    },
  });
}

/**
 * Hook to toggle like on a skill marketplace listing
 */
type SkillListingsCache =
  | SkillMarketplaceListing[]
  | InfiniteData<SkillMarketplaceListing[], number>;

function updateSkillListingsCache(
  cacheData: SkillListingsCache | undefined,
  updater: (listing: SkillMarketplaceListing) => SkillMarketplaceListing,
): SkillListingsCache | undefined {
  if (!cacheData) {
    return cacheData;
  }

  if (Array.isArray(cacheData)) {
    return cacheData.map(updater);
  }

  return {
    ...cacheData,
    pages: cacheData.pages.map((page) => page.map(updater)),
  };
}

export function useToggleSkillLike() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (marketplaceId: string) =>
      skillMarketplaceService.toggleLike(marketplaceId),
    onMutate: async (marketplaceId: string) => {
      await queryClient.cancelQueries({
        queryKey: skillMarketplaceKeys.listing(marketplaceId),
      });
      await queryClient.cancelQueries({
        queryKey: skillMarketplaceKeys.all,
      });

      const previousListing =
        queryClient.getQueryData<SkillMarketplaceListingWithSnapshot>(
          skillMarketplaceKeys.listing(marketplaceId),
        );

      const previousListQueries =
        queryClient.getQueriesData<SkillListingsCache>({
          queryKey: skillMarketplaceKeys.listings(),
        });

      const previousStarredListings = queryClient.getQueryData<
        SkillMarketplaceListing[]
      >(skillMarketplaceKeys.starredListings());

      // Optimistic update — single listing
      if (previousListing) {
        queryClient.setQueryData<SkillMarketplaceListingWithSnapshot>(
          skillMarketplaceKeys.listing(marketplaceId),
          {
            ...previousListing,
            has_liked: !previousListing.has_liked,
            likes_count: previousListing.has_liked
              ? previousListing.likes_count - 1
              : previousListing.likes_count + 1,
          },
        );
      }

      // Optimistic update — lists
      previousListQueries.forEach(([queryKey, oldData]) => {
        if (!oldData) return;
        queryClient.setQueryData<SkillListingsCache>(
          queryKey,
          updateSkillListingsCache(oldData, (listing) => {
            if (listing.id !== marketplaceId) return listing;
            return {
              ...listing,
              has_liked: !listing.has_liked,
              likes_count: listing.has_liked
                ? listing.likes_count - 1
                : listing.likes_count + 1,
            };
          }),
        );
      });

      // Optimistic update — starred
      if (previousStarredListings) {
        const targetListing = previousStarredListings.find(
          (l) => l.id === marketplaceId,
        );
        if (targetListing && targetListing.has_liked) {
          queryClient.setQueryData<SkillMarketplaceListing[]>(
            skillMarketplaceKeys.starredListings(),
            previousStarredListings.filter((l) => l.id !== marketplaceId),
          );
        }
      }

      return { previousListing, previousListQueries, previousStarredListings };
    },
    onError: (_err, marketplaceId, context) => {
      if (context?.previousListing) {
        queryClient.setQueryData(
          skillMarketplaceKeys.listing(marketplaceId),
          context.previousListing,
        );
      }
      if (context?.previousListQueries) {
        context.previousListQueries.forEach(([queryKey, oldData]) => {
          queryClient.setQueryData(queryKey, oldData);
        });
      }
      if (context?.previousStarredListings) {
        queryClient.setQueryData(
          skillMarketplaceKeys.starredListings(),
          context.previousStarredListings,
        );
      }
    },
    onSuccess: (data: SkillLikeResponse, marketplaceId) => {
      // Confirm with server response
      const currentListing =
        queryClient.getQueryData<SkillMarketplaceListingWithSnapshot>(
          skillMarketplaceKeys.listing(marketplaceId),
        );
      if (currentListing) {
        queryClient.setQueryData<SkillMarketplaceListingWithSnapshot>(
          skillMarketplaceKeys.listing(marketplaceId),
          {
            ...currentListing,
            has_liked: data.is_liked,
            likes_count: data.likes_count,
          },
        );
      }

      // Update lists
      const listQueries = queryClient.getQueriesData<SkillListingsCache>({
        queryKey: skillMarketplaceKeys.listings(),
      });
      listQueries.forEach(([queryKey, oldData]) => {
        if (!oldData) return;
        queryClient.setQueryData<SkillListingsCache>(
          queryKey,
          updateSkillListingsCache(oldData, (listing) => {
            if (listing.id !== marketplaceId) return listing;
            return {
              ...listing,
              has_liked: data.is_liked,
              likes_count: data.likes_count,
            };
          }),
        );
      });

      // Invalidate starred and trending
      queryClient.invalidateQueries({
        queryKey: skillMarketplaceKeys.starredListings(),
      });
      queryClient.invalidateQueries({
        queryKey: skillMarketplaceKeys.trending(10),
      });
      queryClient.invalidateQueries({
        queryKey: skillMarketplaceKeys.recentlyPublished(6),
      });
    },
  });
}

/**
 * Hook to prefetch a skill marketplace listing
 */
export function usePrefetchSkillMarketplaceListing() {
  const queryClient = useQueryClient();

  return (marketplaceId: string) => {
    queryClient.prefetchQuery({
      queryKey: skillMarketplaceKeys.listing(marketplaceId),
      queryFn: () => skillMarketplaceService.getListing(marketplaceId),
      staleTime: 1000 * 60 * 2,
    });
  };
}

/**
 * Smithery MCP hooks
 */
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { smitheryService } from "../services/smitheryService";
import type {
  SmitheryServerDetail,
  SmitheryServersListResponse,
} from "../types/smithery";

const smitheryKeys = {
  all: ["smithery"] as const,
  servers: () => [...smitheryKeys.all, "servers"] as const,
  list: (
    q: string | undefined,
    profile: string | undefined,
    page: number,
    pageSize: number,
  ) => [...smitheryKeys.servers(), { q, profile, page, pageSize }] as const,
  infinite: (
    q: string | undefined,
    profile: string | undefined,
    pageSize: number,
  ) =>
    [...smitheryKeys.servers(), "infinite", { q, profile, pageSize }] as const,
  detail: (id: string) => [...smitheryKeys.all, "server", id] as const,
};

export const useSmitheryServers = (
  page: number = 1,
  pageSize: number = 20,
  q?: string,
  profile?: string,
) => {
  const query = useQuery({
    queryKey: smitheryKeys.list(q, profile, page, pageSize),
    queryFn: () => smitheryService.listServers({ q, profile, page, pageSize }),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const data = query.data as SmitheryServersListResponse | undefined;

  return {
    servers: data?.servers || [],
    pagination: data?.pagination,
    loading: query.isLoading,
    error: query.error?.message || null,
    isError: query.isError,
    refetch: query.refetch,
  };
};

export const useSmitheryInfiniteServers = (
  pageSize: number = 50,
  q?: string,
  profile?: string,
) => {
  const query = useInfiniteQuery({
    queryKey: smitheryKeys.infinite(q, profile, pageSize),
    queryFn: async ({ pageParam = 1 }) => {
      const res = await smitheryService.listServers({
        q,
        profile,
        page: pageParam as number,
        pageSize,
      });
      return res;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const next = lastPage.pagination.currentPage + 1;
      return next <= lastPage.pagination.totalPages ? next : undefined;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const pages = query.data?.pages || [];
  const servers = pages.flatMap((p) => p.servers);
  const meta = pages[0]?.pagination;

  return {
    servers,
    totalCount: meta?.totalCount || 0,
    totalPages: meta?.totalPages || 0,
    pageCount: pages.length,
    loading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: !!query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
    error: query.error?.message || null,
    isError: query.isError,
  };
};

export const useSmitheryServerDetail = (id?: string) => {
  const query = useQuery<SmitheryServerDetail>({
    queryKey: id ? smitheryKeys.detail(id) : ["smithery", "server", "__none__"],
    queryFn: () => {
      if (!id) throw new Error("id is required");
      return smitheryService.getServer(id);
    },
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  return {
    detail: query.data || null,
    loading: query.isLoading,
    error: query.error?.message || null,
    isError: query.isError,
    refetch: query.refetch,
  };
};

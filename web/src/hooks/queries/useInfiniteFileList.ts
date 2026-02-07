/**
 * Infinite File List Hook
 * 使用 TanStack Query 的 useInfiniteQuery 实现无限滚动加载
 */

import { fileService, type FileUploadResponse } from "@/service/fileService";
import { useInfiniteQuery } from "@tanstack/react-query";

const PAGE_SIZE = 100;

interface UseInfiniteFileListParams {
  scope?: string;
  category?: string;
  includeDeleted?: boolean;
  folderId?: string | null;
  filterByFolder?: boolean;
  enabled?: boolean;
}

interface FileListPage {
  items: FileUploadResponse[];
  nextOffset: number | undefined;
  total?: number;
}

const fileListKeys = {
  all: ["files"] as const,
  list: (params: UseInfiniteFileListParams) =>
    [...fileListKeys.all, "list", params] as const,
};

export const useInfiniteFileList = ({
  scope,
  category,
  includeDeleted = false,
  folderId,
  filterByFolder = false,
  enabled = true,
}: UseInfiniteFileListParams = {}) => {
  const query = useInfiniteQuery({
    queryKey: fileListKeys.list({
      scope,
      category,
      includeDeleted,
      folderId,
      filterByFolder,
    }),
    queryFn: async ({ pageParam = 0 }): Promise<FileListPage> => {
      const items = await fileService.listFiles({
        scope,
        category,
        include_deleted: includeDeleted,
        limit: PAGE_SIZE,
        offset: pageParam as number,
        folder_id: folderId ?? undefined,
        filter_by_folder: filterByFolder,
      });

      // 如果返回数量等于 PAGE_SIZE，可能还有更多数据
      const hasMore = items.length === PAGE_SIZE;

      return {
        items,
        nextOffset: hasMore ? (pageParam as number) + items.length : undefined,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    enabled,
    staleTime: 30 * 1000, // 30 秒
    gcTime: 5 * 60 * 1000, // 5 分钟
  });

  // 合并所有页的数据
  const files = query.data?.pages.flatMap((page) => page.items) ?? [];

  return {
    files,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: !!query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
    error: query.error?.message || null,
    isError: query.isError,
  };
};

export { PAGE_SIZE as FILE_LIST_PAGE_SIZE };

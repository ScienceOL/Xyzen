import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { scheduledTaskService } from "@/service/scheduledTaskService";
import { queryKeys } from "./queryKeys";

/**
 * Fetch scheduled tasks, optionally filtered by status.
 */
export function useScheduledTasks(status?: string) {
  return useQuery({
    queryKey: queryKeys.scheduledTasks.list(status),
    queryFn: () => scheduledTaskService.list(status),
    staleTime: 30_000,
  });
}

/**
 * Cancel (delete) a scheduled task.
 */
export function useCancelScheduledTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => scheduledTaskService.cancel(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.scheduledTasks.all,
      });
    },
  });
}

import { http } from "@/service/http/client";
import type { ScheduledTask } from "@/types/scheduledTask";

class ScheduledTaskService {
  async list(status?: string): Promise<ScheduledTask[]> {
    return http.get("/xyzen/api/v1/scheduled-tasks/", {
      params: status ? { status } : undefined,
    });
  }

  async get(id: string): Promise<ScheduledTask> {
    return http.get(`/xyzen/api/v1/scheduled-tasks/${id}`);
  }

  async cancel(id: string): Promise<void> {
    return http.delete(`/xyzen/api/v1/scheduled-tasks/${id}`);
  }

  async update(
    id: string,
    data: Partial<
      Pick<
        ScheduledTask,
        | "status"
        | "prompt"
        | "schedule_type"
        | "cron_expression"
        | "scheduled_at"
        | "timezone"
        | "max_runs"
      >
    >,
  ): Promise<ScheduledTask> {
    return http.patch(`/xyzen/api/v1/scheduled-tasks/${id}`, data);
  }
}

export const scheduledTaskService = new ScheduledTaskService();

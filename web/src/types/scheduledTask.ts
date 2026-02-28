export interface ScheduledTask {
  id: string;
  user_id: string;
  agent_id: string;
  session_id: string | null;
  topic_id: string | null;
  prompt: string;
  schedule_type: "once" | "daily" | "weekly" | "cron";
  cron_expression: string | null;
  scheduled_at: string; // ISO 8601
  timezone: string;
  celery_task_id: string | null;
  status: "active" | "paused" | "completed" | "failed" | "cancelled";
  max_runs: number | null;
  run_count: number;
  last_run_at: string | null;
  last_error: string | null;
  metadata_: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

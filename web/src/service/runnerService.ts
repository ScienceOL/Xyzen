import { http } from "@/service/http/client";

export interface RunnerRead {
  id: string;
  name: string;
  user_id: string;
  token_prefix: string;
  is_active: boolean;
  is_online: boolean;
  last_connected_at: string | null;
  os_info: string | null;
  work_dir: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRunnerTokenResponse {
  runner: RunnerRead;
  token: string;
  connect_command: string;
}

class RunnerService {
  async listRunners(): Promise<RunnerRead[]> {
    return http.get("/xyzen/api/v1/runners/");
  }

  async createRunnerToken(name: string): Promise<CreateRunnerTokenResponse> {
    return http.post("/xyzen/api/v1/runners/token", { name });
  }

  async updateRunner(
    id: string,
    data: { name?: string; is_active?: boolean },
  ): Promise<RunnerRead> {
    return http.patch(`/xyzen/api/v1/runners/${id}`, data);
  }

  async deleteRunner(id: string): Promise<void> {
    return http.delete(`/xyzen/api/v1/runners/${id}`);
  }
}

export const runnerService = new RunnerService();

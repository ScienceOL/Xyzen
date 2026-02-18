import { http } from "@/service/http/client";

export interface SandboxFileInfo {
  name: string;
  path: string;
  is_dir: boolean;
  size: number | null;
}

export interface SandboxFilesResponse {
  files: SandboxFileInfo[];
  sandbox_active: boolean;
}

class SandboxService {
  async listFiles(
    sessionId: string,
    path = "/workspace",
  ): Promise<SandboxFilesResponse> {
    return http.get(`/xyzen/api/v1/sessions/${sessionId}/sandbox/files`, {
      params: { path },
    });
  }
}

export const sandboxService = new SandboxService();

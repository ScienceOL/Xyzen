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

export interface SandboxPreviewResponse {
  url: string;
  port: number;
}

export interface SandboxEntry {
  sandbox_id: string;
  session_id: string;
  session_name: string | null;
  agent_id: string | null;
  agent_name: string | null;
  backend: string;
  created_at: string;
  ttl_seconds: number | null;
}

export interface SandboxListResponse {
  sandboxes: SandboxEntry[];
  total: number;
}

export interface SandboxDeleteResponse {
  deleted: boolean;
  sandbox_id: string | null;
}

class SandboxService {
  /** List all active sandboxes for the current user. */
  async listSandboxes(): Promise<SandboxListResponse> {
    return http.get("/xyzen/api/v1/sandboxes");
  }

  /** Delete a sandbox by session ID. */
  async deleteSandbox(sessionId: string): Promise<SandboxDeleteResponse> {
    return http.delete(`/xyzen/api/v1/sandboxes/${sessionId}`);
  }

  async listFiles(
    sessionId: string,
    path?: string,
  ): Promise<SandboxFilesResponse> {
    return http.get(`/xyzen/api/v1/sessions/${sessionId}/sandbox/files`, {
      params: path ? { path } : undefined,
    });
  }

  async getPreview(
    sessionId: string,
    port: number,
  ): Promise<SandboxPreviewResponse> {
    return http.get(`/xyzen/api/v1/sessions/${sessionId}/sandbox/preview`, {
      params: { port },
    });
  }

  /**
   * Fetch sandbox file content as a Blob.
   */
  async getFileContent(sessionId: string, path: string): Promise<Blob> {
    const response = await http.raw(
      `/xyzen/api/v1/sessions/${sessionId}/sandbox/file/content`,
      { params: { path } },
    );
    return response.blob();
  }
}

export const sandboxService = new SandboxService();

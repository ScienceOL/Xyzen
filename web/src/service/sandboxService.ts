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

class SandboxService {
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

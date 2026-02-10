import { useXyzen } from "@/store";

const getBackendUrl = () => {
  const url = useXyzen.getState().backendUrl;
  if (!url || url === "") {
    if (typeof window !== "undefined") {
      return `${window.location.protocol}//${window.location.host}`;
    }
  }
  return url;
};

const getAuthHeaders = (): Record<string, string> => {
  const token = useXyzen.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

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
    const baseUrl = getBackendUrl();
    const response = await fetch(
      `${baseUrl}/xyzen/api/v1/sessions/${sessionId}/sandbox/files?path=${encodeURIComponent(path)}`,
      { headers: { ...getAuthHeaders() } },
    );
    if (!response.ok) throw new Error("Failed to fetch sandbox files");
    return response.json();
  }
}

export const sandboxService = new SandboxService();

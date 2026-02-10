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

export interface MemoryItem {
  key: string;
  content: string;
  created_at: string;
  updated_at: string;
}

class MemoryService {
  async listMemories(limit = 100, offset = 0): Promise<MemoryItem[]> {
    const baseUrl = getBackendUrl();
    const response = await fetch(
      `${baseUrl}/xyzen/api/v1/memories?limit=${limit}&offset=${offset}`,
      { headers: { ...getAuthHeaders() } },
    );
    if (!response.ok) throw new Error("Failed to fetch memories");
    return response.json();
  }

  async deleteMemory(key: string): Promise<void> {
    const baseUrl = getBackendUrl();
    const response = await fetch(
      `${baseUrl}/xyzen/api/v1/memories/${encodeURIComponent(key)}`,
      { method: "DELETE", headers: { ...getAuthHeaders() } },
    );
    if (!response.ok) throw new Error("Failed to delete memory");
  }
}

export const memoryService = new MemoryService();

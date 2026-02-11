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

  async createMemory(content: string): Promise<MemoryItem> {
    const baseUrl = getBackendUrl();
    const response = await fetch(`${baseUrl}/xyzen/api/v1/memories`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ content }),
    });
    if (!response.ok) throw new Error("Failed to create memory");
    return response.json();
  }

  async updateMemory(key: string, content: string): Promise<MemoryItem> {
    const baseUrl = getBackendUrl();
    const response = await fetch(
      `${baseUrl}/xyzen/api/v1/memories/${encodeURIComponent(key)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ content }),
      },
    );
    if (!response.ok) throw new Error("Failed to update memory");
    return response.json();
  }

  async searchMemories(query: string, limit = 20): Promise<MemoryItem[]> {
    const baseUrl = getBackendUrl();
    const response = await fetch(`${baseUrl}/xyzen/api/v1/memories/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ query, limit }),
    });
    if (!response.ok) throw new Error("Failed to search memories");
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

import { http } from "@/service/http/client";

export interface MemoryItem {
  key: string;
  content: string;
  created_at: string;
  updated_at: string;
}

class MemoryService {
  async listMemories(limit = 100, offset = 0): Promise<MemoryItem[]> {
    return http.get("/xyzen/api/v1/memories", {
      params: { limit, offset },
    });
  }

  async createMemory(content: string): Promise<MemoryItem> {
    return http.post("/xyzen/api/v1/memories", { content });
  }

  async updateMemory(key: string, content: string): Promise<MemoryItem> {
    return http.put(`/xyzen/api/v1/memories/${encodeURIComponent(key)}`, {
      content,
    });
  }

  async searchMemories(query: string, limit = 20): Promise<MemoryItem[]> {
    return http.post("/xyzen/api/v1/memories/search", { query, limit });
  }

  async deleteMemory(key: string): Promise<void> {
    return http.delete(`/xyzen/api/v1/memories/${encodeURIComponent(key)}`);
  }
}

export const memoryService = new MemoryService();

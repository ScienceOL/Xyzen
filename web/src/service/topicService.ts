import { http } from "@/service/http/client";
import type { Message } from "@/store/types";

export interface TopicCreate {
  name: string;
  session_id: string;
}

export interface TopicRead {
  id: string;
  name: string;
  session_id: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface TokenStats {
  total_tokens: number;
}

export interface CompactResponse {
  new_topic_id: string;
  summary_preview: string;
}

class TopicService {
  async createTopic(data: TopicCreate): Promise<TopicRead> {
    return http.post("/xyzen/api/v1/topics/", data);
  }

  async updateTopic(
    topicId: string,
    data: { name?: string; is_pinned?: boolean },
  ): Promise<TopicRead> {
    return http.put(`/xyzen/api/v1/topics/${topicId}`, data);
  }

  async deleteTopic(topicId: string): Promise<void> {
    return http.delete(`/xyzen/api/v1/topics/${topicId}`);
  }

  async getMessages(topicId: string): Promise<Message[]> {
    return http.get(`/xyzen/api/v1/topics/${topicId}/messages`);
  }

  async getTokenStats(topicId: string): Promise<TokenStats> {
    return http.get(`/xyzen/api/v1/topics/${topicId}/token-stats`);
  }

  async compactTopic(topicId: string): Promise<CompactResponse> {
    return http.post(`/xyzen/api/v1/topics/${topicId}/compact`, {});
  }
}

export const topicService = new TopicService();

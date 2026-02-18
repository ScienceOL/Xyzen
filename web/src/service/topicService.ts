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
  created_at: string;
  updated_at: string;
}

class TopicService {
  async createTopic(data: TopicCreate): Promise<TopicRead> {
    return http.post("/xyzen/api/v1/topics/", data);
  }

  async getMessages(topicId: string): Promise<Message[]> {
    return http.get(`/xyzen/api/v1/topics/${topicId}/messages`);
  }
}

export const topicService = new TopicService();

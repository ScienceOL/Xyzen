import { http } from "@/service/http/client";
import type { Message } from "@/store/types";

export interface EditMessageResponse {
  message: Message;
  regenerate: boolean;
}

class MessageService {
  async editMessage(
    messageId: string,
    data: { content: string; truncate_and_regenerate?: boolean },
  ): Promise<EditMessageResponse> {
    return http.patch(`/xyzen/api/v1/messages/${messageId}`, data);
  }

  async deleteMessage(messageId: string): Promise<void> {
    return http.delete(`/xyzen/api/v1/messages/${messageId}`);
  }
}

export const messageService = new MessageService();

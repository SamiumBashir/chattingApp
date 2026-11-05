import { apiClient } from '../lib/api';
import { ApiResponse, Message, Reaction } from '../types';

export interface SendMessageDTO {
  clientMessageId: string;
  content: string;
  type?: 'text' | 'image' | 'file' | 'system';
  attachments?: any[];
  replyTo?: string | null;
}

export const messageService = {
  async getMessages(
    conversationId: string,
    cursor?: string,
    limit = 50
  ): Promise<{ messages: Message[]; meta: { nextCursor?: string; hasMore: boolean } }> {
    const res = await apiClient.get<ApiResponse<{ messages: Message[] }>>(
      `/conversations/${conversationId}/messages`,
      {
        params: { cursor, limit },
      }
    );
    return {
      messages: res.data.data!.messages,
      meta: (res.data.meta as any) || { hasMore: false },
    };
  },

  async sendMessage(conversationId: string, data: SendMessageDTO): Promise<Message> {
    const res = await apiClient.post<ApiResponse<{ message: Message }>>(
      `/conversations/${conversationId}/messages`,
      data
    );
    return res.data.data!.message;
  },

  async markRead(messageId: string): Promise<void> {
    await apiClient.post(`/messages/${messageId}/read`);
  },

  async editMessage(messageId: string, content: string): Promise<Message> {
    const res = await apiClient.patch<ApiResponse<{ message: Message }>>(`/messages/${messageId}`, {
      content,
    });
    return res.data.data!.message;
  },

  async deleteMessage(messageId: string): Promise<{ isDeleted: boolean; deletedAt: string }> {
    const res = await apiClient.delete<ApiResponse<{ isDeleted: boolean; deletedAt: string }>>(
      `/messages/${messageId}`
    );
    return res.data.data!;
  },

  async addReaction(messageId: string, emoji: string): Promise<{ reactions: Reaction[] }> {
    const res = await apiClient.post<ApiResponse<{ reactions: Reaction[] }>>(
      `/messages/${messageId}/reactions`,
      { emoji }
    );
    return res.data.data!;
  },

  async removeReaction(messageId: string): Promise<{ reactions: Reaction[] }> {
    const res = await apiClient.delete<ApiResponse<{ reactions: Reaction[] }>>(
      `/messages/${messageId}/reactions`
    );
    return res.data.data!;
  },
};

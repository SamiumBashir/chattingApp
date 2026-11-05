import api from '../lib/api';
import { ApiResponse, Message } from '../types';

export interface SearchMessagesResult {
  messages: Message[];
  total: number;
  page: number;
  totalPages: number;
}

export const searchService = {
  /**
   * Search messages across user's conversations
   */
  async searchMessages(
    q: string,
    options: { conversationId?: string; page?: number; limit?: number } = {}
  ): Promise<SearchMessagesResult> {
    const res = await api.get<ApiResponse<SearchMessagesResult>>('/messages/search', {
      params: {
        q,
        ...options,
      },
    });
    return res.data.data!;
  },
};


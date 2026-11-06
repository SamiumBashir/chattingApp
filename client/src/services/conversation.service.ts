import { apiClient } from '../lib/api';
import { ApiResponse, Conversation } from '../types';

export interface CreateGroupDTO {
  groupName: string;
  participantIds: string[];
  groupAvatar?: string | null;
  groupDescription?: string;
}

export interface UpdateGroupDTO {
  groupName?: string;
  groupAvatar?: string | null;
  groupDescription?: string;
}

export const conversationService = {
  async listConversations(page = 1, limit = 30): Promise<{ conversations: Conversation[]; meta: any }> {
    const res = await apiClient.get<ApiResponse<{ conversations: Conversation[] }>>('/conversations', {
      params: { page, limit },
    });
    return {
      conversations: res.data.data!.conversations,
      meta: res.data.meta,
    };
  },

  async createPrivate(recipientId: string): Promise<Conversation> {
    const res = await apiClient.post<ApiResponse<{ conversation: Conversation }>>('/conversations/private', {
      recipientId,
    });
    return res.data.data!.conversation;
  },

  async createGroup(data: CreateGroupDTO): Promise<Conversation> {
    const res = await apiClient.post<ApiResponse<{ conversation: Conversation }>>('/conversations/group', data);
    return res.data.data!.conversation;
  },

  async getConversation(id: string): Promise<Conversation> {
    const res = await apiClient.get<ApiResponse<{ conversation: Conversation }>>(`/conversations/${id}`);
    return res.data.data!.conversation;
  },

  async updateGroup(id: string, data: UpdateGroupDTO): Promise<Conversation> {
    const res = await apiClient.patch<ApiResponse<{ conversation: Conversation }>>(`/conversations/${id}`, data);
    return res.data.data!.conversation;
  },

  async deleteConversation(id: string): Promise<void> {
    await apiClient.delete(`/conversations/${id}`);
  },

  async addMembers(id: string, userIds: string[]): Promise<Conversation> {
    const res = await apiClient.post<ApiResponse<{ conversation: Conversation }>>(`/conversations/${id}/members`, {
      userIds,
    });
    return res.data.data!.conversation;
  },

  async removeMember(id: string, userId: string): Promise<Conversation> {
    const res = await apiClient.delete<ApiResponse<{ conversation: Conversation }>>(
      `/conversations/${id}/members/${userId}`
    );
    return res.data.data!.conversation;
  },

  async leaveGroup(id: string): Promise<void> {
    await apiClient.post(`/conversations/${id}/leave`);
  },

  async markAsRead(id: string): Promise<void> {
    await apiClient.post(`/conversations/${id}/read`);
  },
};


import { apiClient } from '../lib/api';
import { ApiResponse, User } from '../types';

export interface UpdateProfileDTO {
  name?: string;
  bio?: string;
  avatar?: string | null;
}

export const userService = {
  async getMe(): Promise<User> {
    const res = await apiClient.get<ApiResponse<{ user: User }>>('/users/me');
    return res.data.data!.user;
  },

  async updateMe(data: UpdateProfileDTO): Promise<User> {
    const res = await apiClient.patch<ApiResponse<{ user: User }>>('/users/me', data);
    return res.data.data!.user;
  },

  async searchUsers(q: string, limit = 20): Promise<User[]> {
    const res = await apiClient.get<ApiResponse<{ users: User[] }>>('/users/search', {
      params: { q, limit },
    });
    return res.data.data!.users;
  },

  async getUserById(userId: string): Promise<User> {
    const res = await apiClient.get<ApiResponse<{ user: User }>>(`/users/${userId}`);
    return res.data.data!.user;
  },

  async blockUser(userId: string): Promise<void> {
    await apiClient.post(`/users/${userId}/block`);
  },

  async unblockUser(userId: string): Promise<void> {
    await apiClient.delete(`/users/${userId}/block`);
  },

  async getBlockedUsers(): Promise<Array<{ id: string; name: string; username: string; avatar?: string }>> {
    const res = await apiClient.get<ApiResponse<{ blockedUsers: Array<{ id: string; name: string; username: string; avatar?: string }> }>>('/users/blocked');
    return res.data.data!.blockedUsers;
  },

  async deactivateAccount(password: string): Promise<{ success: boolean; message: string }> {
    const res = await apiClient.post<ApiResponse<{ success: boolean; message: string }>>('/users/deactivate', {
      password,
    });
    return res.data.data!;
  },

  async deleteAccount(password: string): Promise<{ success: boolean; message: string }> {
    const res = await apiClient.post<ApiResponse<{ success: boolean; message: string }>>('/users/delete-account', {
      password,
    });
    return res.data.data!;
  },
};


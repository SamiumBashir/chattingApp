import api from '../lib/api';
import { ApiResponse, Notification } from '../types';

export interface GetNotificationsResult {
  notifications: Notification[];
  unreadCount: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const notificationService = {
  /**
   * Fetch paginated notifications for current user
   */
  async getNotifications(options: {
    page?: number;
    limit?: number;
    unreadOnly?: boolean;
  } = {}): Promise<GetNotificationsResult> {
    const res = await api.get<ApiResponse<GetNotificationsResult>>('/notifications', {
      params: options,
    });
    return res.data.data!;
  },

  /**
   * Mark single notification as read
   */
  async markAsRead(id: string): Promise<Notification> {
    const res = await api.patch<ApiResponse<{ notification: Notification }>>(
      `/notifications/${id}/read`
    );
    return res.data.data!.notification;
  },

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(): Promise<{ modifiedCount: number }> {
    const res = await api.post<ApiResponse<{ modifiedCount: number }>>('/notifications/read-all');
    return res.data.data!;
  },
};


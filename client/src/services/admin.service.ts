import api from '../lib/api';
import { ApiResponse, User } from '../types';

export interface AdminOverview {
  users: {
    total: number;
    active: number;
    suspended: number;
    banned: number;
    recentSignups: number;
  };
  conversations: {
    total: number;
  };
  messages: {
    total: number;
  };
  moderation: {
    pendingReports: number;
  };
}

export interface ModerationReport {
  id: string;
  reporter: User;
  reportedUser?: User;
  reportedMessage?: {
    id: string;
    content: string;
    isDeleted: boolean;
    createdAt: string;
  };
  reportedConversation?: string;
  reason: 'spam' | 'harassment' | 'hate_speech' | 'inappropriate_content' | 'other';
  description: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  actionTaken: 'none' | 'warning' | 'message_deleted' | 'user_suspended' | 'user_banned';
  reviewedBy?: User;
  reviewedAt?: string;
  notes?: string;
  createdAt: string;
}

export interface AuditLogItem {
  id: string;
  action: string;
  actor: User;
  targetUser?: User;
  targetResource: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export const adminService = {
  async getOverview(): Promise<AdminOverview> {
    const res = await api.get<ApiResponse<AdminOverview>>('/admin/overview');
    return res.data.data!;
  },

  async getUsers(params: {
    page?: number;
    limit?: number;
    status?: string;
    role?: string;
    q?: string;
  } = {}): Promise<{ users: User[]; total: number; page: number; totalPages: number }> {
    const res = await api.get<ApiResponse<{ users: User[]; total: number; page: number; totalPages: number }>>(
      '/admin/users',
      { params }
    );
    return res.data.data!;
  },

  async updateUserStatus(
    userId: string,
    status: 'active' | 'suspended' | 'banned',
    reason?: string
  ): Promise<User> {
    const res = await api.patch<ApiResponse<{ user: User }>>(`/admin/users/${userId}/status`, {
      status,
      reason,
    });
    return res.data.data!.user;
  },

  async createReport(data: {
    reportedUserId?: string;
    reportedMessageId?: string;
    reportedConversationId?: string;
    reason: 'spam' | 'harassment' | 'hate_speech' | 'inappropriate_content' | 'other';
    description: string;
  }): Promise<{ report: ModerationReport }> {
    const res = await api.post<ApiResponse<{ report: ModerationReport }>>('/admin/reports', data);
    return res.data.data!;
  },

  async getReports(params: {
    page?: number;
    limit?: number;
    status?: string;
  } = {}): Promise<{ reports: ModerationReport[]; total: number; page: number; totalPages: number }> {
    const res = await api.get<
      ApiResponse<{ reports: ModerationReport[]; total: number; page: number; totalPages: number }>
    >('/admin/reports', { params });
    return res.data.data!;
  },

  async updateReport(
    reportId: string,
    data: {
      status: 'reviewed' | 'resolved' | 'dismissed';
      actionTaken?: 'none' | 'warning' | 'message_deleted' | 'user_suspended' | 'user_banned';
      notes?: string;
    }
  ): Promise<ModerationReport> {
    const res = await api.patch<ApiResponse<{ report: ModerationReport }>>(
      `/admin/reports/${reportId}`,
      data
    );
    return res.data.data!.report;
  },

  async getAuditLogs(params: {
    page?: number;
    limit?: number;
    action?: string;
    actorId?: string;
  } = {}): Promise<{ logs: AuditLogItem[]; total: number; page: number; totalPages: number }> {
    const res = await api.get<
      ApiResponse<{ logs: AuditLogItem[]; total: number; page: number; totalPages: number }>
    >('/admin/audit-logs', { params });
    return res.data.data!;
  },
};


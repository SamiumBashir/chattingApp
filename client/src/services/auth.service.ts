import { apiClient, setAccessToken, setRefreshToken, getRefreshToken } from '../lib/api';
import { ApiResponse, User } from '../types';

export interface RegisterDTO {
  name: string;
  username: string;
  email: string;
  password: string;
}

export interface LoginDTO {
  identifier: string;
  password: string;
}

export interface AuthResponseData {
  user: User;
  accessToken: string;
  refreshToken?: string;
  verificationToken?: string;
}

export interface SessionInfo {
  id: string;
  deviceName: string;
  userAgent: string;
  ipAddress: string;
  createdAt: string;
  isCurrent: boolean;
}

export const authService = {
  async register(data: RegisterDTO): Promise<AuthResponseData> {
    const res = await apiClient.post<ApiResponse<AuthResponseData>>('/auth/register', data);
    if (res.data.data?.accessToken) {
      setAccessToken(res.data.data.accessToken);
    }
    if (res.data.data?.refreshToken) {
      setRefreshToken(res.data.data.refreshToken);
    }
    if (res.data.data?.user && typeof window !== 'undefined') {
      localStorage.setItem('connectly_user', JSON.stringify(res.data.data.user));
    }
    return res.data.data!;
  },

  async login(data: LoginDTO): Promise<AuthResponseData> {
    const res = await apiClient.post<ApiResponse<AuthResponseData>>('/auth/login', data);
    if (res.data.data?.accessToken) {
      setAccessToken(res.data.data.accessToken);
    }
    if (res.data.data?.refreshToken) {
      setRefreshToken(res.data.data.refreshToken);
    }
    if (res.data.data?.user && typeof window !== 'undefined') {
      localStorage.setItem('connectly_user', JSON.stringify(res.data.data.user));
    }
    return res.data.data!;
  },

  async googleLogin(credential: string): Promise<AuthResponseData> {
    const res = await apiClient.post<ApiResponse<AuthResponseData>>('/auth/google', { credential });
    if (res.data.data?.accessToken) {
      setAccessToken(res.data.data.accessToken);
    }
    if (res.data.data?.refreshToken) {
      setRefreshToken(res.data.data.refreshToken);
    }
    if (res.data.data?.user && typeof window !== 'undefined') {
      localStorage.setItem('connectly_user', JSON.stringify(res.data.data.user));
    }
    return res.data.data!;
  },

  async logout(): Promise<void> {
    try {
      const refreshToken = getRefreshToken();
      await apiClient.post('/auth/logout', { refreshToken });
    } finally {
      setAccessToken(null);
      setRefreshToken(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('connectly_user');
        localStorage.removeItem('connectly_access_token');
        localStorage.removeItem('connectly_refresh_token');
      }
    }
  },

  async refresh(): Promise<AuthResponseData> {
    const storedRefreshToken = getRefreshToken();
    const res = await apiClient.post<ApiResponse<AuthResponseData>>('/auth/refresh', {
      refreshToken: storedRefreshToken,
    });
    if (res.data.data?.accessToken) {
      setAccessToken(res.data.data.accessToken);
    }
    if (res.data.data?.refreshToken) {
      setRefreshToken(res.data.data.refreshToken);
    }
    if (res.data.data?.user && typeof window !== 'undefined') {
      localStorage.setItem('connectly_user', JSON.stringify(res.data.data.user));
    }
    return res.data.data!;
  },

  async getMe(): Promise<User> {
    const res = await apiClient.get<ApiResponse<{ user: User }>>('/auth/me');
    return res.data.data!.user;
  },

  async verifyEmail(token: string): Promise<void> {
    await apiClient.post('/auth/verify-email', { token });
  },

  async resendVerification(): Promise<void> {
    await apiClient.post('/auth/resend-verification');
  },

  async forgotPassword(email: string): Promise<{ sent: boolean; resetToken?: string }> {
    const res = await apiClient.post<ApiResponse<{ sent: boolean; resetToken?: string }>>(
      '/auth/forgot-password',
      { email }
    );
    return res.data.data!;
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await apiClient.post('/auth/reset-password', { token, newPassword });
  },

  async getSessions(): Promise<SessionInfo[]> {
    const res = await apiClient.get<ApiResponse<{ sessions: SessionInfo[] }>>('/auth/sessions');
    return res.data.data!.sessions;
  },

  async revokeSession(sessionId: string): Promise<void> {
    await apiClient.delete(`/auth/sessions/${sessionId}`);
  },
};


import { create } from 'zustand';
import { User } from '../types';
import { authService, LoginDTO, RegisterDTO } from '../services/auth.service';
import { getAccessToken, getRefreshToken } from '../lib/api';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  login: (data: LoginDTO) => Promise<void>;
  googleLogin: (credential: string) => Promise<void>;
  register: (data: RegisterDTO) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
  updateUser: (user: Partial<User>) => void;
  clearError: () => void;
}

const getStoredUser = (): User | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('connectly_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const getStoredIsAuth = (): boolean => {
  if (typeof window === 'undefined') return false;
  return Boolean(
    localStorage.getItem('connectly_access_token') ||
    localStorage.getItem('connectly_refresh_token')
  );
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: getStoredUser(),
  isAuthenticated: getStoredIsAuth(),
  isLoading: false,
  isInitialized: false,
  error: null,

  login: async (data: LoginDTO) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.login(data);
      if (typeof window !== 'undefined') {
        localStorage.setItem('connectly_user', JSON.stringify(response.user));
      }
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message || err.message || 'Login failed. Please try again.';
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  googleLogin: async (credential: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.googleLogin(credential);
      if (typeof window !== 'undefined') {
        localStorage.setItem('connectly_user', JSON.stringify(response.user));
      }
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message || err.message || 'Google sign in failed. Please try again.';
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  register: async (data: RegisterDTO) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.register(data);
      if (typeof window !== 'undefined') {
        localStorage.setItem('connectly_user', JSON.stringify(response.user));
      }
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message || err.message || 'Registration failed. Please try again.';
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await authService.logout();
    } catch (err) {
      // Ignore logout errors
    } finally {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('connectly_user');
        localStorage.removeItem('connectly_access_token');
        localStorage.removeItem('connectly_refresh_token');
      }
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    }
  },

  initialize: async () => {
    if (get().isInitialized) return;

    // Fast check: if no tokens, user is definitely logged out
    const token = getAccessToken();
    const refreshToken = getRefreshToken();
    if (!token && !refreshToken) {
      set({ user: null, isAuthenticated: false, isInitialized: true, isLoading: false });
      return;
    }

    try {
      // 1. First attempt to validate access token with /auth/me
      try {
        const user = await authService.getMe();
        if (typeof window !== 'undefined') {
          localStorage.setItem('connectly_user', JSON.stringify(user));
        }
        set({
          user,
          isAuthenticated: true,
          isInitialized: true,
          isLoading: false,
        });
        return;
      } catch {
        // If getMe failed (e.g. access token expired), perform silent refresh
        const refreshRes = await authService.refresh();
        if (typeof window !== 'undefined') {
          localStorage.setItem('connectly_user', JSON.stringify(refreshRes.user));
        }
        set({
          user: refreshRes.user,
          isAuthenticated: true,
          isInitialized: true,
          isLoading: false,
        });
        return;
      }
    } catch {
      // Refresh token truly revoked or invalid
      if (typeof window !== 'undefined') {
        localStorage.removeItem('connectly_user');
        localStorage.removeItem('connectly_access_token');
        localStorage.removeItem('connectly_refresh_token');
      }
      set({
        user: null,
        isAuthenticated: false,
        isInitialized: true,
        isLoading: false,
      });
    }
  },

  updateUser: (updatedUser: Partial<User>) => {
    const currentUser = get().user;
    if (currentUser) {
      const updated = { ...currentUser, ...updatedUser };
      if (typeof window !== 'undefined') {
        localStorage.setItem('connectly_user', JSON.stringify(updated));
      }
      set({ user: updated });
    }
  },

  clearError: () => set({ error: null }),
}));


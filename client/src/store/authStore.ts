import { create } from 'zustand';
import { User } from '../types';
import { authService, LoginDTO, RegisterDTO } from '../services/auth.service';
import { getAccessToken, setAccessToken } from '../lib/api';

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
    document.cookie.includes('connectly_logged_in=1') ||
    getAccessToken()
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
    } catch {
      // Ignore logout errors
    } finally {
      setAccessToken(null);
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

    const isLoggedInCookie = typeof window !== 'undefined' && document.cookie.includes('connectly_logged_in=1');
    const token = getAccessToken();

    if (!isLoggedInCookie && !token) {
      set({ user: null, isAuthenticated: false, isInitialized: true, isLoading: false });
      return;
    }

    try {
      if (token) {
        try {
          const user = await authService.getMe();
          if (typeof window !== 'undefined') {
            localStorage.setItem('connectly_user', JSON.stringify(user));
          }
          set({ user, isAuthenticated: true, isInitialized: true, isLoading: false });
          return;
        } catch {
          // Token expired, fall through to refresh
        }
      }

      // Silent refresh via HttpOnly cookie
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
    } catch {
      // Refresh token truly revoked or expired
      setAccessToken(null);
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


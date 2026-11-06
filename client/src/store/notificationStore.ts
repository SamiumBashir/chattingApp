import { create } from 'zustand';
import { Notification } from '../types';
import { notificationService } from '../services/notification.service';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  isOpen: boolean;
  filter: 'all' | 'unread';
  soundEnabled: boolean;

  setIsOpen: (isOpen: boolean) => void;
  setFilter: (filter: 'all' | 'unread') => void;
  toggleSound: () => void;
  setUnreadCount: (count: number) => void;
  fetchNotifications: () => Promise<void>;
  addNotification: (notification: Notification) => void;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  markConversationNotificationsAsRead: (conversationId: string) => void;
}

const getInitialSoundPref = (): boolean => {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem('connectly_sound_enabled');
  return stored !== null ? stored === 'true' : true;
};

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  isOpen: false,
  filter: 'all',
  soundEnabled: getInitialSoundPref(),

  setIsOpen: (isOpen) => set({ isOpen }),
  setFilter: (filter) => set({ filter }),

  toggleSound: () => {
    const next = !get().soundEnabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('connectly_sound_enabled', String(next));
    }
    set({ soundEnabled: next });
  },

  setUnreadCount: (unreadCount) => set({ unreadCount: Math.max(0, unreadCount) }),

  fetchNotifications: async () => {
    set({ isLoading: true });
    try {
      const res = await notificationService.getNotifications({ limit: 30 });
      set({
        notifications: res.notifications,
        unreadCount: res.unreadCount,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  addNotification: (notification) => {
    set((state) => {
      // Avoid duplicate notification items
      const exists = state.notifications.some((n) => n.id === notification.id);
      if (exists) return state;

      return {
        notifications: [notification, ...state.notifications],
        unreadCount: state.unreadCount + 1,
      };
    });
  },

  markAsRead: async (id) => {
    try {
      const updated = await notificationService.markAsRead(id);
      set((state) => ({
        notifications: state.notifications.map((n) => (n.id === id ? updated : n)),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
    } catch {
      // optimistic fallback
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, isRead: true } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
    }
  },

  markAllAsRead: async () => {
    try {
      await notificationService.markAllAsRead();
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
        unreadCount: 0,
      }));
    } catch {
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
        unreadCount: 0,
      }));
    }
  },

  markConversationNotificationsAsRead: (conversationId: string) => {
    set((state) => {
      let countReduced = 0;
      const updatedList = state.notifications.map((n) => {
        const convId = typeof n.conversation === 'string' ? n.conversation : n.conversation?.id;
        if (convId === conversationId && !n.isRead) {
          countReduced += 1;
          return { ...n, isRead: true };
        }
        return n;
      });

      return {
        notifications: updatedList,
        unreadCount: Math.max(0, state.unreadCount - countReduced),
      };
    });
  },
}));

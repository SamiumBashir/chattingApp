'use client';

import { useEffect } from 'react';
import { connectSocket, disconnectSocket, getSocket } from '../lib/socket';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useNotificationStore } from '../store/notificationStore';
import {
  playNotificationSound,
  showDesktopNotification,
  alertTabTitle,
  resetTabTitle,
  requestNotificationPermission,
} from '../lib/sound';
import type { Message, Reaction, Notification as AppNotification } from '../types';

export function useSocket() {
  const { isAuthenticated, user } = useAuthStore();
  const {
    activeConversationId,
    conversations,
    addMessage,
    updateMessageStatus,
    setTypingUser,
    setUserOnline,
    setOnlineUsers,
  } = useChatStore();

  // 1. Join / Leave active conversation room on change
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !activeConversationId) return;

    socket.emit('conversation:join', { conversationId: activeConversationId });

    return () => {
      socket.emit('conversation:leave', { conversationId: activeConversationId });
    };
  }, [activeConversationId]);

  // 2. Global socket lifecycle & event listeners
  useEffect(() => {
    if (!isAuthenticated || !user) {
      disconnectSocket();
      return;
    }

    const socket = connectSocket();

    // Auto-request browser desktop notification permission if supported & default
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'default'
    ) {
      requestNotificationPermission().catch(() => {});
    }

    // Reset alerting tab title when user switches back to this tab
    const handleReturnToTab = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        resetTabTitle();
        const activeId = useChatStore.getState().activeConversationId;
        if (activeId) {
          socket.emit('conversation:read', { conversationId: activeId });
          useNotificationStore.getState().markConversationNotificationsAsRead(activeId);
        }
      }
    };

    window.addEventListener('focus', handleReturnToTab);
    document.addEventListener('visibilitychange', handleReturnToTab);

    // 1. New incoming message
    const handleNewMessage = (message: Message) => {
      addMessage(message.conversation, message);

      const currentActiveId = useChatStore.getState().activeConversationId;
      const isCurrentConversation = message.conversation === currentActiveId;
      const isTabVisibleAndFocused =
        typeof document !== 'undefined' &&
        document.visibilityState === 'visible' &&
        document.hasFocus();

      // If user is actively reading this conversation inside this focused tab:
      if (isCurrentConversation && isTabVisibleAndFocused && message.sender?.id !== user.id) {
        socket.emit('message:read', {
          messageId: message.id,
          conversationId: message.conversation,
        });
        useNotificationStore.getState().markConversationNotificationsAsRead(message.conversation);
      } else if (message.sender?.id !== user.id) {
        // Message is unread! (Different conversation or user is in another tab / background)
        // A. Increment unread counter on that conversation
        useChatStore.getState().incrementUnread(message.conversation);

        // B. Play crystal notification bell chime!
        if (useNotificationStore.getState().soundEnabled) {
          playNotificationSound();
        }

        // C. If user is NOT in this tab (tab hidden, window blurred or in another tab): alert them!
        if (!isTabVisibleAndFocused) {
          const senderName = message.sender?.name || message.sender?.username || 'New message';
          const snippet =
            message.content || (message.attachments?.length ? 'Sent an attachment' : 'New message');

          // Flash tab title with notification bell
          alertTabTitle(senderName);

          // Show native desktop notification
          showDesktopNotification(senderName, snippet, () => {
            useChatStore.getState().setActiveConversation(message.conversation);
          });
        }
      }
    };

    // 2. Message status (delivered, read)
    const handleMessageStatus = (data: {
      messageId: string;
      conversationId: string;
      userId: string;
      status: 'delivered' | 'read';
    }) => {
      updateMessageStatus(data.conversationId, data.messageId, data.status);
    };

    // 3. Typing indicator
    const handleTypingUpdate = (data: {
      conversationId: string;
      userId: string;
      username: string;
      isTyping: boolean;
    }) => {
      if (data.userId !== user.id) {
        setTypingUser(data.conversationId, data.username, data.isTyping);
      }
    };

    // 4. Online Presence
    const handlePresenceOnline = (data: { userId: string; timestamp: string }) => {
      setUserOnline(data.userId, true);
    };

    const handlePresenceOffline = (data: { userId: string; lastSeen: string }) => {
      setUserOnline(data.userId, false);
    };

    // 5. Message Edit
    const handleMessageEdited = (updatedMessage: Message) => {
      addMessage(updatedMessage.conversation, updatedMessage);
    };

    // 6. Message Delete
    const handleMessageDeleted = (data: {
      messageId: string;
      conversationId: string;
      isDeleted: boolean;
      deletedAt: string;
    }) => {
      const state = useChatStore.getState();
      const currentList = state.messagesByConversation[data.conversationId] || [];
      const updated = currentList.map((m) =>
        m.id === data.messageId
          ? {
              ...m,
              content: 'This message was deleted',
              isDeleted: true,
              deletedAt: data.deletedAt,
              attachments: [],
              reactions: [],
            }
          : m
      );
      useChatStore.setState((s) => ({
        messagesByConversation: {
          ...s.messagesByConversation,
          [data.conversationId]: updated,
        },
      }));
    };

    // 7. Message Reactions
    const handleReactionUpdated = (data: {
      messageId: string;
      conversationId: string;
      reactions: Reaction[];
    }) => {
      const state = useChatStore.getState();
      const currentList = state.messagesByConversation[data.conversationId] || [];
      const updated = currentList.map((m) =>
        m.id === data.messageId ? { ...m, reactions: data.reactions } : m
      );
      useChatStore.setState((s) => ({
        messagesByConversation: {
          ...s.messagesByConversation,
          [data.conversationId]: updated,
        },
      }));
    };

    // 8. Notifications
    const handleNewNotification = (data: { notification: AppNotification }) => {
      if (data?.notification) {
        useNotificationStore.getState().addNotification(data.notification);
      }
    };

    const handleNotificationRead = (data: {
      notificationId?: string;
      all?: boolean;
      unreadCount: number;
    }) => {
      const state = useNotificationStore.getState();
      if (data.all) {
        useNotificationStore.setState({
          notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
          unreadCount: 0,
        });
      } else if (data.notificationId) {
        useNotificationStore.setState({
          notifications: state.notifications.map((n) =>
            n.id === data.notificationId ? { ...n, isRead: true } : n
          ),
          unreadCount: data.unreadCount,
        });
      }
    };

    const handleNotificationCount = (data: { unreadCount: number }) => {
      useNotificationStore.setState({ unreadCount: data.unreadCount });
    };

    const handleConversationRead = (data: { conversationId: string; userId: string }) => {
      if (data.userId === user.id) {
        // Multi-device sync: User marked conversation read on another device/tab
        useChatStore.setState((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === data.conversationId ? { ...c, unreadCount: 0 } : c
          ),
          activeConversation:
            state.activeConversation?.id === data.conversationId
              ? { ...state.activeConversation, unreadCount: 0 }
              : state.activeConversation,
        }));
        useNotificationStore.getState().markConversationNotificationsAsRead(data.conversationId);
      } else {
        // Peer read our messages: mark sent messages in this conversation as 'read'
        const state = useChatStore.getState();
        const currentList = state.messagesByConversation[data.conversationId] || [];
        const updated = currentList.map((m) =>
          m.status !== 'read' ? { ...m, status: 'read' as const } : m
        );
        useChatStore.setState((s) => ({
          messagesByConversation: {
            ...s.messagesByConversation,
            [data.conversationId]: updated,
          },
        }));
      }
    };

    const handleAuthRevoked = () => {
      disconnectSocket();
      useAuthStore.getState().logout().catch(() => {});
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    };

    socket.on('message:new', handleNewMessage);
    socket.on('message:status', handleMessageStatus);
    socket.on('typing:update', handleTypingUpdate);
    socket.on('presence:online', handlePresenceOnline);
    socket.on('presence:offline', handlePresenceOffline);
    socket.on('message:edited', handleMessageEdited);
    socket.on('message:deleted', handleMessageDeleted);
    socket.on('message:reaction-updated', handleReactionUpdated);
    socket.on('conversation:read', handleConversationRead);
    socket.on('notification:new', handleNewNotification);
    socket.on('notification:read', handleNotificationRead);
    socket.on('notification:count', handleNotificationCount);
    socket.on('auth:revoked', handleAuthRevoked);

    // Initial presence check for peers
    const allPeerUserIds = conversations
      .flatMap((c) => c.participants.map((p) => p.user?.id))
      .filter((id): id is string => Boolean(id && id !== user.id));

    if (allPeerUserIds.length > 0) {
      socket.emit(
        'presence:subscribe',
        { userIds: allPeerUserIds },
        (res?: { statuses?: Record<string, boolean> }) => {
          if (res?.statuses) {
            const online = Object.keys(res.statuses).filter((id) => res.statuses![id]);
            setOnlineUsers(online);
          }
        }
      );
    }

    return () => {
      window.removeEventListener('focus', handleReturnToTab);
      document.removeEventListener('visibilitychange', handleReturnToTab);

      socket.off('message:new', handleNewMessage);
      socket.off('message:status', handleMessageStatus);
      socket.off('typing:update', handleTypingUpdate);
      socket.off('presence:online', handlePresenceOnline);
      socket.off('presence:offline', handlePresenceOffline);
      socket.off('message:edited', handleMessageEdited);
      socket.off('message:deleted', handleMessageDeleted);
      socket.off('message:reaction-updated', handleReactionUpdated);
      socket.off('conversation:read', handleConversationRead);
      socket.off('notification:new', handleNewNotification);
      socket.off('notification:read', handleNotificationRead);
      socket.off('notification:count', handleNotificationCount);
      socket.off('auth:revoked', handleAuthRevoked);
    };
  }, [
    isAuthenticated,
    user,
    conversations,
    addMessage,
    updateMessageStatus,
    setTypingUser,
    setUserOnline,
    setOnlineUsers,
  ]);
}

'use client';

import { useEffect } from 'react';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useNotificationStore } from '../store/notificationStore';
import { playNotificationSound, showDesktopNotification } from '../lib/sound';
import { Message, Reaction, Notification } from '../types';

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

  useEffect(() => {
    if (!isAuthenticated || !user) {
      disconnectSocket();
      return;
    }

    const socket = connectSocket();

    // 1. New message
    const handleNewMessage = (message: Message) => {
      addMessage(message.conversation, message);

      const isCurrentConversation = message.conversation === activeConversationId;
      const isWindowFocused = typeof document !== 'undefined' && document.hasFocus();

      // If user is actively inside this conversation and window is focused:
      if (isCurrentConversation && isWindowFocused && message.sender?.id !== user.id) {
        socket.emit('message:read', {
          messageId: message.id,
          conversationId: message.conversation,
        });
        // Conversation is read, clear notifications for this conversation
        useNotificationStore.getState().markConversationNotificationsAsRead(message.conversation);
      } else if (message.sender?.id !== user.id) {
        // Message is unread! (Different conversation or window is in background)
        // 1. Increment unread counter on that conversation
        useChatStore.getState().incrementUnread(message.conversation);

        // 2. Play gentle audio chime if user enabled sound
        if (useNotificationStore.getState().soundEnabled) {
          playNotificationSound();
        }

        // 3. Native desktop notification if permitted
        const senderName = message.sender?.name || message.sender?.username || 'New message';
        const snippet = message.content || (message.attachments?.length ? 'Sent an attachment' : 'New message');
        showDesktopNotification(senderName, snippet, () => {
          useChatStore.getState().setActiveConversation(message.conversation);
        });
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
      // Ignore self typing events
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
    const handleNewNotification = (data: { notification: Notification }) => {
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
      if (data.userId !== user.id) {
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

    // Join active conversation room if set
    if (activeConversationId) {
      socket.emit('conversation:join', { conversationId: activeConversationId });
    }

    return () => {
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
    };
  }, [
    isAuthenticated,
    user,
    activeConversationId,
    conversations,
    addMessage,
    updateMessageStatus,
    setTypingUser,
    setUserOnline,
    setOnlineUsers,
  ]);
}

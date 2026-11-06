import { create } from 'zustand';
import { Conversation, Message, User, Attachment } from '../types';
import { conversationService } from '../services/conversation.service';
import { messageService } from '../services/message.service';
import { getSocket } from '../lib/socket';

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  activeConversation: Conversation | null;
  isLoadingConversations: boolean;
  searchTerm: string;
  filterType: 'all' | 'private' | 'group';
  isDetailsOpen: boolean;
  isNewChatOpen: boolean;
  isSearchOpen: boolean;
  isSettingsOpen: boolean;

  // Real-time messages state
  messagesByConversation: Record<string, Message[]>;
  isLoadingMessages: boolean;
  hasMoreByConversation: Record<string, boolean>;
  nextCursorByConversation: Record<string, string | null>;

  // Phase 5 Experience State
  replyingToMessage: Message | null;
  editingMessage: Message | null;
  typingUsers: Record<string, string[]>; // conversationId -> usernames array
  onlineUsers: Set<string>;

  // Actions
  setConversations: (conversations: Conversation[]) => void;
  setActiveConversation: (id: string | null) => void;
  setSearchTerm: (term: string) => void;
  setFilterType: (type: 'all' | 'private' | 'group') => void;
  setIsDetailsOpen: (open: boolean) => void;
  setIsNewChatOpen: (open: boolean) => void;
  setIsSearchOpen: (open: boolean) => void;
  setIsSettingsOpen: (open: boolean) => void;
  fetchConversations: () => Promise<void>;
  upsertConversation: (conversation: Conversation) => void;
  removeConversation: (id: string) => void;
  markConversationAsRead: (id: string) => void;
  incrementUnread: (id: string) => void;

  // Message actions
  fetchMessages: (conversationId: string, loadMore?: boolean) => Promise<void>;
  addMessage: (conversationId: string, message: Message) => void;
  updateMessageStatus: (
    conversationId: string,
    clientMessageId: string,
    status: Message['status'],
    persistedMessage?: Message
  ) => void;
  sendMessageOptimistic: (
    conversationId: string,
    content: string,
    currentUser: User,
    replyToId?: string | null,
    attachments?: Attachment[],
    type?: 'text' | 'image' | 'file'
  ) => Promise<void>;

  // Phase 5 Actions
  setReplyingToMessage: (message: Message | null) => void;
  setEditingMessage: (message: Message | null) => void;
  setTypingUser: (conversationId: string, username: string, isTyping: boolean) => void;
  setUserOnline: (userId: string, isOnline: boolean) => void;
  setOnlineUsers: (userIds: string[]) => void;
  editMessageAction: (conversationId: string, messageId: string, content: string) => Promise<void>;
  deleteMessageAction: (conversationId: string, messageId: string) => Promise<void>;
  toggleReactionAction: (
    conversationId: string,
    messageId: string,
    emoji: string,
    currentUserId: string
  ) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  activeConversation: null,
  isLoadingConversations: false,
  searchTerm: '',
  filterType: 'all',
  isDetailsOpen: false,
  isNewChatOpen: false,
  isSearchOpen: false,
  isSettingsOpen: false,

  messagesByConversation: {},
  isLoadingMessages: false,
  hasMoreByConversation: {},
  nextCursorByConversation: {},

  replyingToMessage: null,
  editingMessage: null,
  typingUsers: {},
  onlineUsers: new Set<string>(),

  setConversations: (conversations) => set({ conversations }),

  setActiveConversation: (id) => {
    if (!id) {
      set({
        activeConversationId: null,
        activeConversation: null,
        replyingToMessage: null,
        editingMessage: null,
      });
      return;
    }
    const found = get().conversations.find((c) => c.id === id) || null;
    set({
      activeConversationId: id,
      activeConversation: found ? { ...found, unreadCount: 0 } : null,
      replyingToMessage: null,
      editingMessage: null,
    });

    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('conversation:join', { conversationId: id });
    }

    // Automatically mark conversation as read
    get().markConversationAsRead(id);

    if (!get().messagesByConversation[id]) {
      get().fetchMessages(id);
    }
  },

  markConversationAsRead: (conversationId: string) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c
      ),
      activeConversation:
        state.activeConversation?.id === conversationId
          ? { ...state.activeConversation, unreadCount: 0 }
          : state.activeConversation,
    }));

    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('conversation:read', { conversationId });
    }
    conversationService.markAsRead(conversationId).catch(() => {});
  },

  incrementUnread: (conversationId: string) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, unreadCount: (c.unreadCount || 0) + 1 }
          : c
      ),
    }));
  },

  setSearchTerm: (searchTerm) => set({ searchTerm }),
  setFilterType: (filterType) => set({ filterType }),
  setIsDetailsOpen: (isDetailsOpen) => set({ isDetailsOpen }),
  setIsNewChatOpen: (isNewChatOpen) => set({ isNewChatOpen }),
  setIsSearchOpen: (isSearchOpen) => set({ isSearchOpen }),
  setIsSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),

  fetchConversations: async () => {
    set({ isLoadingConversations: true });
    try {
      const res = await conversationService.listConversations();
      set({ conversations: res.conversations, isLoadingConversations: false });

      const currentActiveId = get().activeConversationId;
      if (currentActiveId) {
        const updated = res.conversations.find((c) => c.id === currentActiveId) || null;
        set({ activeConversation: updated });
      }
    } catch {
      set({ isLoadingConversations: false });
    }
  },

  upsertConversation: (conversation) => {
    const list = [...get().conversations];
    const index = list.findIndex((c) => c.id === conversation.id);
    if (index >= 0) {
      list[index] = conversation;
    } else {
      list.unshift(conversation);
    }
    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    set({
      conversations: list,
      activeConversation:
        get().activeConversationId === conversation.id ? conversation : get().activeConversation,
    });
  },

  removeConversation: (id) => {
    const list = get().conversations.filter((c) => c.id !== id);
    set({
      conversations: list,
      activeConversationId: get().activeConversationId === id ? null : get().activeConversationId,
      activeConversation: get().activeConversationId === id ? null : get().activeConversation,
    });
  },

  fetchMessages: async (conversationId: string, loadMore = false) => {
    set({ isLoadingMessages: true });
    try {
      const cursor = loadMore ? get().nextCursorByConversation[conversationId] || undefined : undefined;
      const res = await messageService.getMessages(conversationId, cursor, 50);

      const existingMessages = get().messagesByConversation[conversationId] || [];
      const updatedMessages = loadMore
        ? [...res.messages, ...existingMessages]
        : res.messages;

      set((state) => ({
        isLoadingMessages: false,
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: updatedMessages,
        },
        hasMoreByConversation: {
          ...state.hasMoreByConversation,
          [conversationId]: res.meta.hasMore,
        },
        nextCursorByConversation: {
          ...state.nextCursorByConversation,
          [conversationId]: res.meta.nextCursor || null,
        },
      }));
    } catch {
      set({ isLoadingMessages: false });
    }
  },

  addMessage: (conversationId: string, message: Message) => {
    const existing = get().messagesByConversation[conversationId] || [];
    const index = existing.findIndex(
      (m) => m.id === message.id || m.clientMessageId === message.clientMessageId
    );

    let updated: Message[];
    if (index >= 0) {
      updated = [...existing];
      updated[index] = { ...updated[index], ...message, status: 'sent' };
    } else {
      updated = [...existing, { ...message, status: 'sent' }];
    }

    set((state) => ({
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: updated,
      },
    }));

    const conv = get().conversations.find((c) => c.id === conversationId);
    if (conv) {
      const isActive = get().activeConversationId === conversationId;
      get().upsertConversation({
        ...conv,
        unreadCount: isActive ? 0 : conv.unreadCount,
        lastMessage: {
          messageId: message.id,
          content: message.content,
          sender: message.sender,
          type: message.type,
          createdAt: message.createdAt,
        },
        updatedAt: message.createdAt,
      });
    }
  },

  updateMessageStatus: (conversationId, clientMessageId, status, persistedMessage) => {
    const existing = get().messagesByConversation[conversationId] || [];
    const updated = existing.map((m) => {
      if (m.clientMessageId === clientMessageId) {
        return persistedMessage
          ? { ...persistedMessage, status }
          : { ...m, status };
      }
      return m;
    });

    set((state) => ({
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: updated,
      },
    }));
  },

  sendMessageOptimistic: async (
    conversationId: string,
    content: string,
    currentUser: User,
    replyToId?: string | null,
    attachments?: Attachment[],
    type?: 'text' | 'image' | 'file'
  ) => {
    const clientMessageId = crypto.randomUUID();
    const replyMessage = get().replyingToMessage;
    const resolvedType =
      type ||
      (attachments && attachments.length > 0
        ? attachments[0].fileType.startsWith('image/')
          ? 'image'
          : 'file'
        : 'text');

    const sanitizedAttachments: Attachment[] = (attachments || []).map((att) => ({
      url: att.url,
      secureUrl: att.secureUrl || att.url,
      publicId: att.publicId || `att-${Date.now()}`,
      fileName: att.fileName || 'file',
      fileType: att.fileType || 'application/octet-stream',
      fileSize: att.fileSize || 0,
    }));

    const optimisticMessage: Message = {
      id: `temp-${clientMessageId}`,
      conversation: conversationId,
      sender: currentUser,
      clientMessageId,
      content,
      type: resolvedType,
      attachments: sanitizedAttachments,
      reactions: [],
      replyTo: replyMessage || undefined,
      isEdited: false,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'sending',
    };

    // Clear replying state
    set({ replyingToMessage: null });

    const currentList = get().messagesByConversation[conversationId] || [];
    set((state) => ({
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: [...currentList, optimisticMessage],
      },
    }));

    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit(
        'message:send',
        {
          conversationId,
          clientMessageId,
          content,
          type: resolvedType,
          attachments: sanitizedAttachments,
          replyTo: replyToId || (replyMessage ? replyMessage.id : null),
        },
        (response: { success: boolean; message?: Message; error?: string }) => {
          if (response?.success && response.message) {
            get().updateMessageStatus(conversationId, clientMessageId, 'sent', response.message);
          } else {
            get().updateMessageStatus(conversationId, clientMessageId, 'failed');
          }
        }
      );
    } else {
      try {
        const persisted = await messageService.sendMessage(conversationId, {
          clientMessageId,
          content,
          type: resolvedType,
          attachments: sanitizedAttachments,
          replyTo: replyToId || (replyMessage ? replyMessage.id : null),
        });
        get().updateMessageStatus(conversationId, clientMessageId, 'sent', persisted);
      } catch {
        get().updateMessageStatus(conversationId, clientMessageId, 'failed');
      }
    }
  },

  setReplyingToMessage: (replyingToMessage) => set({ replyingToMessage, editingMessage: null }),
  setEditingMessage: (editingMessage) => set({ editingMessage, replyingToMessage: null }),

  setTypingUser: (conversationId, username, isTyping) => {
    const current = get().typingUsers[conversationId] || [];
    let updated: string[];
    if (isTyping) {
      updated = Array.from(new Set([...current, username]));
    } else {
      updated = current.filter((u) => u !== username);
    }
    set((state) => ({
      typingUsers: {
        ...state.typingUsers,
        [conversationId]: updated,
      },
    }));
  },

  setUserOnline: (userId, isOnline) => {
    const updated = new Set(get().onlineUsers);
    if (isOnline) {
      updated.add(userId);
    } else {
      updated.delete(userId);
    }
    set({ onlineUsers: updated });
  },

  setOnlineUsers: (userIds) => {
    set({ onlineUsers: new Set(userIds) });
  },

  editMessageAction: async (conversationId, messageId, content) => {
    // 1. Optimistic update
    const currentList = get().messagesByConversation[conversationId] || [];
    const updated = currentList.map((m) =>
      m.id === messageId ? { ...m, content, isEdited: true, editedAt: new Date().toISOString() } : m
    );
    set((state) => ({
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: updated,
      },
      editingMessage: null,
    }));

    // 2. Transmit via socket or REST
    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('message:edit', { messageId, conversationId, content });
    } else {
      await messageService.editMessage(messageId, content);
    }
  },

  deleteMessageAction: async (conversationId, messageId) => {
    // 1. Optimistic update
    const currentList = get().messagesByConversation[conversationId] || [];
    const updated = currentList.map((m) =>
      m.id === messageId
        ? {
            ...m,
            content: 'This message was deleted',
            isDeleted: true,
            deletedAt: new Date().toISOString(),
            attachments: [],
            reactions: [],
          }
        : m
    );
    set((state) => ({
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: updated,
      },
    }));

    // 2. Transmit via socket or REST
    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('message:delete', { messageId, conversationId });
    } else {
      await messageService.deleteMessage(messageId);
    }
  },

  toggleReactionAction: async (conversationId, messageId, emoji, currentUserId) => {
    // Optimistic reaction update
    const currentList = get().messagesByConversation[conversationId] || [];
    const message = currentList.find((m) => m.id === messageId);
    if (!message) return;

    const existingIndex = message.reactions?.findIndex(
      (r) => (typeof r.user === 'string' ? r.user : r.user.id) === currentUserId
    );

    let updatedReactions = [...(message.reactions || [])];
    const isRemoving = existingIndex >= 0 && updatedReactions[existingIndex].emoji === emoji;

    if (isRemoving) {
      updatedReactions = updatedReactions.filter(
        (r) => (typeof r.user === 'string' ? r.user : r.user.id) !== currentUserId
      );
    } else if (existingIndex >= 0) {
      updatedReactions[existingIndex] = {
        ...updatedReactions[existingIndex],
        emoji,
        createdAt: new Date().toISOString(),
      };
    } else {
      updatedReactions.push({
        user: currentUserId,
        emoji,
        createdAt: new Date().toISOString(),
      });
    }

    const updatedMessages = currentList.map((m) =>
      m.id === messageId ? { ...m, reactions: updatedReactions } : m
    );

    set((state) => ({
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: updatedMessages,
      },
    }));

    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('message:reaction', {
        messageId,
        conversationId,
        emoji,
        action: isRemoving ? 'remove' : 'add',
      });
    } else {
      if (isRemoving) {
        await messageService.removeReaction(messageId);
      } else {
        await messageService.addReaction(messageId, emoji);
      }
    }
  },
}));

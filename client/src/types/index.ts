export type UserRole = 'user' | 'admin' | 'superadmin';
export type UserStatus = 'active' | 'suspended' | 'banned' | 'deactivated';

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  avatar?: string;
  bio?: string;
  role: UserRole;
  status: UserStatus;
  isEmailVerified: boolean;
  lastSeen?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Participant {
  user: User;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  lastReadMessage?: string;
}

export type ConversationType = 'private' | 'group';

export interface LastMessage {
  messageId: string;
  content: string;
  sender: string | User;
  type: 'text' | 'image' | 'file' | 'system';
  createdAt: string;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  participants: Participant[];
  groupName?: string;
  groupAvatar?: string;
  groupDescription?: string;
  createdBy: string;
  lastMessage?: LastMessage;
  unreadCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  url: string;
  secureUrl: string;
  publicId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

export interface Reaction {
  user: string | User;
  emoji: string;
  createdAt: string;
}

export interface Message {
  id: string;
  conversation: string;
  sender: User;
  clientMessageId: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'system';
  attachments: Attachment[];
  replyTo?: Message;
  reactions: Reaction[];
  isEdited: boolean;
  editedAt?: string;
  isDeleted: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
  // Local delivery status for optimistic updates
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
    nextCursor?: string;
  };
}

export type NotificationType =
  | 'message'
  | 'mention'
  | 'reaction'
  | 'group_invite'
  | 'system';

export interface Notification {
  id: string;
  recipient: string;
  actor?: User;
  type: NotificationType;
  conversation?: Conversation;
  message?: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
}


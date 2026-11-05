import React from 'react';
import { Conversation, User } from '@/types';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn, formatDate } from '@/lib/utils';
import { Users } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';

interface ConversationItemProps {
  conversation: Conversation;
  currentUserId: string;
  isActive: boolean;
  onClick: () => void;
}

export function ConversationItem({
  conversation,
  currentUserId,
  isActive,
  onClick,
}: ConversationItemProps) {
  const { onlineUsers } = useChatStore();

  // If private, find the other participant
  const otherParticipant =
    conversation.type === 'private'
      ? conversation.participants.find((p) => p.user?.id !== currentUserId)?.user
      : null;

  const isOnline = otherParticipant ? onlineUsers.has(otherParticipant.id) : undefined;

  const displayName =
    conversation.type === 'group'
      ? conversation.groupName || 'Group Chat'
      : otherParticipant?.name || otherParticipant?.username || 'Direct Message';

  const displayAvatar =
    conversation.type === 'group'
      ? conversation.groupAvatar
      : otherParticipant?.avatar;

  const lastMessageText = conversation.lastMessage
    ? conversation.lastMessage.content || `[${conversation.lastMessage.type}]`
    : 'No messages yet';

  const timeString = conversation.lastMessage
    ? formatDate(conversation.lastMessage.createdAt)
    : formatDate(conversation.updatedAt);

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors relative select-none',
        isActive
          ? 'bg-chat-activeItem border border-primary/20 shadow-xs'
          : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
      )}
    >
      <div className="relative shrink-0">
        {conversation.type === 'group' ? (
          <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold ring-1 ring-border">
            {displayAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={displayAvatar}
                alt={displayName}
                className="aspect-square h-full w-full rounded-full object-cover"
              />
            ) : (
              <Users className="h-5 w-5" />
            )}
          </div>
        ) : (
          <Avatar
            src={displayAvatar}
            name={displayName}
            size="md"
            isOnline={isOnline}
            className="h-11 w-11"
          />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span
            className={cn(
              'font-semibold text-sm truncate',
              isActive ? 'text-foreground font-bold' : 'text-foreground'
            )}
          >
            {displayName}
          </span>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap ml-2">
            {timeString}
          </span>
        </div>

        <div className="flex items-center justify-between gap-1">
          <p className="text-xs text-muted-foreground truncate max-w-[190px]">
            {lastMessageText}
          </p>

          {conversation.unreadCount && conversation.unreadCount > 0 ? (
            <Badge variant="default" className="h-4 min-w-[16px] px-1 text-[10px] rounded-full">
              {conversation.unreadCount}
            </Badge>
          ) : null}
        </div>
      </div>
    </button>
  );
}


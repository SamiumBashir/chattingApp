'use client';

import React from 'react';
import { ArrowLeft, MoreVertical, Info, Users, Phone, Video } from 'lucide-react';
import { Conversation, User } from '@/types';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/store/chatStore';
import { useCall } from '@/features/call/CallContext';

interface ConversationHeaderProps {
  conversation: Conversation;
  currentUserId: string;
}

export function ConversationHeader({
  conversation,
  currentUserId,
}: ConversationHeaderProps) {
  const { setActiveConversation, isDetailsOpen, setIsDetailsOpen, onlineUsers } = useChatStore();
  const { startCall, callState } = useCall();

  const otherUser =
    conversation.type === 'private'
      ? conversation.participants.find((p) => p.user?.id !== currentUserId)?.user
      : null;

  const isOnline = otherUser ? onlineUsers.has(otherUser.id) : undefined;

  const displayName =
    conversation.type === 'group'
      ? conversation.groupName || 'Group Chat'
      : otherUser?.name || otherUser?.username || 'User';

  const displayAvatar =
    conversation.type === 'group'
      ? conversation.groupAvatar
      : otherUser?.avatar;

  const subtitle =
    conversation.type === 'group'
      ? `${conversation.participants.length} members`
      : isOnline
      ? 'Active now'
      : otherUser?.bio || (otherUser?.username ? `@${otherUser.username}` : 'Offline');

  return (
    <div className="flex h-16 w-full items-center justify-between border-b bg-card px-4 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile back button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setActiveConversation(null)}
          className="md:hidden h-8 w-8 text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <button
          type="button"
          onClick={() => setIsDetailsOpen(true)}
          className="flex items-center gap-3 min-w-0 text-left hover:opacity-85 transition-opacity"
          title="View profile & details"
        >
          <div className="relative shrink-0">
            {conversation.type === 'group' ? (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold ring-1 ring-border">
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
              />
            )}
          </div>

          <div className="truncate">
            <h3 className="font-bold text-sm text-foreground truncate">{displayName}</h3>
            <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
          </div>
        </button>
      </div>

      <div className="flex items-center gap-1">
        {conversation.type === 'private' && otherUser && (
          <>
            <Button
              variant="ghost"
              size="icon"
              disabled={callState !== 'idle'}
              onClick={() =>
                startCall(
                  {
                    id: otherUser.id,
                    name: otherUser.name || otherUser.username,
                    username: otherUser.username,
                    avatar: otherUser.avatar,
                  },
                  conversation.id,
                  'audio'
                )
              }
              className="h-9 w-9 text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors"
              title="Voice Call"
            >
              <Phone className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              disabled={callState !== 'idle'}
              onClick={() =>
                startCall(
                  {
                    id: otherUser.id,
                    name: otherUser.name || otherUser.username,
                    username: otherUser.username,
                    avatar: otherUser.avatar,
                  },
                  conversation.id,
                  'video'
                )
              }
              className="h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="Video Call"
            >
              <Video className="h-4 w-4" />
            </Button>
          </>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsDetailsOpen(!isDetailsOpen)}
          className={`h-9 w-9 text-muted-foreground hover:text-foreground ${
            isDetailsOpen ? 'bg-muted text-foreground' : ''
          }`}
          title="Conversation details"
        >
          <Info className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}


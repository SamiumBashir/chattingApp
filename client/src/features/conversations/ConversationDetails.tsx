'use client';

import React, { useState } from 'react';
import { X, Users, Shield, UserMinus, LogOut, Ban, CheckCircle2 } from 'lucide-react';
import { Conversation, User } from '@/types';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { conversationService } from '@/services/conversation.service';
import { userService } from '@/services/user.service';
import { useChatStore } from '@/store/chatStore';
import { formatDate } from '@/lib/utils';

interface ConversationDetailsProps {
  conversation: Conversation;
  currentUserId: string;
  onClose: () => void;
}

export function ConversationDetails({
  conversation,
  currentUserId,
  onClose,
}: ConversationDetailsProps) {
  const { upsertConversation, removeConversation } = useChatStore();
  const [isLoading, setIsLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const isGroup = conversation.type === 'group';
  const otherParticipant = !isGroup
    ? conversation.participants.find((p) => p.user?.id !== currentUserId)?.user
    : null;

  const currentRole = conversation.participants.find(
    (p) => p.user?.id === currentUserId
  )?.role;
  const isOwnerOrAdmin = currentRole === 'owner' || currentRole === 'admin';

  const handleLeaveGroup = async () => {
    if (!confirm('Are you sure you want to leave this group?')) return;
    setIsLoading(true);
    try {
      await conversationService.leaveGroup(conversation.id);
      removeConversation(conversation.id);
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to leave group');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    if (!confirm('Remove this member from the group?')) return;
    setIsLoading(true);
    try {
      const updated = await conversationService.removeMember(conversation.id, targetUserId);
      upsertConversation(updated);
    } catch (err: any) {
      alert(err.message || 'Failed to remove member');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBlockUser = async (targetUserId: string) => {
    if (!confirm('Block this user? You will no longer receive messages from them.')) return;
    setIsLoading(true);
    try {
      await userService.blockUser(targetUserId);
      setActionMessage('User has been blocked');
    } catch (err: any) {
      alert(err.message || 'Failed to block user');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full w-80 flex-col border-l bg-card shrink-0">
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b px-4">
        <h3 className="font-bold text-sm text-foreground">
          {isGroup ? 'Group Information' : 'Contact Details'}
        </h3>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Profile Card */}
        <div className="flex flex-col items-center text-center">
          {isGroup ? (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold ring-2 ring-border mb-3">
              <Users className="h-10 w-10" />
            </div>
          ) : (
            <Avatar
              src={otherParticipant?.avatar}
              name={otherParticipant?.name || 'User'}
              size="xl"
              className="h-20 w-20 mb-3"
            />
          )}

          <h4 className="font-bold text-base text-foreground">
            {isGroup ? conversation.groupName : otherParticipant?.name}
          </h4>

          <p className="text-xs text-muted-foreground mt-0.5">
            {isGroup
              ? `${conversation.participants.length} members`
              : `@${otherParticipant?.username || 'user'}`}
          </p>

          {actionMessage && (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs text-emerald-600 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" /> {actionMessage}
            </div>
          )}
        </div>

        {/* Bio / Description */}
        <div>
          <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            {isGroup ? 'About Group' : 'Bio'}
          </h5>
          <p className="text-xs text-foreground bg-muted/40 p-3 rounded-lg border">
            {isGroup
              ? conversation.groupDescription || 'No description provided'
              : otherParticipant?.bio || 'No bio available'}
          </p>
        </div>

        {/* Group Participants List */}
        {isGroup && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Members ({conversation.participants.length})
              </h5>
            </div>

            <div className="space-y-2">
              {conversation.participants.map((p) => {
                const user = p.user;
                const isSelf = user?.id === currentUserId;
                const canRemove =
                  isOwnerOrAdmin && !isSelf && p.role !== 'owner';

                return (
                  <div
                    key={user?.id || Math.random()}
                    className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar src={user?.avatar} name={user?.name || 'User'} size="sm" />
                      <div className="truncate">
                        <p className="font-semibold text-foreground truncate">
                          {user?.name} {isSelf && '(You)'}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          @{user?.username}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {p.role === 'owner' && (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0">
                          Owner
                        </Badge>
                      )}
                      {p.role === 'admin' && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          Admin
                        </Badge>
                      )}
                      {canRemove && (
                        <button
                          onClick={() => handleRemoveMember(user.id)}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Remove member"
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions section */}
        <div className="pt-4 border-t space-y-2">
          {isGroup ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleLeaveGroup}
              isLoading={isLoading}
              className="w-full gap-2 text-xs"
            >
              <LogOut className="h-4 w-4" /> Leave Group
            </Button>
          ) : (
            otherParticipant && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBlockUser(otherParticipant.id)}
                isLoading={isLoading}
                className="w-full gap-2 text-xs text-destructive hover:bg-destructive/10"
              >
                <Ban className="h-4 w-4" /> Block User
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}


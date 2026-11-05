'use client';

import React, { useState, useEffect } from 'react';
import { X, Search, Users, User as UserIcon, Check, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { userService } from '@/services/user.service';
import { conversationService } from '@/services/conversation.service';
import { useChatStore } from '@/store/chatStore';
import { User } from '@/types';

interface NewConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
}

export function NewConversationModal({
  isOpen,
  onClose,
  currentUserId,
}: NewConversationModalProps) {
  const { upsertConversation, setActiveConversation } = useChatStore();
  const [mode, setMode] = useState<'direct' | 'group'>('direct');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Group form state
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  // Search users on query change (debounced)
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      setError(null);
      try {
        const users = await userService.searchUsers(searchQuery.trim());
        setSearchResults(users.filter((u) => u.id !== currentUserId));
      } catch (err: any) {
        setError(err.message || 'Failed to search users');
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, isOpen, currentUserId]);

  if (!isOpen) return null;

  const handleStartDirectChat = async (recipientId: string) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const conv = await conversationService.createPrivate(recipientId);
      upsertConversation(conv);
      setActiveConversation(conv.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to start conversation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      setError('Please provide a group name');
      return;
    }
    if (selectedUserIds.length === 0) {
      setError('Please select at least one member to join the group');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const conv = await conversationService.createGroup({
        groupName: groupName.trim(),
        groupDescription: groupDescription.trim() || undefined,
        participantIds: selectedUserIds,
      });
      upsertConversation(conv);
      setActiveConversation(conv.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create group');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleSelectUser = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      setSelectedUserIds(selectedUserIds.filter((id) => id !== userId));
    } else {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-md rounded-xl border bg-card p-6 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b">
          <h3 className="text-lg font-bold text-foreground">New Conversation</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="mt-4 flex rounded-lg bg-muted p-1">
          <button
            onClick={() => setMode('direct')}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
              mode === 'direct'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <UserIcon className="h-3.5 w-3.5" /> Direct Message
          </button>
          <button
            onClick={() => setMode('group')}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
              mode === 'group'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users className="h-3.5 w-3.5" /> New Group
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-md bg-destructive/10 p-2.5 text-xs text-destructive border border-destructive/20">
            {error}
          </div>
        )}

        {/* Group details if group mode */}
        {mode === 'group' && (
          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Group Name *
              </label>
              <Input
                placeholder="e.g. Engineering Team"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Description (Optional)
              </label>
              <Input
                placeholder="Topic or team purpose"
                value={groupDescription}
                onChange={(e) => setGroupDescription(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* User Search Input */}
        <div className="mt-4">
          <label className="block text-xs font-semibold text-foreground mb-1">
            {mode === 'direct' ? 'Search Users' : 'Select Members'}
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, username or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Search Results List */}
        <div className="mt-3 max-h-56 overflow-y-auto divide-y divide-border rounded-md border">
          {isSearching ? (
            <div className="flex items-center justify-center py-6 text-xs text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Searching users...
            </div>
          ) : searchResults.length > 0 ? (
            searchResults.map((user) => {
              const isSelected = selectedUserIds.includes(user.id);
              return (
                <div
                  key={user.id}
                  onClick={() =>
                    mode === 'direct'
                      ? handleStartDirectChat(user.id)
                      : toggleSelectUser(user.id)
                  }
                  className="flex items-center justify-between p-2.5 hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar src={user.avatar} name={user.name} size="sm" />
                    <div className="truncate">
                      <p className="text-xs font-semibold text-foreground truncate">{user.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">@{user.username}</p>
                    </div>
                  </div>

                  {mode === 'direct' ? (
                    <Button size="sm" variant="ghost" className="h-7 text-xs">
                      Chat
                    </Button>
                  ) : (
                    <div
                      className={`h-5 w-5 rounded border flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-input'
                      }`}
                    >
                      {isSelected && <Check className="h-3.5 w-3.5" />}
                    </div>
                  )}
                </div>
              );
            })
          ) : searchQuery.trim() ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              No users found matching &ldquo;{searchQuery}&rdquo;
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-muted-foreground">
              Type a name or username to find people
            </div>
          )}
        </div>

        {/* Group Submit Footer */}
        {mode === 'group' && (
          <div className="mt-4 flex items-center justify-between pt-3 border-t">
            <span className="text-xs text-muted-foreground">
              {selectedUserIds.length} members selected
            </span>
            <Button
              size="sm"
              onClick={handleCreateGroup}
              disabled={selectedUserIds.length === 0 || !groupName.trim()}
              isLoading={isSubmitting}
            >
              Create Group
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}


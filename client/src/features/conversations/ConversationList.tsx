'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Plus,
  MessageSquare,
  Users,
  MessageCircle,
  Settings,
  Sun,
  Moon,
  Shield,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { ConversationItem } from './ConversationItem';
import { useChatStore } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/lib/theme';

interface ConversationListProps {
  currentUserId: string;
}

export function ConversationList({ currentUserId }: ConversationListProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const { isDarkMode, toggleTheme } = useTheme();

  const {
    conversations,
    activeConversationId,
    setActiveConversation,
    searchTerm,
    setSearchTerm,
    filterType,
    setFilterType,
    setIsNewChatOpen,
    setIsSettingsOpen,
    isLoadingConversations,
  } = useChatStore();

  // Filter conversations by search query and type
  const filteredConversations = conversations.filter((c) => {
    // Filter by type
    if (filterType === 'private' && c.type !== 'private') return false;
    if (filterType === 'group' && c.type !== 'group') return false;

    // Filter by search query
    if (!searchTerm.trim()) return true;
    const query = searchTerm.toLowerCase();

    if (c.type === 'group') {
      return (
        c.groupName?.toLowerCase().includes(query) ||
        c.groupDescription?.toLowerCase().includes(query)
      );
    } else {
      const otherUser = c.participants.find((p) => p.user?.id !== currentUserId)?.user;
      return (
        otherUser?.name?.toLowerCase().includes(query) ||
        otherUser?.username?.toLowerCase().includes(query) ||
        otherUser?.email?.toLowerCase().includes(query)
      );
    }
  });

  return (
    <div className="flex h-full w-full flex-col bg-card border-r">
      {/* Mobile Top Profile & Quick Controls Bar */}
      <div className="sm:hidden flex items-center justify-between border-b bg-muted/30 px-3.5 py-2.5 shrink-0">
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          className="flex items-center gap-2.5 rounded-xl p-1 -ml-1 text-left hover:bg-muted/70 active:scale-95 transition-all min-w-0"
          title="Open User Profile & Settings"
          aria-label="Open User Profile & Settings"
        >
          <div className="relative shrink-0">
            <Avatar
              src={user?.avatar}
              name={user?.name || 'User'}
              size="sm"
              className="ring-2 ring-primary/20"
            />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-card" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground truncate max-w-[120px]">
              {user?.name || 'My Profile'}
            </p>
            <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">
              @{user?.username || 'user'} • Settings
            </p>
          </div>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95 transition-all"
            title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme"
          >
            {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {(user?.role === 'admin' || user?.role === 'superadmin') && (
            <button
              type="button"
              onClick={() => router.push('/admin')}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-primary hover:bg-primary/10 active:scale-95 transition-all"
              title="Admin Console"
              aria-label="Admin Console"
            >
              <Shield className="h-4 w-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95 transition-all"
            title="Settings & Privacy"
            aria-label="Settings and Privacy"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages Header */}
      <div className="p-3.5 sm:p-4 border-b flex items-center justify-between shrink-0">
        <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">Messages</h2>
        <Button
          size="sm"
          variant="default"
          onClick={() => setIsNewChatOpen(true)}
          className="h-8 gap-1.5 rounded-full px-3 text-xs"
        >
          <Plus className="h-4 w-4" /> New Chat
        </Button>
      </div>

      {/* Search Input */}
      <div className="p-3 border-b shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-xs bg-muted/40"
          />
        </div>

        {/* Filter Tabs */}
        <div className="mt-2.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              filterType === 'all'
                ? 'bg-primary text-primary-foreground font-semibold'
                : 'bg-muted/70 text-muted-foreground hover:text-foreground'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilterType('private')}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
              filterType === 'private'
                ? 'bg-primary text-primary-foreground font-semibold'
                : 'bg-muted/70 text-muted-foreground hover:text-foreground'
            }`}
          >
            <MessageCircle className="h-3 w-3" /> Direct
          </button>
          <button
            type="button"
            onClick={() => setFilterType('group')}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
              filterType === 'group'
                ? 'bg-primary text-primary-foreground font-semibold'
                : 'bg-muted/70 text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users className="h-3 w-3" /> Groups
          </button>
        </div>
      </div>

      {/* Conversations Scrollable List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoadingConversations ? (
          <div className="space-y-2 p-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
                <div className="h-11 w-11 rounded-full bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-24 bg-muted rounded" />
                  <div className="h-2.5 w-36 bg-muted/60 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations.length > 0 ? (
          filteredConversations.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              currentUserId={currentUserId}
              isActive={activeConversationId === conversation.id}
              onClick={() => setActiveConversation(conversation.id)}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center p-8 text-center h-48">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground mb-3">
              <MessageSquare className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold text-foreground">No conversations found</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
              {searchTerm
                ? 'Try a different search keyword'
                : 'Start a new direct chat or create a group to begin messaging'}
            </p>
            {!searchTerm && (
              <Button
                size="sm"
                variant="outline"
                className="mt-3 text-xs"
                onClick={() => setIsNewChatOpen(true)}
              >
                Start your first chat
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

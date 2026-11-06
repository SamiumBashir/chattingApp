'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  MessageSquare,
  Users,
  Settings,
  LogOut,
  Moon,
  Sun,
  Shield,
  Plus,
  Send,
  Paperclip,
  Smile,
  Loader2,
  Search,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { ConversationList } from '@/features/conversations/ConversationList';
import { ConversationHeader } from '@/features/conversations/ConversationHeader';
import { ConversationDetails } from '@/features/conversations/ConversationDetails';
import { NewConversationModal } from '@/features/conversations/NewConversationModal';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { MessageSearchModal } from '@/features/search/MessageSearchModal';
import { UserSettingsModal } from '@/features/profile/UserSettingsModal';
import { MessageList } from '@/features/chat/MessageList';
import { MessageComposer } from '@/features/chat/MessageComposer';
import { useSocket } from '@/hooks/useSocket';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

export default function ChatPage() {
  const router = useRouter();
  const { user, isAuthenticated, isInitialized, initialize, logout } = useAuthStore();
  const {
    activeConversation,
    activeConversationId,
    fetchConversations,
    messagesByConversation,
    isLoadingMessages,
    hasMoreByConversation,
    fetchMessages,
    isDetailsOpen,
    setIsDetailsOpen,
    isNewChatOpen,
    setIsNewChatOpen,
    setIsSearchOpen,
    setIsSettingsOpen,
  } = useChatStore();

  const [isDarkMode, setIsDarkMode] = useState(false);

  // Mount real-time Socket.IO gateway connection and events
  useSocket();

  // Initialize auth or perform instant client-side redirect for guests
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('connectly_access_token');
      if (!token && !document.cookie.includes('connectly_') && !document.cookie.includes('accessToken')) {
        router.replace('/login');
        return;
      }
    }
    initialize();
  }, [initialize, router]);

  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      router.replace('/login');
    } else if (isAuthenticated) {
      fetchConversations();
    }
  }, [isInitialized, isAuthenticated, router, fetchConversations]);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    if (!isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  if (!isInitialized || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground font-medium">Loading Connectly...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* 1. Left Icon Navigation Rail */}
      <aside className="hidden sm:flex h-full w-16 flex-col items-center justify-between border-r bg-card py-4 shrink-0 select-none">
        <div className="flex flex-col items-center gap-6">
          {/* Logo */}
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
            <MessageSquare className="h-5 w-5" />
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col items-center gap-2">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors"
              title="Chats"
            >
              <MessageSquare className="h-5 w-5" />
            </button>
            <button
              onClick={() => setIsSearchOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Search Messages"
            >
              <Search className="h-5 w-5" />
            </button>
            <button
              onClick={() => setIsNewChatOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="New Conversation"
            >
              <Plus className="h-5 w-5" />
            </button>
            <NotificationBell />
            {(user.role === 'admin' || user.role === 'superadmin') && (
              <button
                onClick={() => router.push('/admin')}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-primary hover:bg-primary/10 transition-colors"
                title="Admin Console"
              >
                <Shield className="h-5 w-5" />
              </button>
            )}
          </nav>
        </div>

        {/* Bottom Actions */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="User Settings"
          >
            <Settings className="h-4 w-4" />
          </button>

          <button
            onClick={toggleDarkMode}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Toggle theme"
          >
            {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <button
            onClick={handleLogout}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="rounded-full hover:ring-2 hover:ring-primary transition-all"
            title="Account"
          >
            <Avatar
              src={user.avatar}
              name={user.name}
              size="sm"
              className="ring-1 ring-border"
            />
          </button>
        </div>
      </aside>

      {/* 2. Conversations Sidebar Panel */}
      <div
        className={`${
          activeConversationId ? 'hidden md:flex' : 'flex'
        } h-full w-full md:w-80 lg:w-96 shrink-0 flex-col`}
      >
        <ConversationList currentUserId={user.id} />
      </div>

      {/* 3. Center Active Chat Viewport */}
      <main
        className={`${
          !activeConversationId ? 'hidden md:flex' : 'flex'
        } h-full flex-1 flex-col overflow-hidden bg-background`}
      >
        {activeConversation ? (
          <div className="flex h-full w-full flex-col">
            {/* Header */}
            <ConversationHeader
              conversation={activeConversation}
              currentUserId={user.id}
            />

            {/* Messages Scroll View */}
            <MessageList
              messages={
                activeConversationId
                  ? messagesByConversation[activeConversationId] || []
                  : []
              }
              currentUserId={user.id}
              isGroup={activeConversation.type === 'group'}
              isLoading={isLoadingMessages}
              hasMore={
                activeConversationId
                  ? hasMoreByConversation[activeConversationId] || false
                  : false
              }
              onLoadMore={() => {
                if (activeConversationId) {
                  fetchMessages(activeConversationId, true);
                }
              }}
            />

            {/* Message Composer */}
            <MessageComposer
              conversationId={activeConversation.id}
              currentUser={user}
            />
          </div>
        ) : (
          /* Empty Chat Placeholder State */
          <div className="flex h-full w-full flex-col items-center justify-center p-8 text-center select-none">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4 shadow-subtle">
              <MessageSquare className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-bold text-foreground">Your Messages</h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-md">
              Select a conversation from the sidebar or start a new direct chat or group to connect
              with your team.
            </p>
            <div className="mt-6 flex gap-3">
              <Button onClick={() => setIsNewChatOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Start New Conversation
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* 4. Right Conversation Details Panel */}
      {activeConversation && isDetailsOpen && (
        <ConversationDetails
          conversation={activeConversation}
          currentUserId={user.id}
          onClose={() => setIsDetailsOpen(false)}
        />
      )}

      {/* New Conversation Dialog Modal */}
      <NewConversationModal
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
        currentUserId={user.id}
      />

      {/* Message Search Modal */}
      <MessageSearchModal />

      {/* User Settings Modal */}
      <UserSettingsModal />
    </div>
  );
}


'use client';

import React, { useRef, useEffect } from 'react';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { Button } from '@/components/ui/button';
import { MessageSquare, Loader2 } from 'lucide-react';
import { Message } from '@/types';
import { useChatStore } from '@/store/chatStore';

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
  isGroup: boolean;
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

export function MessageList({
  messages,
  currentUserId,
  isGroup,
  isLoading,
  hasMore,
  onLoadMore,
}: MessageListProps) {
  const { activeConversationId, typingUsers } = useChatStore();
  const currentTyping = activeConversationId ? typingUsers[activeConversationId] || [] : [];

  const scrollBottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages or typing change
  useEffect(() => {
    scrollBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, currentTyping.length]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-2">
      {/* Load earlier messages button */}
      {hasMore && (
        <div className="flex justify-center py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onLoadMore}
            isLoading={isLoading}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Load earlier messages
          </Button>
        </div>
      )}

      {/* Messages */}
      {messages.length > 0 ? (
        messages.map((message) => (
          <MessageBubble
            key={message.id || message.clientMessageId}
            message={message}
            currentUserId={currentUserId}
            isGroup={isGroup}
          />
        ))
      ) : (
        <div className="flex h-full flex-col items-center justify-center py-16 text-center select-none">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
            <MessageSquare className="h-6 w-6" />
          </div>
          <h4 className="text-sm font-semibold text-foreground">No messages yet</h4>
          <p className="text-xs text-muted-foreground max-w-xs mt-1">
            Send a message below to start the conversation!
          </p>
        </div>
      )}

      <TypingIndicator typingUsers={currentTyping} />
      <div ref={scrollBottomRef} />
    </div>
  );
}


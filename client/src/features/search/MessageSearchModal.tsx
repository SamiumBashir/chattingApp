'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, X, MessageSquare, Loader2, Calendar } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { searchService } from '@/services/search.service';
import { Message } from '@/types';
import { Avatar } from '@/components/ui/avatar';
import { formatDate } from '@/lib/utils';

export function MessageSearchModal() {
  const { isSearchOpen, setIsSearchOpen, setActiveConversation } = useChatStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
      setHasSearched(false);
    }
  }, [isSearchOpen]);

  // Debounced search
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setIsLoading(false);
      setHasSearched(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await searchService.searchMessages(trimmed);
        setResults(data.messages);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
        setHasSearched(true);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen, setIsSearchOpen]);

  if (!isSearchOpen) return null;

  const handleSelectMessage = (message: Message) => {
    const convId = typeof message.conversation === 'string'
      ? message.conversation
      : (message.conversation as any)?.id;
    if (convId) {
      setActiveConversation(convId);
      setIsSearchOpen(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 backdrop-blur-xs pt-16 sm:pt-24 px-4">
      <div className="relative w-full max-w-xl rounded-2xl border bg-card p-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Search header */}
        <div className="flex items-center gap-3 border-b pb-3">
          <Search className="h-5 w-5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages across all chats..."
            className="flex-1 bg-transparent text-sm font-medium text-foreground outline-hidden placeholder:text-muted-foreground"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsSearchOpen(false)}
            className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
          >
            Esc
          </button>
        </div>

        {/* Results Container */}
        <div className="mt-3 max-h-96 overflow-y-auto space-y-2">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-xs">Searching messages...</span>
            </div>
          ) : results.length > 0 ? (
            results.map((message) => {
              const conv = message.conversation as any;
              const convTitle =
                typeof conv === 'object' && conv?.groupName
                  ? conv.groupName
                  : 'Direct Message';

              return (
                <div
                  key={message.id}
                  onClick={() => handleSelectMessage(message)}
                  className="flex items-start gap-3 p-3 rounded-xl border bg-muted/30 hover:bg-muted/70 cursor-pointer transition-colors"
                >
                  <Avatar
                    src={message.sender?.avatar}
                    name={message.sender?.name || message.sender?.username}
                    size="sm"
                    className="mt-0.5 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-foreground">
                          {message.sender?.name || message.sender?.username}
                        </span>
                        <span className="text-[10px] text-muted-foreground">in {convTitle}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDate(message.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {message.content}
                    </p>
                  </div>
                </div>
              );
            })
          ) : hasSearched ? (
            <div className="flex flex-col items-center justify-center py-12 text-center select-none">
              <MessageSquare className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-xs font-medium text-foreground">No matching messages found</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Try searching for different keywords or phrases.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center select-none text-muted-foreground">
              <Search className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-xs font-medium">Type a word to search conversation history</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


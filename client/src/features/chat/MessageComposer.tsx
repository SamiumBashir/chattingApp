'use client';

import React, { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { Send, Paperclip, Smile, X, Reply, Edit2, Loader2, FileText, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { User, Attachment } from '@/types';
import { useChatStore } from '@/store/chatStore';
import { uploadService } from '@/services/upload.service';
import { getSocket } from '@/lib/socket';

interface MessageComposerProps {
  conversationId: string;
  currentUser: User;
}

export function MessageComposer({ conversationId, currentUser }: MessageComposerProps) {
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const {
    replyingToMessage,
    editingMessage,
    setReplyingToMessage,
    setEditingMessage,
    sendMessageOptimistic,
    editMessageAction,
  } = useChatStore();

  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // If entering edit mode, populate composer with message content
  useEffect(() => {
    if (editingMessage) {
      setContent(editingMessage.content);
      inputRef.current?.focus();
    }
  }, [editingMessage]);

  // Focus input if entering reply mode
  useEffect(() => {
    if (replyingToMessage) {
      inputRef.current?.focus();
    }
  }, [replyingToMessage]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setContent(e.target.value);

    // Typing indicator emit
    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('typing:start', { conversationId });

      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }

      typingTimerRef.current = setTimeout(() => {
        socket.emit('typing:stop', { conversationId });
      }, 2500);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);
    try {
      const uploaded = await uploadService.uploadFile(file, 'connectly/attachments');
      setAttachments((prev) => [...prev, uploaded]);
    } catch (err: any) {
      setUploadError(err.response?.data?.error?.message || 'Failed to upload attachment');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    const trimmed = content.trim();
    if (!trimmed && attachments.length === 0) return;

    // Stop typing immediately
    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('typing:stop', { conversationId });
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    }

    if (editingMessage) {
      setContent('');
      await editMessageAction(conversationId, editingMessage.id, trimmed);
    } else {
      setContent('');
      const currentAttachments = [...attachments];
      setAttachments([]);
      await sendMessageOptimistic(
        conversationId,
        trimmed,
        currentUser,
        replyingToMessage?.id,
        currentAttachments
      );
    }

    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'Escape') {
      if (editingMessage) setEditingMessage(null);
      if (replyingToMessage) setReplyingToMessage(null);
    }
  };

  return (
    <div className="bg-card border-t shrink-0">
      {/* Replying banner */}
      {replyingToMessage && (
        <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Reply className="h-4 w-4 text-primary shrink-0" />
            <div className="truncate">
              <span className="font-semibold text-foreground">
                Replying to{' '}
                {replyingToMessage.sender?.id === currentUser.id
                  ? 'yourself'
                  : replyingToMessage.sender?.name || 'User'}
                :
              </span>{' '}
              <span className="text-muted-foreground truncate">{replyingToMessage.content}</span>
            </div>
          </div>
          <button
            onClick={() => setReplyingToMessage(null)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Editing banner */}
      {editingMessage && (
        <div className="flex items-center justify-between border-b bg-primary/10 px-4 py-2 text-xs text-primary">
          <div className="flex items-center gap-2 truncate">
            <Edit2 className="h-4 w-4 shrink-0" />
            <span className="font-semibold">Editing message</span>
            <span className="text-primary/80 truncate">&ldquo;{editingMessage.content}&rdquo;</span>
          </div>
          <button
            onClick={() => {
              setEditingMessage(null);
              setContent('');
            }}
            className="rounded p-1 text-primary hover:bg-primary/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Attachments preview banner */}
      {(attachments.length > 0 || isUploading) && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-2">
          {attachments.map((att, idx) => (
            <div
              key={att.publicId || idx}
              className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1 text-xs shadow-2xs"
            >
              {att.fileType.startsWith('image/') ? (
                <ImageIcon className="h-3.5 w-3.5 text-primary" />
              ) : (
                <FileText className="h-3.5 w-3.5 text-primary" />
              )}
              <span className="font-medium text-foreground max-w-[120px] truncate">
                {att.fileName}
              </span>
              <button
                type="button"
                onClick={() => removeAttachment(idx)}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}

          {isUploading && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Uploading attachment...</span>
            </div>
          )}

          {uploadError && (
            <span className="text-xs text-destructive">{uploadError}</span>
          )}
        </div>
      )}

      {/* Input bar */}
      <div className="p-3">
        <div className="flex items-center gap-2 max-w-5xl mx-auto">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="h-9 w-9 text-muted-foreground hover:text-foreground shrink-0"
            title="Attach file"
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={content}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                editingMessage
                  ? 'Edit your message (Press Enter to save, Esc to cancel)'
                  : 'Type a message... (Press Enter to send)'
              }
              className="w-full h-10 pl-4 pr-10 rounded-full bg-muted/50 border border-input text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
            />
            <button
              type="button"
              className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
              title="Emoji"
            >
              <Smile className="h-5 w-5" />
            </button>
          </div>

          <Button
            type="button"
            size="icon"
            disabled={(!content.trim() && attachments.length === 0) || isUploading}
            onClick={handleSend}
            className="h-10 w-10 rounded-full shrink-0 shadow-xs"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

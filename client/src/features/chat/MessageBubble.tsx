'use client';

import React, { useState } from 'react';
import {
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Smile,
  Reply,
  Edit2,
  Trash2,
  FileText,
  Download,
  Flag,
  Mic,
} from 'lucide-react';
import { Message } from '@/types';
import { Avatar } from '@/components/ui/avatar';
import { EmojiReactionPicker } from './EmojiReactionPicker';
import { ReportModal } from './ReportModal';
import { useChatStore } from '@/store/chatStore';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  message: Message;
  currentUserId: string;
  isGroup: boolean;
}

export function MessageBubble({ message, currentUserId, isGroup }: MessageBubbleProps) {
  const {
    setReplyingToMessage,
    setEditingMessage,
    deleteMessageAction,
    toggleReactionAction,
  } = useChatStore();

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const isSender = message.sender?.id === currentUserId;

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  // Group reactions by emoji and count
  const reactionCounts: Record<string, { count: number; userReacted: boolean }> = {};
  (message.reactions || []).forEach((r) => {
    const userId = typeof r.user === 'string' ? r.user : r.user.id;
    if (!reactionCounts[r.emoji]) {
      reactionCounts[r.emoji] = { count: 0, userReacted: false };
    }
    reactionCounts[r.emoji].count += 1;
    if (userId === currentUserId) {
      reactionCounts[r.emoji].userReacted = true;
    }
  });

  const handleDelete = () => {
    if (confirm('Delete this message?')) {
      deleteMessageAction(message.conversation, message.id);
    }
  };

  return (
    <div
      className={cn(
        'group relative flex w-full gap-2.5 my-1.5 select-text',
        isSender ? 'justify-end' : 'justify-start'
      )}
    >
      {!isSender && (
        <Avatar
          src={message.sender?.avatar}
          name={message.sender?.name || 'User'}
          size="sm"
          className="mt-1 shrink-0"
        />
      )}

      {/* Floating Action Toolbar on hover */}
      {!message.isDeleted && (
        <div
          className={cn(
            'absolute -top-3 z-20 hidden items-center gap-0.5 rounded-full border bg-card px-1.5 py-0.5 shadow-md group-hover:flex transition-all',
            isSender ? 'right-2' : 'left-10'
          )}
        >
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Add reaction"
          >
            <Smile className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setReplyingToMessage(message)}
            className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Reply"
          >
            <Reply className="h-3.5 w-3.5" />
          </button>
          {!isSender && (
            <button
              type="button"
              onClick={() => setShowReportModal(true)}
              className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="Report message"
            >
              <Flag className="h-3.5 w-3.5" />
            </button>
          )}
          {isSender && (
            <>
              <button
                type="button"
                onClick={() => setEditingMessage(message)}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Edit message"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="Delete message"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      )}

      {/* Emoji Picker Popover */}
      {showEmojiPicker && (
        <div
          className={cn(
            'absolute -top-10 z-30',
            isSender ? 'right-4' : 'left-12'
          )}
        >
          <EmojiReactionPicker
            onSelectEmoji={(emoji) => {
              toggleReactionAction(message.conversation, message.id, emoji, currentUserId);
              setShowEmojiPicker(false);
            }}
            onClose={() => setShowEmojiPicker(false)}
          />
        </div>
      )}

      <div className={cn('flex flex-col max-w-[75%] sm:max-w-[65%]', isSender ? 'items-end' : 'items-start')}>
        {/* Sender name for group chats */}
        {!isSender && isGroup && (
          <span className="text-[11px] font-semibold text-primary ml-1 mb-0.5">
            {message.sender?.name || `@${message.sender?.username}`}
          </span>
        )}

        <div
          className={cn(
            'relative rounded-2xl px-4 py-2.5 text-sm shadow-2xs break-words',
            isSender
              ? 'bg-primary text-primary-foreground rounded-tr-xs'
              : 'bg-muted text-foreground rounded-tl-xs',
            message.isDeleted && 'italic opacity-60 bg-muted/60 text-muted-foreground'
          )}
        >
          {/* Threaded Reply Quotation Box */}
          {message.replyTo && (
            <div
              className={cn(
                'mb-2 rounded-md border-l-3 px-2.5 py-1 text-xs opacity-90',
                isSender
                  ? 'border-primary-foreground bg-primary-foreground/10 text-primary-foreground'
                  : 'border-primary bg-background/50 text-foreground'
              )}
            >
              <span className="font-semibold block text-[10px]">
                {typeof message.replyTo.sender === 'object'
                  ? (message.replyTo.sender as any).name || 'User'
                  : 'Replied Message'}
              </span>
              <p className="truncate line-clamp-1">{message.replyTo.content}</p>
            </div>
          )}

          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="space-y-1.5 mb-1.5">
              {message.attachments.map((att, idx) => (
                <div key={att.publicId || idx}>
                  {att.fileType.startsWith('image/') ? (
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block overflow-hidden rounded-lg border border-primary/20 hover:opacity-95 transition-opacity"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={att.url}
                        alt={att.fileName || 'Image attachment'}
                        className="max-h-60 w-auto rounded-lg object-cover"
                      />
                    </a>
                  ) : att.fileType.startsWith('audio/') || att.fileName?.startsWith('voice-') ? (
                    <div className="my-1.5 w-full min-w-[220px] sm:min-w-[260px] p-2.5 rounded-xl bg-background/60 border border-primary/20 text-foreground">
                      <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold">
                        <Mic className="h-3.5 w-3.5 text-primary" />
                        <span>Voice Message</span>
                        {att.fileSize && (
                          <span className="text-[10px] text-muted-foreground font-normal ml-auto">
                            {(att.fileSize / 1024).toFixed(0)} KB
                          </span>
                        )}
                      </div>
                      <audio
                        controls
                        src={att.url}
                        className="w-full h-8 rounded-lg"
                        preload="metadata"
                      />
                    </div>
                  ) : (
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={att.fileName}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg p-2 text-xs border transition-colors',
                        isSender
                          ? 'border-primary-foreground/20 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground'
                          : 'border-border bg-card hover:bg-muted text-foreground'
                      )}
                    >
                      <FileText className="h-4 w-4 shrink-0 text-primary" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate text-[11px]">{att.fileName}</p>
                        <p className="text-[10px] opacity-75">
                          {att.fileSize ? `${(att.fileSize / 1024).toFixed(1)} KB` : 'File'}
                        </p>
                      </div>
                      <Download className="h-3.5 w-3.5 opacity-70 shrink-0" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Text Content */}
          {message.content && (
            <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
          )}

          {/* Time & Delivery Status Indicator */}
          <div
            className={cn(
              'mt-1 flex items-center justify-end gap-1 text-[10px] select-none',
              isSender ? 'text-primary-foreground/75' : 'text-muted-foreground'
            )}
          >
            {message.isEdited && !message.isDeleted && (
              <span className="italic mr-1">(edited)</span>
            )}
            <span>{formatTime(message.createdAt)}</span>

            {isSender && (
              <span className="inline-flex items-center ml-0.5">
                {message.status === 'sending' && (
                  <Clock className="h-3 w-3 animate-pulse opacity-70" />
                )}
                {message.status === 'failed' && (
                  <span title="Failed to deliver">
                    <AlertCircle className="h-3 w-3 text-destructive" />
                  </span>
                )}
                {message.status === 'sent' && <Check className="h-3 w-3" />}
                {message.status === 'delivered' && <CheckCheck className="h-3 w-3 opacity-80" />}
                {message.status === 'read' && (
                  <CheckCheck className="h-3 w-3 text-sky-300 font-bold" />
                )}
                {!message.status && <CheckCheck className="h-3 w-3 opacity-80" />}
              </span>
            )}
          </div>
        </div>

        {/* Reaction Pills Summary */}
        {Object.keys(reactionCounts).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 select-none">
            {Object.entries(reactionCounts).map(([emoji, data]) => (
              <button
                key={emoji}
                type="button"
                onClick={() =>
                  toggleReactionAction(message.conversation, message.id, emoji, currentUserId)
                }
                className={cn(
                  'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors hover:scale-105',
                  data.userReacted
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted'
                )}
              >
                <span>{emoji}</span>
                <span className="text-[10px]">{data.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <ReportModal
        message={message}
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
      />
    </div>
  );
}

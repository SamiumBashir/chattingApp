'use client';

import React, { useState, useEffect, useRef, KeyboardEvent } from 'react';
import {
  Send,
  Paperclip,
  Smile,
  X,
  Reply,
  Edit2,
  Loader2,
  FileText,
  Image as ImageIcon,
  Mic,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { User, Attachment } from '@/types';
import { useChatStore } from '@/store/chatStore';
import { uploadService } from '@/services/upload.service';
import { getSocket } from '@/lib/socket';
import {
  compressImage,
  formatBytes,
  MAX_IMAGE_INPUT_BYTES,
} from '@/lib/imageCompression';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';

const CHAT_EMOJIS = [
  '😊', '😂', '🔥', '❤️', '👍', '🎉', '😍', '🙏',
  '🙌', '✨', '👏', '🚀', '💯', '😎', '🥳', '🤔',
  '😭', '🥺', '👀', '💡', '🌟', '💪', '🤝', '☕',
];

interface MessageComposerProps {
  conversationId: string;
  currentUser: User;
}

export function MessageComposer({ conversationId, currentUser }: MessageComposerProps) {
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

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
  const imageInputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const {
    isRecording,
    formattedDuration,
    startRecording,
    stopRecording,
    cancelRecording,
    error: voiceError,
    clearError: clearVoiceError,
  } = useVoiceRecorder();

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

  // Click outside listener for emoji picker popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };
    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

  const handleSelectEmoji = (emoji: string) => {
    setContent((prev) => prev + emoji);
    inputRef.current?.focus();
  };

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

  /**
   * Dedicated Image Upload Handler:
   * - Enforces max 10MB limit
   * - Automatically compresses large images down to < 200KB client-side
   */
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);

    // 1. Strict 10MB limit verification
    if (file.size > MAX_IMAGE_INPUT_BYTES) {
      setUploadError(
        `Image size (${formatBytes(file.size)}) exceeds the 10 MB limit. Please select an image under 10 MB.`
      );
      if (imageInputRef.current) imageInputRef.current.value = '';
      return;
    }

    setIsUploading(true);

    try {
      // 2. Compress image down to < 200KB
      const result = await compressImage(file);

      // 3. Upload compressed image file
      const uploaded = await uploadService.uploadFile(result.file, 'connectly/attachments');
      setAttachments((prev) => [...prev, uploaded]);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to compress and upload image');
    } finally {
      setIsUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  /**
   * General File Attachment Handler (Documents, PDFs, etc.)
   */
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

  /**
   * Voice Message Handlers
   */
  const handleStartVoice = async () => {
    setUploadError(null);
    clearVoiceError();
    await startRecording();
  };

  const handleSendVoice = async () => {
    setIsUploading(true);
    try {
      const voiceFile = await stopRecording();
      if (!voiceFile) {
        setIsUploading(false);
        return;
      }

      // Upload voice audio file
      const uploaded = await uploadService.uploadFile(voiceFile, 'connectly/voice');

      // Send message immediately with voice attachment
      await sendMessageOptimistic(
        conversationId,
        '🎤 Voice message',
        currentUser,
        replyingToMessage?.id,
        [uploaded]
      );
    } catch (err: any) {
      setUploadError(err.message || 'Failed to send voice message');
    } finally {
      setIsUploading(false);
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
            type="button"
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
            type="button"
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
      {(attachments.length > 0 || isUploading || uploadError || voiceError) && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-2">
          {attachments.map((att, idx) => (
            <div
              key={att.publicId || idx}
              className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1 text-xs shadow-2xs"
            >
              {att.fileType.startsWith('image/') ? (
                <ImageIcon className="h-3.5 w-3.5 text-emerald-500" />
              ) : att.fileType.startsWith('audio/') || att.fileName?.startsWith('voice-') ? (
                <Mic className="h-3.5 w-3.5 text-red-500" />
              ) : (
                <FileText className="h-3.5 w-3.5 text-primary" />
              )}
              <span className="font-medium text-foreground max-w-[140px] truncate">
                {att.fileName}
              </span>
              {att.fileSize && (
                <span className="text-[10px] text-muted-foreground">
                  ({formatBytes(att.fileSize)})
                </span>
              )}
              <button
                type="button"
                onClick={() => removeAttachment(idx)}
                className="text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                title="Remove attachment"
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
            <span className="text-xs text-destructive font-medium">{uploadError}</span>
          )}

          {voiceError && (
            <span className="text-xs text-destructive font-medium">{voiceError}</span>
          )}
        </div>
      )}

      {/* Input bar */}
      <div className="p-3">
        {/* Active Voice Recording UI */}
        {isRecording ? (
          <div className="flex items-center justify-between gap-3 bg-red-500/10 border border-red-500/25 rounded-full px-4 py-2 max-w-5xl mx-auto animate-in fade-in">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
              <span className="font-semibold text-red-600 dark:text-red-400 text-xs sm:text-sm">
                Recording...
              </span>
              <span className="font-mono text-xs text-foreground bg-background/80 px-2.5 py-0.5 rounded-full border shadow-2xs font-bold">
                {formattedDuration}
              </span>

              {/* Pulsing Audio Equalizer Waveform Simulation */}
              <div className="hidden sm:flex items-center gap-1 h-4 ml-1">
                <span className="w-1 bg-red-500 rounded-full animate-pulse h-3" />
                <span className="w-1 bg-red-500 rounded-full animate-pulse h-5 [animation-delay:0.15s]" />
                <span className="w-1 bg-red-500 rounded-full animate-pulse h-2 [animation-delay:0.3s]" />
                <span className="w-1 bg-red-500 rounded-full animate-pulse h-4 [animation-delay:0.2s]" />
                <span className="w-1 bg-red-500 rounded-full animate-pulse h-3 [animation-delay:0.1s]" />
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Cancel Button */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={cancelRecording}
                className="h-8 gap-1 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full px-3"
                title="Discard recording"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Cancel</span>
              </Button>

              {/* Send Voice Button */}
              <Button
                type="button"
                size="sm"
                onClick={handleSendVoice}
                className="h-8 gap-1.5 text-xs rounded-full px-3.5 bg-red-500 hover:bg-red-600 text-white shadow-xs"
                title="Send voice note"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Send</span>
              </Button>
            </div>
          </div>
        ) : (
          /* Standard Composer Input Bar */
          <div className="flex items-center gap-1 sm:gap-1.5 max-w-5xl mx-auto">
            {/* Hidden dedicated image input (accept="image/*") */}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />

            {/* Hidden file attachment input */}
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* 1. Dedicated Voice Message Button (Left Side) */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleStartVoice}
              disabled={isUploading || Boolean(editingMessage)}
              className="h-9 w-9 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 shrink-0 rounded-full transition-colors"
              title="Record voice message"
              aria-label="Record voice message"
            >
              <Mic className="h-4.5 w-4.5 text-red-500" />
            </Button>

            {/* 2. Dedicated Image Upload Button (Left Side) */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => imageInputRef.current?.click()}
              disabled={isUploading}
              className="h-9 w-9 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-500/10 shrink-0 rounded-full transition-colors"
              title="Send photo (Max 10MB, auto-compressed to < 200KB)"
              aria-label="Send image"
            >
              <ImageIcon className="h-4.5 w-4.5 text-emerald-500" />
            </Button>

            {/* 3. Document/File Attachment Button (Left Side) */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="h-9 w-9 text-muted-foreground hover:text-foreground shrink-0 rounded-full transition-colors"
              title="Attach document or file"
              aria-label="Attach file"
            >
              <Paperclip className="h-4 w-4" />
            </Button>

            {/* Text Input with Emoji Button */}
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
                onClick={() => setShowEmojiPicker((prev) => !prev)}
                className={`absolute right-3 top-2.5 transition-colors ${
                  showEmojiPicker
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Choose emoji"
                aria-label="Add emoji"
              >
                <Smile className="h-5 w-5" />
              </button>

              {/* Functional Emoji Picker Popover */}
              {showEmojiPicker && (
                <div
                  ref={emojiPickerRef}
                  className="absolute right-0 bottom-12 z-50 p-2.5 rounded-2xl bg-card border shadow-xl ring-1 ring-border/50 animate-in fade-in zoom-in-95 duration-150 w-64 max-w-[calc(100vw-32px)]"
                >
                  <div className="text-[11px] font-semibold text-muted-foreground px-1 pb-1.5 border-b mb-1.5">
                    Quick Emojis
                  </div>
                  <div className="grid grid-cols-8 gap-1">
                    {CHAT_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleSelectEmoji(emoji)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-base hover:bg-muted hover:scale-125 transition-transform"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Send Button */}
            <Button
              type="button"
              size="icon"
              disabled={(!content.trim() && attachments.length === 0) || isUploading}
              onClick={handleSend}
              className="h-10 w-10 rounded-full shrink-0 shadow-xs"
              title="Send message"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

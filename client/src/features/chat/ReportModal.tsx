'use client';

import React, { useState } from 'react';
import { X, ShieldAlert, CheckCircle, Loader2 } from 'lucide-react';
import { adminService } from '@/services/admin.service';
import { Message } from '@/types';
import { Button } from '@/components/ui/button';

interface ReportModalProps {
  message: Message;
  isOpen: boolean;
  onClose: () => void;
}

export function ReportModal({ message, isOpen, onClose }: ReportModalProps) {
  const [reason, setReason] = useState<
    'spam' | 'harassment' | 'hate_speech' | 'inappropriate_content' | 'other'
  >('harassment');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setErrorMessage('Please provide details for the report');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await adminService.createReport({
        reportedUserId: message.sender?.id,
        reportedMessageId: message.id,
        reportedConversationId: message.conversation,
        reason,
        description: description.trim(),
      });
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error?.message || 'Failed to submit report');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b pb-3 mb-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            <h3 className="font-bold text-sm text-foreground">Report Message</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isSuccess ? (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
            <CheckCircle className="h-10 w-10 text-emerald-500 animate-in zoom-in-50" />
            <h4 className="font-bold text-sm text-foreground">Report Submitted</h4>
            <p className="text-xs text-muted-foreground max-w-xs">
              Thank you for helping keep Connectly safe. Our moderation team will review this.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-lg bg-muted/40 p-3 text-xs border">
              <span className="font-semibold text-muted-foreground block text-[10px] mb-0.5">
                Message from @{message.sender?.username || 'user'}:
              </span>
              <p className="text-foreground italic line-clamp-2">{message.content}</p>
            </div>

            {errorMessage && (
              <p className="text-xs text-destructive bg-destructive/10 p-2 rounded-md">
                {errorMessage}
              </p>
            )}

            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">Reason</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as any)}
                className="w-full h-9 px-3 rounded-lg border bg-background text-xs text-foreground focus:outline-none"
              >
                <option value="harassment">Harassment or bullying</option>
                <option value="spam">Spam or unwanted advertising</option>
                <option value="hate_speech">Hate speech or discrimination</option>
                <option value="inappropriate_content">Inappropriate or explicit content</option>
                <option value="other">Other violation</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">
                Additional Details
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Explain what was inappropriate about this message..."
                rows={3}
                required
                className="w-full rounded-lg border bg-background p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" size="sm" isLoading={isSubmitting}>
                Submit Report
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}


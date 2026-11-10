'use client';

import React, { useState } from 'react';
import { Star, MessageSquare, ThumbsUp, X, CheckCircle, Loader2 } from 'lucide-react';
import { useCallStore } from '@/store/callStore';
import { callService } from '@/services/call.service';
import { cn } from '@/lib/utils';

const QUALITY_TAGS = [
  'Crisp Audio',
  'HD Video',
  'Smooth Connection',
  'Audio Delay',
  'Video Freeze',
  'Background Noise',
  'Echo',
];

export function CallFeedbackModal() {
  const { isRatingModalOpen, lastEndedCallId, closeRatingModal } = useCallStore();
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);

  if (!isRatingModalOpen || !lastEndedCallId) {
    return null;
  }

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async () => {
    if (!lastEndedCallId || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await callService.submitCallRating(
        lastEndedCallId,
        rating,
        feedback.trim() || undefined,
        selectedTags.length > 0 ? selectedTags : undefined
      );
      setIsSubmitted(true);
      setTimeout(() => {
        setIsSubmitted(false);
        closeRatingModal();
      }, 1500);
    } catch (err) {
      console.warn('Failed to submit call feedback:', err);
      closeRatingModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-3xl bg-zinc-900 border border-zinc-700/60 shadow-2xl p-6 text-zinc-100 animate-in zoom-in-95 duration-200"
      >
        {/* Close / Skip button */}
        <button
          type="button"
          onClick={closeRatingModal}
          disabled={isSubmitting}
          className="absolute top-4 right-4 p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          title="Skip feedback"
        >
          <X className="h-4 w-4" />
        </button>

        {isSubmitted ? (
          <div className="py-8 flex flex-col items-center justify-center text-center animate-in fade-in">
            <CheckCircle className="h-12 w-12 text-emerald-400 mb-3 animate-bounce" />
            <h3 className="text-lg font-bold text-white">Thank you!</h3>
            <p className="text-xs text-zinc-400 mt-1">Your feedback helps improve call reliability.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center text-center">
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center mb-3">
                <ThumbsUp className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-lg font-bold text-white">How was your call quality?</h3>
              <p className="text-xs text-zinc-400 mt-1">
                Rate your audio and video experience for this session
              </p>
            </div>

            {/* Star Rating Selector */}
            <div className="my-5 flex items-center justify-center gap-2">
              {[1, 2, 3, 4, 5].map((starValue) => {
                const isFilled = (hoverRating ?? rating) >= starValue;
                return (
                  <button
                    key={starValue}
                    type="button"
                    onMouseEnter={() => setHoverRating(starValue)}
                    onMouseLeave={() => setHoverRating(null)}
                    onClick={() => setRating(starValue)}
                    className="p-1 rounded-lg transition-transform hover:scale-110 active:scale-95"
                    title={`Rate ${starValue} star${starValue > 1 ? 's' : ''}`}
                  >
                    <Star
                      className={cn(
                        'h-8 w-8 transition-colors',
                        isFilled
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-zinc-600 hover:text-zinc-500'
                      )}
                    />
                  </button>
                );
              })}
            </div>

            {/* Quick Feedback Tags */}
            <div className="mb-4">
              <span className="text-[11px] font-medium text-zinc-400 block mb-2">
                What went well or needs improvement?
              </span>
              <div className="flex flex-wrap gap-1.5">
                {QUALITY_TAGS.map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={cn(
                        'text-xs px-2.5 py-1 rounded-full border transition-all',
                        isSelected
                          ? 'bg-primary text-primary-foreground border-primary font-medium'
                          : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-300 hover:bg-zinc-800 hover:text-white'
                      )}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Optional Additional Comments */}
            <div className="mb-5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400 mb-1.5">
                <MessageSquare className="h-3 w-3" />
                <span>Additional Comments (optional)</span>
              </div>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={2}
                placeholder="Tell us more about any lag, stutter, or issues you experienced..."
                className="w-full rounded-xl bg-zinc-800/80 border border-zinc-700/80 p-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-primary transition-colors resize-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={closeRatingModal}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg flex items-center gap-2 transition-transform active:scale-95 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <span>Submit Feedback</span>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


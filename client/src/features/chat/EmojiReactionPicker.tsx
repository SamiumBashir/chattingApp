import React from 'react';

const COMMON_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '🙏'];

interface EmojiReactionPickerProps {
  onSelectEmoji: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiReactionPicker({ onSelectEmoji, onClose }: EmojiReactionPickerProps) {
  return (
    <div className="flex items-center gap-1 rounded-full border bg-card p-1 shadow-lg ring-1 ring-border/50 select-none animate-in fade-in zoom-in-95 duration-100">
      {COMMON_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => {
            onSelectEmoji(emoji);
            onClose();
          }}
          className="flex h-7 w-7 items-center justify-center rounded-full text-base transition-transform hover:scale-125 hover:bg-muted"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}


'use client';

import React from 'react';

interface CallWaveAnimationProps {
  isMuted?: boolean;
}

export function CallWaveAnimation({ isMuted = false }: CallWaveAnimationProps) {
  return (
    <div className="flex items-center justify-center gap-1.5 h-12 my-2">
      {[40, 75, 55, 95, 60, 85, 45, 100, 65, 50, 80, 35].map((height, idx) => (
        <span
          key={idx}
          className={`w-1 rounded-full bg-primary/70 transition-all duration-300 ${
            isMuted
              ? 'h-2 bg-muted-foreground/30'
              : 'animate-pulse'
          }`}
          style={{
            height: isMuted ? '6px' : `${Math.max(8, height * 0.45)}px`,
            animationDelay: `${(idx % 5) * 120}ms`,
            animationDuration: `${700 + (idx % 3) * 300}ms`,
          }}
        />
      ))}
    </div>
  );
}


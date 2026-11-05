import * as React from 'react';
import { cn, getInitials } from '@/lib/utils';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
}

const sizeClasses = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
};

const badgeSizeClasses = {
  sm: 'h-2.5 w-2.5 bottom-0 right-0 border',
  md: 'h-3 w-3 bottom-0 right-0 border-2',
  lg: 'h-3.5 w-3.5 bottom-0.5 right-0.5 border-2',
  xl: 'h-4 w-4 bottom-1 right-1 border-2',
};

export function Avatar({
  src,
  alt = 'Avatar',
  name = '',
  size = 'md',
  isOnline,
  className,
  ...props
}: AvatarProps) {
  const [imageError, setImageError] = React.useState(false);

  return (
    <div className={cn('relative inline-block select-none', className)} {...props}>
      <div
        className={cn(
          'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-medium text-muted-foreground ring-1 ring-border',
          sizeClasses[size]
        )}
      >
        {src && !imageError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt || name}
            onError={() => setImageError(true)}
            className="aspect-square h-full w-full object-cover"
          />
        ) : (
          <span>{getInitials(name || alt)}</span>
        )}
      </div>
      {typeof isOnline === 'boolean' && (
        <span
          className={cn(
            'absolute rounded-full border-background',
            badgeSizeClasses[size],
            isOnline ? 'bg-emerald-500' : 'bg-muted-foreground/40'
          )}
          title={isOnline ? 'Online' : 'Offline'}
        />
      )}
    </div>
  );
}


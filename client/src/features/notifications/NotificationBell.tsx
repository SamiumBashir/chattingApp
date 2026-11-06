'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  CheckCheck,
  MessageSquare,
  Sparkles,
  Volume2,
  VolumeX,
  Radio,
} from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore';
import { useChatStore } from '@/store/chatStore';
import { Avatar } from '@/components/ui/avatar';
import { formatDate } from '@/lib/utils';
import { requestNotificationPermission } from '@/lib/sound';

interface NotificationBellProps {
  align?: 'left' | 'right';
}

export function NotificationBell({ align }: NotificationBellProps = {}) {
  const {
    notifications,
    unreadCount,
    isOpen,
    filter,
    soundEnabled,
    setIsOpen,
    setFilter,
    toggleSound,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    markConversationNotificationsAsRead,
  } = useNotificationStore();

  const { setActiveConversation } = useChatStore();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [permissionStatus, setPermissionStatus] = useState<string>('default');

  useEffect(() => {
    fetchNotifications();
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionStatus(Notification.permission);
    }
  }, [fetchNotifications]);

  // Click outside listener to dismiss dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, setIsOpen]);

  const handleNotificationClick = (n: any) => {
    if (!n.isRead) {
      markAsRead(n.id);
    }
    if (n.conversation) {
      const convId = typeof n.conversation === 'string' ? n.conversation : n.conversation.id;
      markConversationNotificationsAsRead(convId);
      setActiveConversation(convId);
      setIsOpen(false);
    }
  };

  const handleRequestPermission = async () => {
    const res = await requestNotificationPermission();
    setPermissionStatus(res);
  };

  const displayList =
    filter === 'unread' ? notifications.filter((n) => !n.isRead) : notifications;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-xs animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className={`absolute ${
            align === 'right'
              ? 'right-0 top-11'
              : 'left-14 bottom-0 sm:left-auto sm:right-0 sm:top-12'
          } z-50 w-[calc(100vw-2rem)] max-w-sm sm:w-96 rounded-xl border bg-card p-3 shadow-xl animate-in fade-in zoom-in-95 duration-150`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b pb-2 mb-2">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">Notifications</h4>
              {unreadCount > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {unreadCount} unread
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Sound toggle button */}
              <button
                type="button"
                onClick={toggleSound}
                className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title={soundEnabled ? 'Mute notification sound' : 'Unmute notification sound'}
              >
                {soundEnabled ? (
                  <Volume2 className="h-4 w-4 text-primary" />
                ) : (
                  <VolumeX className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => markAllAsRead()}
                  className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              )}
            </div>
          </div>

          {/* Filter options bar */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/50 text-xs">
            <div className="flex items-center gap-1 bg-muted/50 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`px-2 py-0.5 rounded-md text-xs font-medium transition-colors ${
                  filter === 'all'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilter('unread')}
                className={`px-2 py-0.5 rounded-md text-xs font-medium transition-colors ${
                  filter === 'unread'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Unread {unreadCount > 0 ? `(${unreadCount})` : ''}
              </button>
            </div>

            {/* Desktop Notification Prompt */}
            {permissionStatus === 'default' && (
              <button
                type="button"
                onClick={handleRequestPermission}
                className="flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                <Radio className="h-3 w-3" />
                Enable alerts
              </button>
            )}
          </div>

          {/* Notifications Scroll List */}
          <div className="max-h-80 overflow-y-auto space-y-1 divide-y divide-border/40">
            {displayList.length > 0 ? (
              displayList.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`flex items-start gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                    !n.isRead ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/50'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {n.actor ? (
                      <Avatar
                        src={n.actor.avatar}
                        name={n.actor.name || n.actor.username}
                        size="sm"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Sparkles className="h-4 w-4" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs font-semibold text-foreground truncate">{n.title}</p>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {formatDate(n.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>
                  </div>

                  {!n.isRead && (
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                  )}
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center select-none">
                <Bell className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground font-medium">
                  {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                </p>
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                  You will only be notified when new unread messages arrive.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, MessageSquare, ArrowLeft, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isAuthenticated, isInitialized, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (isInitialized) {
      if (!isAuthenticated) {
        router.push('/login');
      } else if (user && user.role !== 'admin' && user.role !== 'superadmin') {
        router.push('/chat');
      }
    }
  }, [isInitialized, isAuthenticated, user, router]);

  if (!isInitialized || !user || (user.role !== 'admin' && user.role !== 'superadmin')) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground font-medium">Verifying administrator permissions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top Admin Header */}
      <header className="h-16 border-b bg-card px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm text-foreground">Connectly Admin Console</h2>
              <Badge variant="outline" className="text-[10px] uppercase font-bold text-primary border-primary/30">
                {user.role}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">System telemetry, user moderation, and audit logs</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/chat')}
            className="gap-2 text-xs"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Chat
          </Button>

          <div className="flex items-center gap-2 pl-2 border-l">
            <Avatar src={user.avatar} name={user.name} size="sm" />
            <div className="hidden sm:block text-left text-xs">
              <p className="font-semibold text-foreground leading-tight">{user.name}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">@{user.username}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 overflow-y-auto p-6 max-w-7xl w-full mx-auto">
        {children}
      </main>
    </div>
  );
}


'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, Shield, Zap, Users, Server, CheckCircle2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api';

export default function HomePage() {
  // Real health check to backend API
  const { data: healthData, isError, isLoading } = useQuery({
    queryKey: ['system-health'],
    queryFn: async () => {
      const res = await apiClient.get('/health');
      return res.data;
    },
    refetchInterval: 15000,
    retry: 1,
  });

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold shadow-sm">
              <MessageSquare className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight">Connectly</span>
            <Badge variant="outline" className="hidden sm:inline-flex text-[10px] ml-1">
              v1.0.0
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Log in
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="relative overflow-hidden py-16 sm:py-24">
          <div className="container mx-auto max-w-5xl px-4 text-center sm:px-6">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border bg-muted/50 px-3.5 py-1 text-xs font-medium text-muted-foreground mb-6">
              <Server className="h-3.5 w-3.5 text-primary" />
              <span>Full-Stack Real-Time Messaging Platform</span>
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-foreground">
              Real-time messaging engineered for{' '}
              <span className="text-primary underline decoration-primary/30 decoration-wavy">
                performance & scale
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
              Designed with Next.js App Router, Express.js, MongoDB, and Socket.IO. Complete with
              dual-token authentication, online presence, group conversations, and instant delivery.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link href="/chat">
                <Button size="lg" className="gap-2">
                  Launch Chat App <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/register">
                <Button variant="outline" size="lg">
                  Create Account
                </Button>
              </Link>
            </div>

            {/* Backend Connection Status Badge */}
            <div className="mt-10 inline-flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-xs shadow-subtle">
              <span className="font-semibold text-muted-foreground">Backend API:</span>
              {isLoading ? (
                <span className="text-muted-foreground animate-pulse">Checking status...</span>
              ) : isError ? (
                <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                  Offline / Disconnected
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Connected ({healthData?.data?.service || 'Online'})
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Feature Highlights Grid */}
        <section className="border-t bg-muted/30 py-16">
          <div className="container mx-auto max-w-5xl px-4 sm:px-6">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
                    <Zap className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base">Real-Time Engine</CardTitle>
                  <CardDescription>
                    Low-latency Socket.IO gateway with user & conversation rooms, typing indicators,
                    and idempotency tracking.
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
                    <Shield className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base">Production Security</CardTitle>
                  <CardDescription>
                    Memory-held JWT access tokens, HttpOnly rotated refresh cookies, Argon2/bcrypt
                    hashing, and strict Zod validation.
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
                    <Users className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base">Groups & Direct Messaging</CardTitle>
                  <CardDescription>
                    Duplicate-safe 1-to-1 chats, group channels with role-based member permissions,
                    and delivery/read receipts.
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        <div className="container mx-auto max-w-5xl px-4">
          <p>© {new Date().getFullYear()} Connectly Messaging Platform. Built with Next.js, Express & Socket.IO.</p>
        </div>
      </footer>
    </div>
  );
}


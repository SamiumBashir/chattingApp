'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle, Mail, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authService } from '@/services/auth.service';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';

  const [token, setToken] = useState(tokenFromUrl);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleVerify = async (tokenToVerify: string) => {
    if (!tokenToVerify) return;
    setStatus('loading');
    setErrorMessage(null);
    try {
      await authService.verifyEmail(tokenToVerify);
      setStatus('success');
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.response?.data?.error?.message || err.message || 'Verification token is invalid or expired.');
    }
  };

  useEffect(() => {
    if (tokenFromUrl) {
      handleVerify(tokenFromUrl);
    }
  }, [tokenFromUrl]);

  if (status === 'loading') {
    return (
      <div className="text-center py-6">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary mb-3" />
        <h3 className="text-lg font-bold text-foreground">Verifying Email</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Confirming your email address with the Connectly security network...
        </p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="text-center py-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 mb-4">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold text-foreground">Email Verified Successfully</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account has been verified. You now have full access to real-time messaging, groups, and files.
        </p>
        <div className="mt-6">
          <Link href="/chat">
            <Button className="w-full gap-2">
              Proceed to Chat <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="text-center py-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-4">
          <XCircle className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold text-foreground">Verification Failed</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {errorMessage || 'This link is invalid or has expired.'}
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setStatus('idle');
              setToken('');
            }}
          >
            Enter Token Manually
          </Button>
          <Link href="/login">
            <Button variant="ghost" className="w-full">
              Back to Login
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 text-center sm:text-left">
        <div className="mx-auto sm:mx-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-3">
          <Mail className="h-5 w-5" />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">Verify your email</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Please enter the token from your email verification link
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
            Verification Token
          </label>
          <Input
            type="text"
            placeholder="Paste verification token here"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </div>

        <Button
          type="button"
          className="w-full"
          disabled={!token.trim()}
          onClick={() => handleVerify(token.trim())}
        >
          Verify Email
        </Button>
      </div>

      <div className="mt-6 text-center">
        <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
          Skip to Login
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="w-full max-w-md bg-white rounded-3xl p-8 sm:p-10 shadow-2xl border border-white/20 mx-auto">
      <Suspense fallback={<div className="p-4 text-center text-sm text-slate-400">Loading...</div>}>
        <VerifyEmailContent />
      </Suspense>
    </div>
  );
}


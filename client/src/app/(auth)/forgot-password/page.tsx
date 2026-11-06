'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authService } from '@/services/auth.service';

const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [demoToken, setDemoToken] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotPasswordValues) => {
    setIsLoading(true);
    setServerError(null);
    try {
      const res = await authService.forgotPassword(values.email);
      setIsSuccess(true);
      if (res.resetToken) {
        setDemoToken(res.resetToken);
      }
    } catch (err: any) {
      setServerError(err.message || 'Failed to submit reset request');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="w-full max-w-md bg-white rounded-3xl p-8 sm:p-10 shadow-2xl border border-white/20 mx-auto text-center py-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 mb-4">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold text-slate-900">Password Reset Link Sent</h3>
        <p className="mt-2 text-sm text-slate-500">
          If an account exists with that email address, we have sent instructions to reset your password.
        </p>

        {demoToken && (
          <div className="mt-4 rounded-md bg-slate-50 p-3 text-xs text-left border border-slate-200">
            <span className="font-semibold block mb-1 text-slate-800">Development Reset Link:</span>
            <Link
              href={`/reset-password?token=${demoToken}`}
              className="text-[#5850EC] hover:underline break-all"
            >
              /reset-password?token={demoToken}
            </Link>
          </div>
        )}

        <div className="mt-6">
          <Link href="/login">
            <Button variant="outline" className="w-full gap-2">
              <ArrowLeft className="h-4 w-4" /> Back to Sign in
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md bg-white rounded-3xl p-8 sm:p-10 shadow-2xl border border-white/20 mx-auto">
      <div className="mb-6 text-center sm:text-left">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Forgot your password?</h2>
        <p className="mt-1 text-sm text-slate-500">
          Enter your account email and we will send you a reset link
        </p>
      </div>

      {serverError && (
        <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
            Email Address
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              type="email"
              placeholder="alex@example.com"
              className="pl-9"
              error={errors.email?.message}
              {...register('email')}
            />
          </div>
        </div>

        <Button type="submit" className="w-full" isLoading={isLoading}>
          Send Reset Instructions
        </Button>
      </form>

      <div className="mt-6 text-center">
        <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Return to login
        </Link>
      </div>
    </div>
  );
}


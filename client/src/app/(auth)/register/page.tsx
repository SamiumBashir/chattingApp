'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Lock, Mail, User as UserIcon, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/authStore';
import { GoogleSignInButton } from '@/components/shared/GoogleSignInButton';

const registerSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    username: z
      .string()
      .min(3, 'Username must be at least 3 characters')
      .max(30)
      .regex(/^[a-z0-9_.]+$/, 'Only lowercase letters, numbers, underscores, and dots'),
    email: z.string().email('Please enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Must contain at least one number'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const { register: registerUser, isLoading } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const passwordValue = watch('password', '');
  const hasMinLength = passwordValue.length >= 8;
  const hasUppercase = /[A-Z]/.test(passwordValue);
  const hasLowercase = /[a-z]/.test(passwordValue);
  const hasNumber = /[0-9]/.test(passwordValue);

  const onSubmit = async (values: RegisterFormValues) => {
    setServerError(null);
    try {
      await registerUser({
        name: values.name,
        username: values.username.toLowerCase(),
        email: values.email.toLowerCase(),
        password: values.password,
      });
      router.push('/chat');
    } catch (err: any) {
      setServerError(err.message || 'Registration failed. Please check your inputs.');
    }
  };

  return (
    <div className="w-full max-w-xl bg-white rounded-3xl p-8 sm:p-10 shadow-2xl border border-white/20 mx-auto">
      <div className="mb-6 text-center sm:text-left">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Create your account</h2>
        <p className="mt-1 text-sm text-slate-500">
          Join Connectly and start messaging in real-time
        </p>
      </div>

      {serverError && (
        <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
          {serverError}
        </div>
      )}

      {/* Google OAuth Sign-up */}
      <div className="mb-5">
        <GoogleSignInButton
          label="Sign up with Google"
          onError={(err) => setServerError(err)}
        />
      </div>

      <div className="relative mb-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground font-semibold">
            Or register with email
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
            Full Name
          </label>
          <div className="relative">
            <UserIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Alex Johnson"
              className="pl-9"
              error={errors.name?.message}
              {...register('name')}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
            Username
          </label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-sm font-semibold text-muted-foreground">@</span>
            <Input
              type="text"
              placeholder="alex_j"
              className="pl-8"
              error={errors.username?.message}
              {...register('username')}
            />
          </div>
        </div>

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

        <div>
          <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
            Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              className="pl-9 pr-10"
              error={errors.password?.message}
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {/* Password strength hints */}
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs text-muted-foreground">
            <span className={`flex items-center gap-1 ${hasMinLength ? 'text-emerald-600 font-medium' : ''}`}>
              <Check className={`h-3 w-3 ${hasMinLength ? 'opacity-100' : 'opacity-30'}`} /> 8+ characters
            </span>
            <span className={`flex items-center gap-1 ${hasUppercase ? 'text-emerald-600 font-medium' : ''}`}>
              <Check className={`h-3 w-3 ${hasUppercase ? 'opacity-100' : 'opacity-30'}`} /> 1 uppercase letter
            </span>
            <span className={`flex items-center gap-1 ${hasLowercase ? 'text-emerald-600 font-medium' : ''}`}>
              <Check className={`h-3 w-3 ${hasLowercase ? 'opacity-100' : 'opacity-30'}`} /> 1 lowercase letter
            </span>
            <span className={`flex items-center gap-1 ${hasNumber ? 'text-emerald-600 font-medium' : ''}`}>
              <Check className={`h-3 w-3 ${hasNumber ? 'opacity-100' : 'opacity-30'}`} /> 1 number
            </span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
            Confirm Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              className="pl-9"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />
          </div>
        </div>

        <Button type="submit" className="w-full" isLoading={isLoading}>
          Create Account
        </Button>
      </form>

      <div className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Sign in instead
        </Link>
      </div>
    </div>
  );
}


'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { GoogleSignInButton } from '@/components/shared/GoogleSignInButton';
import { IsometricAuthIllustration } from '@/components/illustrations/IsometricAuthIllustration';

const loginSchema = z.object({
  identifier: z.string().min(1, 'Please enter your username or email'),
  password: z.string().min(1, 'Please enter your password'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: '',
      password: '',
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);
    try {
      await login(values);
      router.push('/chat');
    } catch (err: any) {
      setServerError(err.message || 'Invalid username or password');
    }
  };

  return (
    <div className="w-full max-w-5xl lg:max-w-6xl bg-white rounded-[2rem] sm:rounded-[2.5rem] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35)] overflow-hidden grid grid-cols-1 lg:grid-cols-12 border border-white/30 min-h-[580px]">
      {/* LEFT COLUMN: Isometric 3D Illustration matching reference design */}
      <div className="hidden lg:flex lg:col-span-7 bg-[#FAFAFE] items-center justify-center relative overflow-hidden border-r border-slate-100/80">
        <IsometricAuthIllustration />
      </div>

      {/* RIGHT COLUMN: Clean, Elegant Login Form */}
      <div className="col-span-1 lg:col-span-5 p-8 sm:p-12 lg:p-14 flex flex-col justify-between bg-white">
        <div>
          {/* Header Typography matching reference image */}
          <div className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-[#1E1B4B] tracking-tight leading-tight">
              Hello,
            </h1>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1E1B4B] tracking-tight leading-tight mt-0.5">
              Welcome back
            </h2>
          </div>

          {/* Error Message */}
          {serverError && (
            <div className="mb-5 rounded-lg bg-red-50 p-3 text-xs font-medium text-red-600 border border-red-200">
              {serverError}
            </div>
          )}

          {/* Form Fields */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Username or email input */}
            <div>
              <input
                type="text"
                placeholder="Username or email"
                autoComplete="username"
                className="w-full border-0 border-b border-slate-200 focus:border-[#5850EC] focus:ring-0 rounded-none px-0 py-3 text-slate-800 placeholder:text-slate-400 text-sm transition-colors outline-hidden bg-transparent"
                {...register('identifier')}
              />
              {errors.identifier && (
                <p className="mt-1 text-xs text-red-500">{errors.identifier.message}</p>
              )}
            </div>

            {/* Password input with toggle button */}
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                autoComplete="current-password"
                className="w-full border-0 border-b border-slate-200 focus:border-[#5850EC] focus:ring-0 rounded-none px-0 py-3 pr-10 text-slate-800 placeholder:text-slate-400 text-sm transition-colors outline-hidden bg-transparent"
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-0 top-3 text-slate-400 hover:text-slate-600 transition-colors p-1"
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              {errors.password && (
                <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>
              )}
            </div>

            {/* Options Row: Remember me + Forgot password? */}
            <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#5850EC] focus:ring-[#5850EC] cursor-pointer"
                />
                <span className="text-slate-600 font-medium">Remember me</span>
              </label>

              <Link
                href="/forgot-password"
                className="font-medium text-[#5850EC] hover:text-[#4338CA] transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            {/* Primary Action Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#5850EC] hover:bg-[#4E44C4] active:bg-[#4338CA] text-white font-semibold py-3.5 px-4 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2 text-sm disabled:opacity-70 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                'Login'
              )}
            </button>
          </form>

          {/* Social Google Login Button */}
          <div className="mt-4">
            <GoogleSignInButton
              label="Continue with Google"
              onError={(err) => setServerError(err)}
            />
          </div>

          {/* Sign Up Redirect Link */}
          <p className="text-center text-xs text-slate-500 mt-5">
            Don&apos;t have an account?{' '}
            <Link
              href="/register"
              className="font-semibold text-[#5850EC] hover:text-[#4338CA] hover:underline"
            >
              Click here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

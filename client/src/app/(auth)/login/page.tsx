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

        {/* BOTTOM DOWNLOAD BADGES: App Store & Google Play */}
        <div className="flex items-center justify-center gap-3 mt-8 pt-5 border-t border-slate-100">
          {/* Apple App Store Pill */}
          <div className="flex items-center gap-2 bg-[#0F172A] text-white px-3.5 py-2 rounded-xl select-none hover:bg-slate-800 transition-colors shadow-xs cursor-pointer">
            <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.85c.66-.8 1.11-1.92.99-3.04-.96.04-2.11.64-2.8 1.44-.61.71-1.15 1.85-.98 2.96 1.07.08 2.14-.56 2.79-1.36z" />
            </svg>
            <div className="text-left leading-tight">
              <p className="text-[9px] uppercase tracking-wider text-slate-300">Download on the</p>
              <p className="text-xs font-semibold text-white">App Store</p>
            </div>
          </div>

          {/* Google Play Pill */}
          <div className="flex items-center gap-2 bg-[#0F172A] text-white px-3.5 py-2 rounded-xl select-none hover:bg-slate-800 transition-colors shadow-xs cursor-pointer">
            <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
              <path d="M3.609 1.814L13.792 12 3.61 22.186a2.03 2.03 0 0 1-.61-.954V2.768c0-.36.223-.7.609-.954zm11.3 11.3l2.364 2.364-12.083 6.974 9.719-9.338zm2.936-2.074l3.155 1.82a1.27 1.27 0 0 1 0 2.2L17.845 13.2l-2.062-2.062 2.062-2.062 2.936 1.964zm-2.936-2.074L5.19 2.56l12.083 6.974-2.364 2.364z" />
            </svg>
            <div className="text-left leading-tight">
              <p className="text-[9px] uppercase tracking-wider text-slate-300">GET IT ON</p>
              <p className="text-xs font-semibold text-white">Google Play</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

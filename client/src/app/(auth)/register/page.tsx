'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2, Check } from 'lucide-react';
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
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
    <div className="w-full max-w-5xl lg:max-w-6xl bg-white rounded-[2rem] sm:rounded-[2.5rem] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35)] overflow-hidden grid grid-cols-1 lg:grid-cols-12 border border-white/30 min-h-[620px]">
      {/* LEFT COLUMN: Clean, Elegant Register Form (Swapped from login layout) */}
      <div className="col-span-1 lg:col-span-5 p-8 sm:p-10 lg:p-12 flex flex-col justify-between bg-white order-2 lg:order-1">
        <div>
          {/* Header Typography matching login design */}
          <div className="mb-6">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-[#1E1B4B] tracking-tight leading-tight">
              Create,
            </h1>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1E1B4B] tracking-tight leading-tight mt-0.5">
              Your account
            </h2>
            <p className="text-xs text-slate-500 mt-2">
              Join Connectly and start messaging in real-time
            </p>
          </div>

          {/* Error Message */}
          {serverError && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-xs font-medium text-red-600 border border-red-200">
              {serverError}
            </div>
          )}

          {/* Register Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Full Name */}
            <div>
              <input
                type="text"
                placeholder="Full name"
                autoComplete="name"
                className="w-full border-0 border-b border-slate-200 focus:border-[#5850EC] focus:ring-0 rounded-none px-0 py-2.5 text-slate-800 placeholder:text-slate-400 text-sm transition-colors outline-hidden bg-transparent"
                {...register('name')}
              />
              {errors.name && (
                <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>
              )}
            </div>

            {/* Username */}
            <div>
              <input
                type="text"
                placeholder="Username (e.g. alex_j)"
                autoComplete="username"
                className="w-full border-0 border-b border-slate-200 focus:border-[#5850EC] focus:ring-0 rounded-none px-0 py-2.5 text-slate-800 placeholder:text-slate-400 text-sm transition-colors outline-hidden bg-transparent"
                {...register('username')}
              />
              {errors.username && (
                <p className="mt-1 text-xs text-red-500">{errors.username.message}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <input
                type="email"
                placeholder="Email address"
                autoComplete="email"
                className="w-full border-0 border-b border-slate-200 focus:border-[#5850EC] focus:ring-0 rounded-none px-0 py-2.5 text-slate-800 placeholder:text-slate-400 text-sm transition-colors outline-hidden bg-transparent"
                {...register('email')}
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                autoComplete="new-password"
                className="w-full border-0 border-b border-slate-200 focus:border-[#5850EC] focus:ring-0 rounded-none px-0 py-2.5 pr-10 text-slate-800 placeholder:text-slate-400 text-sm transition-colors outline-hidden bg-transparent"
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-0 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              {errors.password && (
                <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>
              )}

              {/* Password strength hints */}
              <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-slate-400">
                <span className={`flex items-center gap-1 ${hasMinLength ? 'text-emerald-600 font-medium' : ''}`}>
                  <Check className={`h-3 w-3 ${hasMinLength ? 'opacity-100 text-emerald-600' : 'opacity-30'}`} /> 8+ chars
                </span>
                <span className={`flex items-center gap-1 ${hasUppercase ? 'text-emerald-600 font-medium' : ''}`}>
                  <Check className={`h-3 w-3 ${hasUppercase ? 'opacity-100 text-emerald-600' : 'opacity-30'}`} /> 1 uppercase
                </span>
                <span className={`flex items-center gap-1 ${hasLowercase ? 'text-emerald-600 font-medium' : ''}`}>
                  <Check className={`h-3 w-3 ${hasLowercase ? 'opacity-100 text-emerald-600' : 'opacity-30'}`} /> 1 lowercase
                </span>
                <span className={`flex items-center gap-1 ${hasNumber ? 'text-emerald-600 font-medium' : ''}`}>
                  <Check className={`h-3 w-3 ${hasNumber ? 'opacity-100 text-emerald-600' : 'opacity-30'}`} /> 1 number
                </span>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm password"
                autoComplete="new-password"
                className="w-full border-0 border-b border-slate-200 focus:border-[#5850EC] focus:ring-0 rounded-none px-0 py-2.5 pr-10 text-slate-800 placeholder:text-slate-400 text-sm transition-colors outline-hidden bg-transparent"
                {...register('confirmPassword')}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-0 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              {errors.confirmPassword && (
                <p className="mt-1 text-xs text-red-500">{errors.confirmPassword.message}</p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#5850EC] hover:bg-[#4338CA] text-white font-medium py-3 rounded-lg text-sm shadow-[0_4px_14px_rgba(88,80,236,0.35)] hover:shadow-[0_6px_20px_rgba(88,80,236,0.45)] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Creating account...</span>
                </>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          {/* Social Google Sign-up Button */}
          <div className="mt-4">
            <GoogleSignInButton
              label="Sign up with Google"
              onError={(err) => setServerError(err)}
            />
          </div>

          {/* Sign In Redirect Link */}
          <p className="text-center text-xs text-slate-500 mt-5">
            Already have an account?{' '}
            <Link
              href="/login"
              className="font-semibold text-[#5850EC] hover:text-[#4338CA] hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>

      {/* RIGHT COLUMN: Vector Chat Illustration matching login theme (Swapped on right side) */}
      <div className="hidden lg:flex lg:col-span-7 bg-[#725CEF] items-center justify-center relative overflow-hidden p-6 lg:p-10 select-none order-1 lg:order-2">
        <div className="relative w-full h-full min-h-[500px] flex items-center justify-center">
          <Image
            src="/images/auth-illustration.jpg"
            alt="Connectly Chat Illustration"
            fill
            className="object-contain"
            priority
            sizes="(max-width: 1024px) 100vw, 60vw"
          />
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2, Check } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { GoogleSignInButton } from '@/components/shared/GoogleSignInButton';

// ----------------------------------------------------
// Validation Schemas
// ----------------------------------------------------
const loginSchema = z.object({
  identifier: z.string().min(1, 'Please enter your username or email'),
  password: z.string().min(1, 'Please enter your password'),
});

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

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

interface AuthCardProps {
  initialMode: 'login' | 'register';
}

export function AuthCard({ initialMode }: AuthCardProps) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [isDesktop, setIsDesktop] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const { login, register: registerUser, isLoading } = useAuthStore();

  // Login form state
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loginServerError, setLoginServerError] = useState<string | null>(null);

  // Register form state
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [regServerError, setRegServerError] = useState<string | null>(null);

  // Track viewport width for responsive animations
  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Sync mode when pathname changes
  useEffect(() => {
    if (pathname?.includes('register')) {
      setMode('register');
    } else if (pathname?.includes('login')) {
      setMode('login');
    }
  }, [pathname]);

  // Listen to popstate for smooth sliding on browser Back/Forward
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path.includes('register')) {
        setMode('register');
      } else if (path.includes('login')) {
        setMode('login');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleSwitch = (target: 'login' | 'register') => {
    setMode(target);
    const targetUrl = target === 'register' ? '/register' : '/login';
    window.history.pushState(null, '', targetUrl);
  };

  // Login form hook
  const {
    register: loginFormRegister,
    handleSubmit: handleLoginSubmit,
    formState: { errors: loginErrors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  // Register form hook
  const {
    register: regFormRegister,
    handleSubmit: handleRegSubmit,
    watch: watchReg,
    formState: { errors: regErrors },
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

  const regPasswordValue = watchReg('password', '');
  const hasMinLength = regPasswordValue.length >= 8;
  const hasUppercase = /[A-Z]/.test(regPasswordValue);
  const hasLowercase = /[a-z]/.test(regPasswordValue);
  const hasNumber = /[0-9]/.test(regPasswordValue);

  const onLoginSubmit = async (values: LoginFormValues) => {
    setLoginServerError(null);
    try {
      await login(values);
      router.push('/chat');
    } catch (err: any) {
      setLoginServerError(err.message || 'Invalid username or password');
    }
  };

  const onRegSubmit = async (values: RegisterFormValues) => {
    setRegServerError(null);
    try {
      await registerUser({
        name: values.name,
        username: values.username.toLowerCase(),
        email: values.email.toLowerCase(),
        password: values.password,
      });
      router.push('/chat');
    } catch (err: any) {
      setRegServerError(err.message || 'Registration failed. Please check your inputs.');
    }
  };

  return (
    <div className="w-full max-w-md sm:max-w-lg md:max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-auto bg-white rounded-none sm:rounded-2xl md:rounded-[2rem] lg:rounded-[2.5rem] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35)] overflow-hidden border-0 sm:border border-white/30 relative h-full sm:h-auto sm:max-h-[96dvh] md:h-[660px] flex flex-col md:block">
      {/* ------------------------------------------------------------------ */}
      {/* ILLUSTRATION PANEL                                                 */}
      {/* - On Mobile: Top animated banner with parallax shift               */}
      {/* - On Desktop/Tablet: Full-height sliding panel (58.33% width)       */}
      {/* ------------------------------------------------------------------ */}
      <div
        className="w-full h-24 sm:h-32 md:w-[58.333333%] md:h-full md:absolute md:top-0 md:bottom-0 md:left-0 md:z-20 bg-[#725CEF] flex items-center justify-center overflow-hidden p-2 sm:p-3 md:p-6 lg:p-10 select-none md:shadow-[0_0_50px_rgba(0,0,0,0.18)] transition-transform duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-transform shrink-0"
        style={{
          transform: isDesktop
            ? mode === 'register'
              ? 'translateX(71.428571%)'
              : 'translateX(0%)'
            : 'none',
        }}
      >
        <div
          className="relative w-full h-full min-h-[85px] sm:min-h-[120px] md:min-h-[500px] flex items-center justify-center transition-transform duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-transform"
          style={{
            transform: !isDesktop
              ? mode === 'register'
                ? 'scale(1.06) translateX(12px)'
                : 'scale(1) translateX(-12px)'
              : 'none',
          }}
        >
          <Image
            src="/images/auth-illustration.webp"
            alt="Connectly Chat Illustration"
            fill
            className="object-contain"
            priority
            unoptimized
          />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* MOBILE INTERACTIVE TAB SLIDER (Visible on Mobile only)             */}
      {/* ------------------------------------------------------------------ */}
      <div className="md:hidden px-4 sm:px-6 pt-2 pb-1 sm:pt-4 bg-white shrink-0">
        <div className="bg-slate-100 p-1 rounded-xl relative flex select-none">
          {/* Animated active pill indicator */}
          <div
            className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-lg shadow-xs transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{
              transform: mode === 'register' ? 'translateX(100%)' : 'translateX(0%)',
            }}
          />
          <button
            type="button"
            onClick={() => handleSwitch('login')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg relative z-10 transition-colors duration-300 ${
              mode === 'login' ? 'text-slate-900' : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => handleSwitch('register')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg relative z-10 transition-colors duration-300 ${
              mode === 'register' ? 'text-slate-900' : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            Create Account
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* FORMS CONTAINER                                                    */}
      {/* - On Mobile: Horizontal carousel track sliding between forms       */}
      {/* - On Desktop/Tablet: Absolute 2-column layout with fade/slide       */}
      {/* ------------------------------------------------------------------ */}
      <div className="w-full flex-1 overflow-hidden md:overflow-visible md:w-full md:h-full min-h-0 flex flex-col md:block">
        <div
          className="w-[200%] md:w-full h-full flex md:block transition-transform duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-transform"
          style={{
            transform: !isDesktop
              ? mode === 'register'
                ? 'translateX(-50%)'
                : 'translateX(0%)'
              : 'none',
          }}
        >
          {/* ---------------------------------------------------------------- */}
          {/* LOGIN FORM PANEL                                                 */}
          {/* ---------------------------------------------------------------- */}
          <div
            className={`w-1/2 md:w-[41.666667%] md:right-0 md:top-0 md:bottom-0 md:h-full md:absolute px-5 py-2.5 sm:p-6 md:p-8 lg:p-12 flex flex-col justify-between bg-white overflow-y-auto overscroll-contain transition-all duration-500 ${
              isDesktop
                ? mode === 'login'
                  ? 'opacity-100 translate-x-0 pointer-events-auto z-10 delay-150'
                  : 'opacity-0 translate-x-8 pointer-events-none'
                : 'opacity-100'
            }`}
          >
            <div>
              {/* Header Typography */}
              <div className="mb-2.5 sm:mb-4 md:mb-8">
                <h1 className="text-xl sm:text-2xl md:text-4xl font-extrabold text-[#1E1B4B] tracking-tight leading-tight">
                  Hello,
                </h1>
                <h2 className="text-xl sm:text-2xl md:text-4xl font-extrabold text-[#1E1B4B] tracking-tight leading-tight mt-0.5">
                  Welcome back
                </h2>
              </div>

              {/* Error Message */}
              {loginServerError && (
                <div className="mb-3 sm:mb-5 rounded-lg bg-red-50 p-2 sm:p-2.5 text-xs font-medium text-red-600 border border-red-200">
                  {loginServerError}
                </div>
              )}

              {/* Form Fields */}
              <form onSubmit={handleLoginSubmit(onLoginSubmit)} className="space-y-2.5 sm:space-y-4 md:space-y-6">
                {/* Username or email input */}
                <div>
                  <input
                    type="text"
                    placeholder="Username or email"
                    autoComplete="username"
                    className="w-full border-0 border-b border-slate-200 focus:border-[#5850EC] focus:ring-0 rounded-none px-0 py-1.5 sm:py-2 md:py-3 text-slate-800 placeholder:text-slate-400 text-base sm:text-sm transition-colors outline-hidden bg-transparent"
                    {...loginFormRegister('identifier')}
                  />
                  {loginErrors.identifier && (
                    <p className="mt-0.5 text-xs text-red-500">{loginErrors.identifier.message}</p>
                  )}
                </div>

                {/* Password input with toggle button */}
                <div className="relative">
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    placeholder="Password"
                    autoComplete="current-password"
                    className="w-full border-0 border-b border-slate-200 focus:border-[#5850EC] focus:ring-0 rounded-none px-0 py-1.5 sm:py-2 md:py-3 pr-9 text-slate-800 placeholder:text-slate-400 text-base sm:text-sm transition-colors outline-hidden bg-transparent"
                    {...loginFormRegister('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute right-0 top-1 sm:top-1.5 md:top-2.5 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                    aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                  >
                    {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  {loginErrors.password && (
                    <p className="mt-0.5 text-xs text-red-500">{loginErrors.password.message}</p>
                  )}
                </div>

                {/* Remember me & Forgot password */}
                <div className="flex items-center justify-between pt-0.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none py-0.5">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-[#5850EC] focus:ring-[#5850EC] cursor-pointer"
                    />
                    <span className="text-xs text-slate-600 font-medium">Remember me</span>
                  </label>

                  <Link
                    href="/forgot-password"
                    className="text-xs text-slate-500 hover:text-slate-800 transition-colors py-0.5"
                  >
                    Forgot password?
                  </Link>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-[#5850EC] hover:bg-[#4338CA] text-white font-medium py-2 sm:py-2.5 md:py-3 rounded-lg text-sm shadow-[0_4px_14px_rgba(88,80,236,0.35)] hover:shadow-[0_6px_20px_rgba(88,80,236,0.45)] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Logging in...</span>
                    </>
                  ) : (
                    'Login'
                  )}
                </button>
              </form>

              {/* Social Google Login Button */}
              <div className="mt-2.5 sm:mt-3.5 md:mt-4">
                <GoogleSignInButton
                  label="Continue with Google"
                  onError={(err) => setLoginServerError(err)}
                />
              </div>

              {/* Sign Up Redirect Link */}
              <p className="text-center text-xs text-slate-500 mt-2.5 sm:mt-4 md:mt-5 pb-1">
                Don&apos;t have an account?{' '}
                <a
                  href="/register"
                  onClick={(e) => {
                    e.preventDefault();
                    handleSwitch('register');
                  }}
                  className="font-semibold text-[#5850EC] hover:text-[#4338CA] hover:underline cursor-pointer"
                  aria-label="Create a new Connectly account"
                >
                  Create an account
                </a>
              </p>
            </div>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* REGISTER FORM PANEL                                              */}
          {/* ---------------------------------------------------------------- */}
          <div
            className={`w-1/2 md:w-[41.666667%] md:left-0 md:top-0 md:bottom-0 md:h-full md:absolute px-5 py-2.5 sm:p-6 md:p-8 lg:p-10 flex flex-col justify-between bg-white overflow-y-auto overscroll-contain transition-all duration-500 ${
              isDesktop
                ? mode === 'register'
                  ? 'opacity-100 translate-x-0 pointer-events-auto z-10 delay-150'
                  : 'opacity-0 -translate-x-8 pointer-events-none'
                : 'opacity-100'
            }`}
          >
            <div>
              {/* Header Typography */}
              <div className="mb-2 sm:mb-3.5 md:mb-5">
                <h1 className="text-xl sm:text-2xl md:text-4xl font-extrabold text-[#1E1B4B] tracking-tight leading-tight">
                  Create,
                </h1>
                <h2 className="text-xl sm:text-2xl md:text-4xl font-extrabold text-[#1E1B4B] tracking-tight leading-tight mt-0.5">
                  Your account
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 hidden sm:block">
                  Join Connectly and start messaging in real-time
                </p>
              </div>

              {/* Error Message */}
              {regServerError && (
                <div className="mb-2 rounded-lg bg-red-50 p-2 text-xs font-medium text-red-600 border border-red-200">
                  {regServerError}
                </div>
              )}

              {/* Register Form */}
              <form onSubmit={handleRegSubmit(onRegSubmit)} className="space-y-1.5 sm:space-y-2.5 md:space-y-3.5">
                {/* Full Name */}
                <div>
                  <input
                    type="text"
                    placeholder="Full name"
                    autoComplete="name"
                    className="w-full border-0 border-b border-slate-200 focus:border-[#5850EC] focus:ring-0 rounded-none px-0 py-1 sm:py-1.5 md:py-2 text-slate-800 placeholder:text-slate-400 text-base sm:text-sm transition-colors outline-hidden bg-transparent"
                    {...regFormRegister('name')}
                  />
                  {regErrors.name && (
                    <p className="mt-0.5 text-xs text-red-500">{regErrors.name.message}</p>
                  )}
                </div>

                {/* Username */}
                <div>
                  <input
                    type="text"
                    placeholder="Username (e.g. alex_j)"
                    autoComplete="username"
                    className="w-full border-0 border-b border-slate-200 focus:border-[#5850EC] focus:ring-0 rounded-none px-0 py-1 sm:py-1.5 md:py-2 text-slate-800 placeholder:text-slate-400 text-base sm:text-sm transition-colors outline-hidden bg-transparent"
                    {...regFormRegister('username')}
                  />
                  {regErrors.username && (
                    <p className="mt-0.5 text-xs text-red-500">{regErrors.username.message}</p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <input
                    type="email"
                    placeholder="Email address"
                    autoComplete="email"
                    className="w-full border-0 border-b border-slate-200 focus:border-[#5850EC] focus:ring-0 rounded-none px-0 py-1 sm:py-1.5 md:py-2 text-slate-800 placeholder:text-slate-400 text-base sm:text-sm transition-colors outline-hidden bg-transparent"
                    {...regFormRegister('email')}
                  />
                  {regErrors.email && (
                    <p className="mt-0.5 text-xs text-red-500">{regErrors.email.message}</p>
                  )}
                </div>

                {/* Password */}
                <div className="relative">
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    placeholder="Password"
                    autoComplete="new-password"
                    className="w-full border-0 border-b border-slate-200 focus:border-[#5850EC] focus:ring-0 rounded-none px-0 py-1 sm:py-1.5 md:py-2 pr-9 text-slate-800 placeholder:text-slate-400 text-base sm:text-sm transition-colors outline-hidden bg-transparent"
                    {...regFormRegister('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    className="absolute right-0 top-0.5 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                    aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                  >
                    {showRegPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  {regErrors.password && (
                    <p className="mt-0.5 text-xs text-red-500">{regErrors.password.message}</p>
                  )}

                  {/* Password strength indicators */}
                  <div className="mt-0.5 grid grid-cols-2 gap-0.5 text-[9px] sm:text-[10px] text-slate-400">
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
                    className="w-full border-0 border-b border-slate-200 focus:border-[#5850EC] focus:ring-0 rounded-none px-0 py-1 sm:py-1.5 md:py-2 pr-9 text-slate-800 placeholder:text-slate-400 text-base sm:text-sm transition-colors outline-hidden bg-transparent"
                    {...regFormRegister('confirmPassword')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-0 top-0.5 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  {regErrors.confirmPassword && (
                    <p className="mt-0.5 text-xs text-red-500">{regErrors.confirmPassword.message}</p>
                  )}
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-[#5850EC] hover:bg-[#4338CA] text-white font-medium py-2 sm:py-2.5 rounded-lg text-sm shadow-[0_4px_14px_rgba(88,80,236,0.35)] hover:shadow-[0_6px_20px_rgba(88,80,236,0.45)] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-0.5"
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
              <div className="mt-2 sm:mt-3">
                <GoogleSignInButton
                  label="Sign up with Google"
                  onError={(err) => setRegServerError(err)}
                />
              </div>

              {/* Sign In Redirect Link */}
              <p className="text-center text-xs text-slate-500 mt-2 sm:mt-3 pb-1">
                Already have an account?{' '}
                <a
                  href="/login"
                  onClick={(e) => {
                    e.preventDefault();
                    handleSwitch('login');
                  }}
                  className="font-semibold text-[#5850EC] hover:text-[#4338CA] hover:underline cursor-pointer"
                  aria-label="Sign in to your Connectly account"
                >
                  Sign in instead
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

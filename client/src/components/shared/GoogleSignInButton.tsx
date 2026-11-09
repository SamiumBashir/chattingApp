'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { Loader2 } from 'lucide-react';

interface GoogleSignInButtonProps {
  label?: string;
  onError?: (error: string) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: 'standard' | 'icon';
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              logo_alignment?: 'left' | 'center';
              width?: string | number;
            }
          ) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  label = 'Continue with Google',
  onError,
}) => {
  const router = useRouter();
  const { googleLogin, isLoading } = useAuthStore();
  const [isSdkLoaded, setIsSdkLoaded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const buttonContainerRef = useRef<HTMLDivElement>(null);

  const clientId =
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    '1059985140649-olcn0thicrmc95ebml1fk3f0jb3liefm.apps.googleusercontent.com';

  // Check if SDK is already loaded on window
  useEffect(() => {
    if (typeof window !== 'undefined' && window.google?.accounts?.id) {
      setIsSdkLoaded(true);
    }
  }, []);

  // Handle credential response from Google
  const handleCredentialResponse = useCallback(
    async (credential: string) => {
      setIsSubmitting(true);
      try {
        await googleLogin(credential);
        router.push('/chat');
      } catch (err: any) {
        const msg = err.message || 'Google authentication failed';
        if (onError) {
          onError(msg);
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [googleLogin, router, onError]
  );

  // Initialize Google One Tap in background without rendering heavy iframes
  useEffect(() => {
    if (isSdkLoaded && clientId && window.google?.accounts?.id) {
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response: { credential: string }) => {
            if (response.credential) {
              handleCredentialResponse(response.credential);
            }
          },
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('Error initializing Google Auth:', err);
      }
    }
  }, [isSdkLoaded, clientId, handleCredentialResponse]);

  // Handle click on Google sign-in button
  const handleGoogleClick = async () => {
    if (clientId && window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
      return;
    }

    // Developer instant demo flow when GOOGLE_CLIENT_ID is not yet configured in .env
    setIsSubmitting(true);
    try {
      await googleLogin('test_google_demo_user');
      router.push('/chat');
    } catch (err: any) {
      const msg = err.message || 'Google sign-in demo failed';
      if (onError) onError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      {/* Deduplicated lazy-loaded Google Identity Services SDK to protect LCP */}
      {clientId && (
        <Script
          id="google-identity-services-sdk"
          src="https://accounts.google.com/gsi/client"
          strategy="lazyOnload"
          onLoad={() => setIsSdkLoaded(true)}
        />
      )}

      {/* High-performance custom Google button: zero iframes, zero layout shifts, instant render */}
      <button
        type="button"
        onClick={handleGoogleClick}
        disabled={isLoading || isSubmitting}
        className="relative flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-xs transition-all hover:bg-muted/60 focus:outline-hidden focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 h-[44px]"
      >
        {isSubmitting ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
        )}
        <span>{label}</span>
        {!clientId && (
          <span className="ml-auto text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary">
            Demo
          </span>
        )}
      </button>
    </div>
  );
};


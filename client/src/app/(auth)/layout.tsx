import React from 'react';
import Link from 'next/link';
import { MessageSquare, ShieldCheck } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col justify-center bg-muted/40 py-12 sm:px-6 lg:px-8">
      {/* Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <MessageSquare className="h-6 w-6" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-foreground">Connectly</span>
        </Link>
      </div>

      {/* Main Auth Form Container */}
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="rounded-xl border bg-card p-6 sm:p-8 shadow-card">
          {children}
        </div>

        {/* Security badge footer */}
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span>Secured with end-to-end authentication & encrypted sessions</span>
        </div>
      </div>
    </div>
  );
}


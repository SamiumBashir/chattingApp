import type { Metadata, Viewport } from 'next';
import './globals.css';
import QueryProvider from '@/components/providers/QueryProvider';

export const metadata: Metadata = {
  title: 'Connectly — Modern Real-Time Messaging Platform',
  description:
    'A production-minded, real-time messaging platform inspired by WhatsApp, Messenger, and modern SaaS applications.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://accounts.google.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://accounts.google.com" />
        <link rel="dns-prefetch" href="https://chattingapp-lsbw.onrender.com" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased text-foreground">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}


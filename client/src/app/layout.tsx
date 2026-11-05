import type { Metadata } from 'next';
import './globals.css';
import QueryProvider from '@/components/providers/QueryProvider';

export const metadata: Metadata = {
  title: 'Connectly — Modern Real-Time Messaging Platform',
  description:
    'A production-minded, real-time messaging platform inspired by WhatsApp, Messenger, and modern SaaS applications.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased text-foreground">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}


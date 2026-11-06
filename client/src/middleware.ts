import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect /chat route at the edge: if not authenticated, redirect to /login immediately
  if (pathname.startsWith('/chat')) {
    const sessionCookie =
      request.cookies.get('connectly_logged_in') ||
      request.cookies.get('accessToken') ||
      request.cookies.get('connectly_access_token');

    if (!sessionCookie) {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/chat/:path*'],
};


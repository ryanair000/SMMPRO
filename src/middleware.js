import { NextResponse } from 'next/server';

export function middleware(request) {
  const path = request.nextUrl.pathname;

  const isPublicPath = path === '/login' || path.startsWith('/api/');

  const token = request.cookies.get('auth-token')?.value || '';

  if (!isPublicPath && !token) {
    return NextResponse.redirect(new URL('/login', request.nextUrl));
  }

  if (isPublicPath && token && path === '/login') {
    return NextResponse.redirect(new URL('/', request.nextUrl));
  }
}

export const config = {
  matcher: [
    '/',
    '/login',
  ],
};

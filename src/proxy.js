import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';

export function proxy(request) {
  const path = request.nextUrl.pathname;
  const isLoginPath = path === '/login';
  const session = getSessionFromRequest(request);

  if (!session && !isLoginPath) {
    return NextResponse.redirect(new URL('/login', request.nextUrl));
  }

  if (session && isLoginPath) {
    return NextResponse.redirect(new URL('/', request.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/login'
  ]
};

import { NextResponse } from 'next/server';
import {
  AUTH_COOKIE_NAME,
  createSessionToken,
  getSessionCookieOptions,
  verifyPassword
} from '@/lib/auth';
import { assertContentLength, rateLimit } from '@/lib/rateLimit';

const MAX_AUTH_BODY_BYTES = 4096;

export async function POST(request) {
  try {
    const sizeError = assertContentLength(request, MAX_AUTH_BODY_BYTES);
    if (sizeError) return sizeError;

    const rateLimitError = rateLimit(request, {
      scope: 'auth',
      limit: 10,
      windowMs: 5 * 60 * 1000
    });
    if (rateLimitError) return rateLimitError;

    let credentials;
    try {
      credentials = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { email, password } = credentials;
    const adminEmail = process.env.ADMIN_EMAIL?.trim();
    const adminPassword = process.env.ADMIN_PASSWORD?.trim();

    if (!adminEmail || !adminPassword || !process.env.AUTH_SECRET?.trim()) {
      return NextResponse.json({ error: 'Authentication is not configured' }, { status: 500 });
    }

    if (email === adminEmail && verifyPassword(password, adminPassword)) {
      const response = NextResponse.json({ success: true });
      response.cookies.set({
        name: AUTH_COOKIE_NAME,
        value: createSessionToken(adminEmail),
        ...getSessionCookieOptions()
      });
      return response;
    }

    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}

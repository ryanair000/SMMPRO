import { NextResponse } from 'next/server';

const buckets = new Map();

function getClientKey(request, scope) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = request.headers.get('x-real-ip')?.trim();
  return `${scope}:${forwardedFor || realIp || 'unknown'}`;
}

export function rateLimit(request, { scope, limit, windowMs }) {
  const key = getClientKey(request, scope);
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  existing.count += 1;

  if (existing.count > limit) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again shortly.' },
      {
        status: 429,
        headers: {
          'Retry-After': Math.ceil((existing.resetAt - now) / 1000).toString()
        }
      }
    );
  }

  return null;
}

export function assertContentLength(request, maxBytes) {
  const contentLength = Number(request.headers.get('content-length') || 0);

  if (contentLength > maxBytes) {
    return NextResponse.json({ error: 'Request body is too large' }, { status: 413 });
  }

  return null;
}

import { NextResponse } from 'next/server';
import { verifyTikTokMediaRequest } from '@/lib/tiktok';
import { rateLimit } from '@/lib/rateLimit';

export const maxDuration = 30;

export async function GET(request) {
  const limited = rateLimit(request, { scope: 'tiktok-media', limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  try {
    const url = new URL(request.url);
    const source = verifyTikTokMediaRequest(
      url.searchParams.get('src'),
      url.searchParams.get('exp'),
      url.searchParams.get('sig'),
    );
    const upstream = await fetch(source, {
      redirect: 'error',
      cache: 'no-store',
      headers: { accept: 'image/webp,image/jpeg' },
    });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: 'TikTok media source is unavailable.' }, { status: 502 });
    }
    const contentType = upstream.headers.get('content-type') || '';
    if (!['image/webp', 'image/jpeg'].some(type => contentType.startsWith(type))) {
      return NextResponse.json(
        { error: 'TikTok media must be JPEG or WebP. Re-upload this poster from Socio.' },
        { status: 415 },
      );
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'content-type': contentType,
        'cache-control': 'public, max-age=3600, s-maxage=86400, immutable',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'TikTok media request failed.' },
      { status: 400 },
    );
  }
}

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { fetchTikTokPublishStatus } from '@/lib/tiktok';
import { rateLimit } from '@/lib/rateLimit';

export async function POST(request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  const limited = rateLimit(request, {
    scope: 'tiktok-publish-status',
    limit: 25,
    windowMs: 60_000,
  });
  if (limited) return limited;
  try {
    const body = await request.json();
    return NextResponse.json(await fetchTikTokPublishStatus(body.publishId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not check TikTok post.' },
      { status: 502 },
    );
  }
}

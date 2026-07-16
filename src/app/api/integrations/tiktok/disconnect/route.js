import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { disconnectTikTok } from '@/lib/tiktok';
import { rateLimit } from '@/lib/rateLimit';

export async function POST(request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  const limited = rateLimit(request, { scope: 'tiktok-disconnect', limit: 10, windowMs: 60_000 });
  if (limited) return limited;
  try {
    await disconnectTikTok();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not disconnect TikTok.' },
      { status: 500 },
    );
  }
}

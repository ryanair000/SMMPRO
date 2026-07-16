import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getTikTokConnectionStatus } from '@/lib/tiktok';

export async function GET(request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  try {
    return NextResponse.json(await getTikTokConnectionStatus({ refresh: true }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not check TikTok.' },
      { status: 500 },
    );
  }
}

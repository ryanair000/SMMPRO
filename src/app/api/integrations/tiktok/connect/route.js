import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { buildTikTokAuthorizationUrl, getTikTokConfiguration } from '@/lib/tiktok';
import { rateLimit } from '@/lib/rateLimit';

export async function POST(request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  const limited = rateLimit(request, { scope: 'tiktok-connect', limit: 10, windowMs: 60_000 });
  if (limited) return limited;
  try {
    const body = await request.json().catch(() => ({}));
    const configuration = getTikTokConfiguration();
    if (!configuration.configured) {
      return NextResponse.json(
        { error: 'TikTok client credentials are not configured in SMMPRO.' },
        { status: 503 },
      );
    }
    return NextResponse.json({
      url: buildTikTokAuthorizationUrl(body.returnTo),
      musicAlwaysOn: true,
      privacyLevel: configuration.privacyLevel,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not start TikTok authorization.' },
      { status: 400 },
    );
  }
}

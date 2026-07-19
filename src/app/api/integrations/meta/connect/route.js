import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  buildMetaAuthorizationUrl,
  getMetaConfiguration,
} from '@/lib/meta';
import { rateLimit } from '@/lib/rateLimit';

function connectionInput(request, body = {}) {
  const url = new URL(request.url);
  return {
    accountId:
      body.accountId || url.searchParams.get('accountId') || 'jengasites',
    returnTo:
      body.returnTo ||
      url.searchParams.get('returnTo') ||
      'https://socio.jengasites.com/connections',
  };
}

function validateConfiguration() {
  const configuration = getMetaConfiguration();
  if (!configuration.configured) {
    throw new Error('Meta app credentials are not configured in SMMPRO.');
  }
  return configuration;
}

export async function GET(request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  const limited = rateLimit(request, {
    scope: 'meta-connect',
    limit: 10,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    validateConfiguration();
    const { accountId, returnTo } = connectionInput(request);
    return NextResponse.redirect(
      buildMetaAuthorizationUrl(accountId, returnTo),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not start Facebook authorization.',
      },
      { status: 400 },
    );
  }
}

export async function POST(request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  const limited = rateLimit(request, {
    scope: 'meta-connect',
    limit: 10,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    validateConfiguration();
    const body = await request.json().catch(() => ({}));
    const { accountId, returnTo } = connectionInput(request, body);
    return NextResponse.json({
      url: buildMetaAuthorizationUrl(accountId, returnTo),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not start Facebook authorization.',
      },
      { status: 400 },
    );
  }
}

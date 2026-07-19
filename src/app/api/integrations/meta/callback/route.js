import { NextResponse } from 'next/server';
import { completeMetaAuthorization } from '@/lib/meta';

function appendResult(returnTo, values) {
  const url = new URL(returnTo);
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const providerError =
    url.searchParams.get('error_message') ||
    url.searchParams.get('error_description') ||
    url.searchParams.get('error');

  if (providerError) {
    return NextResponse.redirect(
      appendResult('https://socio.jengasites.com/connections', {
        meta: 'error',
        message: providerError,
      }),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      appendResult('https://socio.jengasites.com/connections', {
        meta: 'error',
        message: 'Facebook did not return an authorization code.',
      }),
    );
  }

  try {
    const result = await completeMetaAuthorization({ code, state });
    return NextResponse.redirect(
      appendResult(result.returnTo, {
        meta: 'connected',
        account: result.accountId,
        instagram: result.igUsername || result.igUserId,
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Could not complete Facebook authorization.';
    return NextResponse.redirect(
      appendResult('https://socio.jengasites.com/connections', {
        meta: 'error',
        message,
      }),
    );
  }
}

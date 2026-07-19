import { NextResponse } from 'next/server';
import { POST as publishWithExistingRoute } from '../post/route';
import { getSocialAccount } from '@/lib/socialAccounts';

function graphVersion() {
  return process.env.META_GRAPH_VERSION?.trim() || 'v20.0';
}

async function graphGet(path, params) {
  const url = new URL(
    `https://graph.facebook.com/${graphVersion()}/${path.replace(/^\//, '')}`
  );
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const response = await fetch(url, { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok && !data.error, status: response.status, data };
}

function readEnv(key) {
  return key ? process.env[key]?.trim() : undefined;
}

function tokenError(result) {
  return result?.data?.error?.message || `Meta returned HTTP ${result?.status || 500}`;
}

async function validatePageToken(pageId, pageToken) {
  if (!pageId || !pageToken) return { ok: false, reason: 'missing' };
  const result = await graphGet(`/${pageId}`, {
    fields: 'id',
    access_token: pageToken,
  });
  return result.ok ? { ok: true } : { ok: false, reason: tokenError(result), result };
}

async function validateUserToken(userToken) {
  if (!userToken) return { ok: false, reason: 'missing' };
  const result = await graphGet('/me', {
    fields: 'id',
    access_token: userToken,
  });
  return result.ok ? { ok: true } : { ok: false, reason: tokenError(result), result };
}

async function exchangeUserToken(userToken) {
  const appId = process.env.META_APP_ID?.trim() || process.env.FB_APP_ID?.trim();
  const appSecret =
    process.env.META_APP_SECRET?.trim() || process.env.FB_APP_SECRET?.trim();
  if (!appId || !appSecret || !userToken) return null;

  const result = await graphGet('/oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: userToken,
  });
  return result.ok ? result.data.access_token || null : null;
}

async function fetchPageToken(pageId, userToken) {
  const result = await graphGet(`/${pageId}`, {
    fields: 'access_token',
    access_token: userToken,
  });
  return result.ok ? result.data.access_token || null : null;
}

async function ensureFreshMetaCredentials(accountId) {
  const account = getSocialAccount(accountId);
  const pageId = readEnv(account.env?.pageId) || readEnv(account.legacyEnv?.pageId);
  const pageTokenKey = account.env?.pageToken;
  const userTokenKey = account.env?.userToken;
  const currentPageToken =
    readEnv(pageTokenKey) || readEnv(account.legacyEnv?.pageToken);
  const currentUserToken =
    readEnv(userTokenKey) || readEnv(account.legacyEnv?.userToken);

  const pageTokenStatus = await validatePageToken(pageId, currentPageToken);
  if (pageTokenStatus.ok) return;

  const exchangedUserToken = await exchangeUserToken(currentUserToken);
  const candidateUserToken = exchangedUserToken || currentUserToken;
  const userTokenStatus = await validateUserToken(candidateUserToken);
  if (!userTokenStatus.ok) {
    console.warn(
      `[meta-token-refresh] ${accountId}: Page token is invalid and the user token cannot refresh it: ${userTokenStatus.reason}`
    );
    return;
  }

  const refreshedPageToken = await fetchPageToken(pageId, candidateUserToken);
  if (!refreshedPageToken) {
    console.warn(
      `[meta-token-refresh] ${accountId}: Meta did not return a replacement Page token.`
    );
    return;
  }

  if (pageTokenKey) process.env[pageTokenKey] = refreshedPageToken;
  if (userTokenKey && exchangedUserToken) {
    process.env[userTokenKey] = exchangedUserToken;
  }
  if (account.legacyEnv?.pageToken && accountId === 'chezahub') {
    process.env[account.legacyEnv.pageToken] = refreshedPageToken;
  }
  if (account.legacyEnv?.userToken && accountId === 'chezahub' && exchangedUserToken) {
    process.env[account.legacyEnv.userToken] = exchangedUserToken;
  }

  console.info(`[meta-token-refresh] ${accountId}: refreshed the Page access token.`);
}

export async function POST(request) {
  try {
    const formData = await request.clone().formData();
    const accountId = formData.get('accountId')?.toString() || 'chezahub';
    await ensureFreshMetaCredentials(accountId);
  } catch (error) {
    console.warn(
      `[meta-token-refresh] Could not preflight Meta credentials: ${
        error instanceof Error ? error.message : 'unknown error'
      }`
    );
  }

  try {
    return await publishWithExistingRoute(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Publishing failed.' },
      { status: 500 }
    );
  }
}

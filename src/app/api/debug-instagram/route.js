import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

function graphUrl(path) {
  const version = process.env.META_GRAPH_VERSION?.trim() || 'v20.0';
  return `https://graph.facebook.com/${version}/${path.replace(/^\//, '')}`;
}

export async function GET(request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const USER_TOKEN = process.env.FB_USER_ACCESS_TOKEN?.trim();
  const PAGE_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN?.trim();
  const IG_USER_ID = process.env.IG_USER_ID?.trim();

  const results = {
    env: {
      IG_USER_ID: IG_USER_ID ? 'CONFIGURED' : 'MISSING',
      USER_TOKEN: USER_TOKEN ? 'CONFIGURED' : 'MISSING',
      PAGE_TOKEN: PAGE_TOKEN ? 'CONFIGURED' : 'MISSING',
    },
    userTokenTest: null,
    igAccountTest: null,
    pageTokenIgTest: null,
  };

  // Test 1: Verify USER_TOKEN is valid and has IG permissions
  if (USER_TOKEN) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/me?fields=id,name&access_token=${USER_TOKEN}`
      );
      const data = await res.json();
      results.userTokenTest = { status: res.status, data };
    } catch (e) {
      results.userTokenTest = { error: e.message };
    }
  } else {
    results.userTokenTest = 'SKIPPED - USER_TOKEN missing';
  }

  // Test 2: Check IG account info using USER_TOKEN
  if (USER_TOKEN && IG_USER_ID) {
    try {
      const res = await fetch(
        `${graphUrl(`/${IG_USER_ID}`)}?fields=id,username,account_type,media_count&access_token=${USER_TOKEN}`
      );
      const data = await res.json();
      results.igAccountTest = { label: 'USER_TOKEN -> IG account', status: res.status, data };
    } catch (e) {
      results.igAccountTest = { error: e.message };
    }
  }

  // Test 3: Check IG account info using PAGE_TOKEN (compare)
  if (PAGE_TOKEN && IG_USER_ID) {
    try {
      const res = await fetch(
        `${graphUrl(`/${IG_USER_ID}`)}?fields=id,username,account_type&access_token=${PAGE_TOKEN}`
      );
      const data = await res.json();
      results.pageTokenIgTest = { label: 'PAGE_TOKEN -> IG account', status: res.status, data };
    } catch (e) {
      results.pageTokenIgTest = { error: e.message };
    }
  }

  return NextResponse.json(results, { status: 200 });
}

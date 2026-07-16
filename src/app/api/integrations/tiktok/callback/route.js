import { NextResponse } from 'next/server';
import {
  exchangeTikTokCode,
  readTikTokState,
  saveTikTokConnection,
} from '@/lib/tiktok';

function redirectWithResult(returnTo, values) {
  const target = new URL(returnTo);
  Object.entries(values).forEach(([key, value]) => target.searchParams.set(key, String(value)));
  return NextResponse.redirect(target);
}

export async function GET(request) {
  let returnTo = 'https://socio.jengasites.com/tiktok';
  try {
    const url = new URL(request.url);
    const state = readTikTokState(url.searchParams.get('state'));
    returnTo = state.returnTo;
    const denied = url.searchParams.get('error');
    if (denied) {
      return redirectWithResult(returnTo, {
        tiktok: 'error',
        message: url.searchParams.get('error_description') || denied,
      });
    }
    const token = await exchangeTikTokCode(url.searchParams.get('code'));
    const grantedScopes = String(token.scope || '')
      .split(',')
      .map(value => value.trim());
    if (!grantedScopes.includes('video.publish')) {
      throw new Error('TikTok permission video.publish was not granted.');
    }
    const status = await saveTikTokConnection(token);
    return redirectWithResult(returnTo, {
      tiktok: 'connected',
      username: status.username || status.nickname || 'ChezaHub',
    });
  } catch (error) {
    return redirectWithResult(returnTo, {
      tiktok: 'error',
      message: error instanceof Error ? error.message : 'TikTok connection failed.',
    });
  }
}

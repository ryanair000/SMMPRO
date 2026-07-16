import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { SOCIAL_ACCOUNTS, getAccountCredentials } from '@/lib/socialAccounts';
import { getTikTokConnectionStatus } from '@/lib/tiktok';

export const maxDuration = 30;

function graphUrl(path) {
  const version = process.env.META_GRAPH_VERSION?.trim() || 'v20.0';
  return `https://graph.facebook.com/${version}/${path.replace(/^\//, '')}`;
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

async function checkMeta(path, token, fields) {
  if (!path || !token) return { configured: false, healthy: false };
  try {
    const url = new URL(graphUrl(`/${path}`));
    url.searchParams.set('fields', fields);
    url.searchParams.set('access_token', token);
    const response = await fetch(url, { cache: 'no-store' });
    const data = await readJson(response);
    return {
      configured: true,
      healthy: response.ok && !data.error,
      label: data.name || data.username || undefined,
      error: data.error?.message || undefined
    };
  } catch {
    return { configured: true, healthy: false, error: 'Meta health check failed' };
  }
}

async function checkOpenAI(apiKey) {
  if (!apiKey) return { configured: false, healthy: false };
  try {
    const response = await fetch('https://api.openai.com/v1/models/gpt-4o-mini', {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store'
    });
    return { configured: true, healthy: response.ok };
  } catch {
    return { configured: true, healthy: false };
  }
}

async function checkTelegram(token) {
  if (!token) return { configured: false, healthy: false };
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      cache: 'no-store'
    });
    const data = await readJson(response);
    return {
      configured: true,
      healthy: Boolean(response.ok && data.ok),
      detail: data.result?.username ? `@${data.result.username}` : undefined
    };
  } catch {
    return { configured: true, healthy: false };
  }
}

export async function GET(request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const accounts = await Promise.all(
    SOCIAL_ACCOUNTS.map(async account => {
      const { credentials } = getAccountCredentials(account.id);
      const [facebook, instagram] = await Promise.all([
        checkMeta(credentials.pageId, credentials.pageToken, 'name'),
        checkMeta(credentials.igUserId, credentials.userToken, 'username,name')
      ]);
      return { id: account.id, name: account.name, facebook, instagram };
    })
  );

  const allowedChatCount = (process.env.TELEGRAM_ALLOWED_CHAT_IDS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean).length;
  const [openai, telegram, tiktok] = await Promise.all([
    checkOpenAI(process.env.OPENAI_API_KEY?.trim()),
    checkTelegram(process.env.TELEGRAM_BOT_TOKEN?.trim()),
    getTikTokConnectionStatus({ refresh: true }).catch(error => ({
      configured: Boolean(process.env.TIKTOK_CLIENT_KEY?.trim() && process.env.TIKTOK_CLIENT_SECRET?.trim()),
      connected: false,
      accountId: 'chezahub',
      musicAlwaysOn: true,
      autoAddMusic: true,
      error: error instanceof Error ? error.message : 'TikTok health check failed.'
    }))
  ]);

  return NextResponse.json({
    source: 'SMMPRO',
    graphVersion: process.env.META_GRAPH_VERSION?.trim() || 'v20.0',
    services: {
      auth: {
        configured: Boolean(process.env.ADMIN_EMAIL?.trim() && process.env.ADMIN_PASSWORD?.trim()),
        healthy: true
      },
      openai,
      telegram: {
        ...telegram,
        allowedChatCount,
        webhookSecretConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET?.trim())
      },
      metaApp: {
        configured: Boolean(process.env.META_APP_ID?.trim() && process.env.META_APP_SECRET?.trim()),
        healthy: Boolean(process.env.META_APP_ID?.trim() && process.env.META_APP_SECRET?.trim())
      },
      tiktok: {
        ...tiktok,
        healthy: Boolean(tiktok.configured && tiktok.connected)
      }
    },
    accounts
  });
}

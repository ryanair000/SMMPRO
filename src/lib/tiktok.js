import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';

const TIKTOK_API_BASE = 'https://open.tiktokapis.com';
const TIKTOK_AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const CONNECTION_ID = 'chezahub';
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const STATE_TTL_SECONDS = 10 * 60;
const MEDIA_URL_TTL_SECONDS = 24 * 60 * 60;
const DEFAULT_REDIRECT_URI =
  'https://smmpro.lokimax.top/api/integrations/tiktok/callback';
const DEFAULT_PUBLIC_URL = 'https://smmpro.lokimax.top';
const DEFAULT_SOCIO_ORIGINS = [
  'https://socio.jengasites.com',
  'https://socio-beryl.vercel.app',
];

let sql;
let schemaPromise;

function readEnv(name) {
  return process.env[name]?.trim() || '';
}

function getConfig() {
  return {
    clientKey: readEnv('TIKTOK_CLIENT_KEY'),
    clientSecret: readEnv('TIKTOK_CLIENT_SECRET'),
    redirectUri: readEnv('TIKTOK_REDIRECT_URI') || DEFAULT_REDIRECT_URI,
    publicUrl: (readEnv('SMMPRO_PUBLIC_URL') || DEFAULT_PUBLIC_URL).replace(/\/$/, ''),
    unaudited: readEnv('TIKTOK_UNAUDITED_MODE').toLowerCase() !== 'false',
    privacyLevel: readEnv('TIKTOK_PRIVACY_LEVEL') || 'SELF_ONLY',
  };
}

function getSql() {
  const databaseUrl = readEnv('DATABASE_URL');
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for TikTok connections.');
  }
  sql ||= neon(databaseUrl);
  return sql;
}

export function ensureTikTokSchema() {
  schemaPromise ||= getSql().transaction([
    getSql()`CREATE TABLE IF NOT EXISTS smmpro_tiktok_connections (
      account_id text PRIMARY KEY,
      open_id text NOT NULL,
      encrypted_access_token text NOT NULL,
      encrypted_refresh_token text NOT NULL,
      access_token_expires_at timestamptz NOT NULL,
      refresh_token_expires_at timestamptz NOT NULL,
      scope text NOT NULL DEFAULT '',
      creator_username text,
      creator_nickname text,
      creator_avatar_url text,
      privacy_level_options jsonb NOT NULL DEFAULT '[]'::jsonb,
      comment_disabled boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    getSql()`CREATE INDEX IF NOT EXISTS smmpro_tiktok_connections_expiry_idx
      ON smmpro_tiktok_connections (access_token_expires_at, refresh_token_expires_at)`,
  ]);
  return schemaPromise;
}

function getSecretSeed() {
  const { clientSecret } = getConfig();
  const adminEmail = readEnv('ADMIN_EMAIL');
  const adminPassword = readEnv('ADMIN_PASSWORD');
  if (!adminEmail || !adminPassword || !clientSecret) {
    throw new Error(
      'ADMIN_EMAIL, ADMIN_PASSWORD, and TIKTOK_CLIENT_SECRET are required for TikTok token protection.',
    );
  }
  return `smmpro-tiktok-v1:${adminEmail}:${adminPassword}:${clientSecret}`;
}

function getEncryptionKey() {
  return crypto.createHash('sha256').update(getSecretSeed()).digest();
}

function encryptToken(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

function decryptToken(value) {
  const [version, iv, tag, encrypted] = String(value || '').split('.');
  if (version !== 'v1' || !iv || !tag || !encrypted) {
    throw new Error('Stored TikTok credentials are invalid. Reconnect TikTok.');
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function stateSecret() {
  return crypto.createHash('sha256').update(`${getSecretSeed()}:oauth-state`).digest();
}

function signValue(value, purpose) {
  return crypto
    .createHmac('sha256', getEncryptionKey())
    .update(`${purpose}\n${value}`)
    .digest('base64url');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function allowedSocioOrigins() {
  const configured = readEnv('SOCIO_RETURN_ORIGINS')
    .split(',')
    .map(value => value.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return new Set([...DEFAULT_SOCIO_ORIGINS, ...configured]);
}

function normalizeReturnTo(returnTo) {
  const fallback = `${DEFAULT_SOCIO_ORIGINS[0]}/tiktok`;
  let url;
  try {
    url = new URL(returnTo || fallback);
  } catch {
    throw new Error('TikTok return URL is invalid.');
  }
  if (url.protocol !== 'https:' || !allowedSocioOrigins().has(url.origin)) {
    throw new Error('TikTok return URL is not allowed.');
  }
  return url.toString();
}

export function createTikTokState(returnTo) {
  const payload = Buffer.from(
    JSON.stringify({
      returnTo: normalizeReturnTo(returnTo),
      nonce: crypto.randomUUID(),
      exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
    }),
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', stateSecret())
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

export function readTikTokState(state) {
  const [payload, signature] = String(state || '').split('.');
  if (!payload || !signature) throw new Error('TikTok authorization state is missing.');
  const expected = crypto
    .createHmac('sha256', stateSecret())
    .update(payload)
    .digest('base64url');
  if (!safeEqual(signature, expected)) {
    throw new Error('TikTok authorization state is invalid.');
  }
  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!parsed?.returnTo || !parsed?.exp || parsed.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('TikTok authorization state expired.');
  }
  return { returnTo: normalizeReturnTo(parsed.returnTo) };
}

export function getTikTokConfiguration() {
  const config = getConfig();
  return {
    configured: Boolean(config.clientKey && config.clientSecret && config.redirectUri),
    redirectUri: config.redirectUri,
    unaudited: config.unaudited,
    privacyLevel: config.unaudited ? 'SELF_ONLY' : config.privacyLevel,
    musicAlwaysOn: true,
  };
}

function requireConfigured() {
  const config = getConfig();
  if (!config.clientKey || !config.clientSecret) {
    throw new Error('TikTok client credentials are not configured in SMMPRO.');
  }
  return config;
}

export function buildTikTokAuthorizationUrl(returnTo) {
  const config = requireConfigured();
  const url = new URL(TIKTOK_AUTHORIZE_URL);
  url.searchParams.set('client_key', config.clientKey);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'user.info.basic,video.publish');
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('state', createTikTokState(returnTo));
  return url.toString();
}

async function readApiResponse(response) {
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text || response.statusText };
  }
  if (!response.ok) {
    const message =
      body?.error_description ||
      body?.error?.message ||
      body?.message ||
      `TikTok returned HTTP ${response.status}.`;
    const error = new Error(message);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  if (body?.error && body.error.code && body.error.code !== 'ok') {
    const error = new Error(body.error.message || body.error.code);
    error.body = body;
    throw error;
  }
  return body;
}

async function tokenRequest(values) {
  const config = requireConfigured();
  const body = new URLSearchParams({
    client_key: config.clientKey,
    client_secret: config.clientSecret,
    ...values,
  });
  const response = await fetch(`${TIKTOK_API_BASE}/v2/oauth/token/`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });
  return readApiResponse(response);
}

export async function exchangeTikTokCode(code) {
  const config = requireConfigured();
  if (!code) throw new Error('TikTok did not return an authorization code.');
  return tokenRequest({
    code,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri,
  });
}

async function queryCreatorInfo(accessToken) {
  const response = await fetch(
    `${TIKTOK_API_BASE}/v2/post/publish/creator_info/query/`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json; charset=UTF-8',
      },
      body: '{}',
      cache: 'no-store',
    },
  );
  const body = await readApiResponse(response);
  return body.data || {};
}

function asDateFromSeconds(seconds, fallbackSeconds) {
  const value = Number(seconds);
  return new Date(Date.now() + (Number.isFinite(value) ? value : fallbackSeconds) * 1000);
}

export async function saveTikTokConnection(tokenResponse) {
  await ensureTikTokSchema();
  const accessToken = tokenResponse?.access_token;
  const refreshToken = tokenResponse?.refresh_token;
  const openId = tokenResponse?.open_id;
  if (!accessToken || !refreshToken || !openId) {
    throw new Error('TikTok returned incomplete connection credentials.');
  }
  const creator = await queryCreatorInfo(accessToken);
  const accessExpiresAt = asDateFromSeconds(tokenResponse.expires_in, 24 * 60 * 60);
  const refreshExpiresAt = asDateFromSeconds(
    tokenResponse.refresh_expires_in,
    365 * 24 * 60 * 60,
  );
  const privacyOptions = Array.isArray(creator.privacy_level_options)
    ? creator.privacy_level_options
    : [];
  await getSql()`INSERT INTO smmpro_tiktok_connections (
      account_id, open_id, encrypted_access_token, encrypted_refresh_token,
      access_token_expires_at, refresh_token_expires_at, scope,
      creator_username, creator_nickname, creator_avatar_url,
      privacy_level_options, comment_disabled, updated_at
    ) VALUES (
      ${CONNECTION_ID}, ${openId}, ${encryptToken(accessToken)}, ${encryptToken(refreshToken)},
      ${accessExpiresAt.toISOString()}, ${refreshExpiresAt.toISOString()}, ${tokenResponse.scope || ''},
      ${creator.creator_username || null}, ${creator.creator_nickname || null},
      ${creator.creator_avatar_url || null}, ${JSON.stringify(privacyOptions)}::jsonb,
      ${Boolean(creator.comment_disabled)}, now()
    ) ON CONFLICT (account_id) DO UPDATE SET
      open_id = EXCLUDED.open_id,
      encrypted_access_token = EXCLUDED.encrypted_access_token,
      encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
      access_token_expires_at = EXCLUDED.access_token_expires_at,
      refresh_token_expires_at = EXCLUDED.refresh_token_expires_at,
      scope = EXCLUDED.scope,
      creator_username = EXCLUDED.creator_username,
      creator_nickname = EXCLUDED.creator_nickname,
      creator_avatar_url = EXCLUDED.creator_avatar_url,
      privacy_level_options = EXCLUDED.privacy_level_options,
      comment_disabled = EXCLUDED.comment_disabled,
      updated_at = now()`;
  return getTikTokConnectionStatus({ refresh: false });
}

async function readConnection() {
  await ensureTikTokSchema();
  const rows = await getSql()`SELECT * FROM smmpro_tiktok_connections
    WHERE account_id = ${CONNECTION_ID} LIMIT 1`;
  return rows[0] || null;
}

async function refreshConnection(row) {
  const now = Date.now();
  const expiresAt = new Date(String(row.access_token_expires_at)).getTime();
  if (expiresAt > now + TOKEN_REFRESH_MARGIN_MS) {
    return { row, accessToken: decryptToken(row.encrypted_access_token) };
  }
  if (new Date(String(row.refresh_token_expires_at)).getTime() <= now) {
    throw new Error('TikTok refresh token expired. Reconnect the ChezaHub account.');
  }
  const currentRefreshToken = decryptToken(row.encrypted_refresh_token);
  const refreshed = await tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: currentRefreshToken,
  });
  const nextAccessToken = refreshed.access_token;
  const nextRefreshToken = refreshed.refresh_token || currentRefreshToken;
  if (!nextAccessToken) throw new Error('TikTok did not return a refreshed access token.');
  const accessExpiresAt = asDateFromSeconds(refreshed.expires_in, 24 * 60 * 60);
  const refreshExpiresAt = refreshed.refresh_expires_in
    ? asDateFromSeconds(refreshed.refresh_expires_in, 365 * 24 * 60 * 60)
    : new Date(String(row.refresh_token_expires_at));
  const encryptedAccessToken = encryptToken(nextAccessToken);
  const encryptedRefreshToken = encryptToken(nextRefreshToken);
  await getSql()`UPDATE smmpro_tiktok_connections SET
      open_id = ${refreshed.open_id || row.open_id},
      encrypted_access_token = ${encryptedAccessToken},
      encrypted_refresh_token = ${encryptedRefreshToken},
      access_token_expires_at = ${accessExpiresAt.toISOString()},
      refresh_token_expires_at = ${refreshExpiresAt.toISOString()},
      scope = ${refreshed.scope || row.scope || ''},
      updated_at = now()
    WHERE account_id = ${CONNECTION_ID}`;
  return {
    row: {
      ...row,
      open_id: refreshed.open_id || row.open_id,
      encrypted_access_token: encryptedAccessToken,
      encrypted_refresh_token: encryptedRefreshToken,
      access_token_expires_at: accessExpiresAt,
      refresh_token_expires_at: refreshExpiresAt,
      scope: refreshed.scope || row.scope || '',
    },
    accessToken: nextAccessToken,
  };
}

async function getConnectedAccess() {
  const row = await readConnection();
  if (!row) throw new Error('Connect the ChezaHub TikTok account before publishing.');
  return refreshConnection(row);
}

async function updateCreatorSnapshot(accessToken) {
  const creator = await queryCreatorInfo(accessToken);
  const privacyOptions = Array.isArray(creator.privacy_level_options)
    ? creator.privacy_level_options
    : [];
  await getSql()`UPDATE smmpro_tiktok_connections SET
      creator_username = ${creator.creator_username || null},
      creator_nickname = ${creator.creator_nickname || null},
      creator_avatar_url = ${creator.creator_avatar_url || null},
      privacy_level_options = ${JSON.stringify(privacyOptions)}::jsonb,
      comment_disabled = ${Boolean(creator.comment_disabled)},
      updated_at = now()
    WHERE account_id = ${CONNECTION_ID}`;
  return creator;
}

function connectionPayload(row, creator = null) {
  const options = creator?.privacy_level_options || row?.privacy_level_options || [];
  return {
    configured: getTikTokConfiguration().configured,
    connected: Boolean(row),
    accountId: CONNECTION_ID,
    openId: row?.open_id || null,
    username: creator?.creator_username || row?.creator_username || null,
    nickname: creator?.creator_nickname || row?.creator_nickname || null,
    avatarUrl: creator?.creator_avatar_url || row?.creator_avatar_url || null,
    privacyLevelOptions: Array.isArray(options) ? options : [],
    accessTokenExpiresAt: row?.access_token_expires_at
      ? new Date(String(row.access_token_expires_at)).toISOString()
      : null,
    refreshTokenExpiresAt: row?.refresh_token_expires_at
      ? new Date(String(row.refresh_token_expires_at)).toISOString()
      : null,
    scope: row?.scope || '',
    musicAlwaysOn: true,
    autoAddMusic: true,
    promotionalDisclosure: 'your-brand',
    unaudited: getTikTokConfiguration().unaudited,
    privacyLevel: getTikTokConfiguration().privacyLevel,
  };
}

export async function getTikTokConnectionStatus({ refresh = true } = {}) {
  const configuration = getTikTokConfiguration();
  if (!configuration.configured) {
    return {
      ...configuration,
      connected: false,
      accountId: CONNECTION_ID,
      username: null,
      nickname: null,
      avatarUrl: null,
      privacyLevelOptions: [],
    };
  }
  const row = await readConnection();
  if (!row) return connectionPayload(null);
  if (!refresh) return connectionPayload(row);
  try {
    const access = await refreshConnection(row);
    const creator = await updateCreatorSnapshot(access.accessToken);
    return connectionPayload(access.row, creator);
  } catch (error) {
    return {
      ...connectionPayload(row),
      connected: false,
      error: error instanceof Error ? error.message : 'TikTok connection check failed.',
    };
  }
}

export async function disconnectTikTok() {
  const row = await readConnection();
  if (!row) return;
  const config = getConfig();
  try {
    const body = new URLSearchParams({
      client_key: config.clientKey,
      client_secret: config.clientSecret,
      token: decryptToken(row.encrypted_access_token),
    });
    await fetch(`${TIKTOK_API_BASE}/v2/oauth/revoke/`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
    });
  } catch {
    // Removing the local token is still the safe disconnect action.
  }
  await getSql()`DELETE FROM smmpro_tiktok_connections WHERE account_id = ${CONNECTION_ID}`;
}

function validateSourceImageUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    !url.hostname.endsWith('.public.blob.vercel-storage.com')
  ) {
    throw new Error('TikTok media must come from the Socio Vercel Blob store.');
  }
  return url.toString();
}

export function createTikTokMediaUrl(sourceUrl) {
  const config = requireConfigured();
  const source = validateSourceImageUrl(sourceUrl);
  const exp = Math.floor(Date.now() / 1000) + MEDIA_URL_TTL_SECONDS;
  const signature = signValue(`${source}\n${exp}`, 'tiktok-media');
  const url = new URL('/api/integrations/tiktok/media', config.publicUrl);
  url.searchParams.set('src', source);
  url.searchParams.set('exp', String(exp));
  url.searchParams.set('sig', signature);
  return url.toString();
}

export function verifyTikTokMediaRequest(sourceUrl, expValue, signature) {
  const source = validateSourceImageUrl(sourceUrl);
  const exp = Number(expValue);
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('TikTok media URL expired.');
  }
  const expected = signValue(`${source}\n${exp}`, 'tiktok-media');
  if (!safeEqual(signature, expected)) throw new Error('TikTok media signature is invalid.');
  return source;
}

function selectPrivacyLevel(creator) {
  const config = getConfig();
  const requested = config.unaudited ? 'SELF_ONLY' : config.privacyLevel;
  const options = Array.isArray(creator.privacy_level_options)
    ? creator.privacy_level_options
    : [];
  if (options.includes(requested)) return requested;
  if (options.includes('SELF_ONLY')) return 'SELF_ONLY';
  throw new Error('TikTok did not return an allowed privacy option for this creator.');
}

export async function initTikTokPhotoPost({
  accountId,
  title,
  caption,
  imageUrls,
}) {
  if (accountId !== CONNECTION_ID) {
    throw new Error('TikTok publishing is currently enabled for ChezaHub only.');
  }
  if (!Array.isArray(imageUrls) || imageUrls.length < 1 || imageUrls.length > 35) {
    throw new Error('TikTok photo posts require between 1 and 35 images.');
  }
  const access = await getConnectedAccess();
  const creator = await updateCreatorSnapshot(access.accessToken);
  const privacyLevel = selectPrivacyLevel(creator);
  const proxyUrls = imageUrls.map(createTikTokMediaUrl);
  const payload = {
    media_type: 'PHOTO',
    post_mode: 'DIRECT_POST',
    post_info: {
      title: String(title || '').trim().slice(0, 90),
      description: String(caption || '').trim().slice(0, 4000),
      privacy_level: privacyLevel,
      disable_comment: Boolean(creator.comment_disabled),
      auto_add_music: true,
      brand_content_toggle: false,
      brand_organic_toggle: true,
    },
    source_info: {
      source: 'PULL_FROM_URL',
      photo_cover_index: 0,
      photo_images: proxyUrls,
    },
  };
  const response = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/content/init/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access.accessToken}`,
      'content-type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const body = await readApiResponse(response);
  const publishId = body?.data?.publish_id;
  if (!publishId) throw new Error('TikTok did not return a publish ID.');
  return {
    publishId,
    privacyLevel,
    musicAlwaysOn: true,
    autoAddMusic: true,
    response: body,
  };
}

export async function fetchTikTokPublishStatus(publishId) {
  if (!publishId || String(publishId).length > 200) {
    throw new Error('TikTok publish ID is invalid.');
  }
  const access = await getConnectedAccess();
  const response = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/status/fetch/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access.accessToken}`,
      'content-type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ publish_id: publishId }),
    cache: 'no-store',
  });
  const body = await readApiResponse(response);
  const data = body.data || {};
  const postIds =
    data.publicaly_available_post_id ||
    data.publicly_available_post_id ||
    data.public_post_id ||
    [];
  return {
    publishId,
    status: data.status || 'UNKNOWN',
    failReason: data.fail_reason || null,
    postIds: Array.isArray(postIds) ? postIds.map(String) : [],
    uploadedBytes: Number(data.uploaded_bytes || 0),
    downloadedBytes: Number(data.downloaded_bytes || 0),
    response: body,
  };
}

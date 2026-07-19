import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { getSocialAccount } from '@/lib/socialAccounts';

const META_AUTHORIZE_BASE = 'https://www.facebook.com';
const META_GRAPH_BASE = 'https://graph.facebook.com';
const STATE_TTL_SECONDS = 10 * 60;
const DEFAULT_REDIRECT_URI =
  'https://smmpro.lokimax.top/api/integrations/meta/callback';
const DEFAULT_SOCIO_ORIGINS = [
  'https://socio.jengasites.com',
  'https://socio-beryl.vercel.app',
];
const META_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_content_publish',
  'business_management',
];

let sql;
let schemaPromise;

function readEnv(name) {
  return process.env[name]?.trim() || '';
}

function getConfig() {
  return {
    appId: readEnv('META_APP_ID') || readEnv('FB_APP_ID'),
    appSecret: readEnv('META_APP_SECRET') || readEnv('FB_APP_SECRET'),
    redirectUri: readEnv('META_REDIRECT_URI') || DEFAULT_REDIRECT_URI,
    graphVersion: readEnv('META_GRAPH_VERSION') || 'v20.0',
  };
}

function requireConfig() {
  const config = getConfig();
  if (!config.appId || !config.appSecret) {
    throw new Error('META_APP_ID and META_APP_SECRET are not configured.');
  }
  return config;
}

function getSql() {
  const databaseUrl = readEnv('DATABASE_URL');
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for Meta connections.');
  }
  sql ||= neon(databaseUrl);
  return sql;
}

export function ensureMetaSchema() {
  schemaPromise ||= getSql().transaction([
    getSql()`CREATE TABLE IF NOT EXISTS smmpro_meta_connections (
      account_id text PRIMARY KEY,
      page_id text NOT NULL,
      page_name text,
      ig_user_id text NOT NULL,
      ig_username text,
      encrypted_user_token text NOT NULL,
      encrypted_page_token text NOT NULL,
      scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
      connected_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    getSql()`CREATE INDEX IF NOT EXISTS smmpro_meta_connections_updated_idx
      ON smmpro_meta_connections (updated_at)`,
  ]);
  return schemaPromise;
}

function getSecretSeed() {
  const { appSecret } = requireConfig();
  const adminEmail = readEnv('ADMIN_EMAIL');
  const adminPassword = readEnv('ADMIN_PASSWORD');
  if (!adminEmail || !adminPassword) {
    throw new Error(
      'ADMIN_EMAIL and ADMIN_PASSWORD are required for Meta token protection.',
    );
  }
  return `smmpro-meta-v1:${adminEmail}:${adminPassword}:${appSecret}`;
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
    throw new Error('Stored Meta credentials are invalid. Reconnect Facebook.');
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

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function allowedReturnOrigins() {
  const configured = readEnv('SOCIO_RETURN_ORIGINS')
    .split(',')
    .map(value => value.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return new Set([...DEFAULT_SOCIO_ORIGINS, ...configured]);
}

function normalizeReturnTo(returnTo) {
  const fallback = `${DEFAULT_SOCIO_ORIGINS[0]}/connections`;
  let url;
  try {
    url = new URL(returnTo || fallback);
  } catch {
    throw new Error('Meta return URL is invalid.');
  }
  if (url.protocol !== 'https:' || !allowedReturnOrigins().has(url.origin)) {
    throw new Error('Meta return URL is not allowed.');
  }
  return url.toString();
}

function createState(accountId, returnTo) {
  const account = getSocialAccount(accountId);
  const payload = Buffer.from(
    JSON.stringify({
      accountId: account.id,
      returnTo: normalizeReturnTo(returnTo),
      nonce: crypto.randomUUID(),
      exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
    }),
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getEncryptionKey())
    .update(`meta-oauth\n${payload}`)
    .digest('base64url');
  return `${payload}.${signature}`;
}

function readState(state) {
  const [payload, signature] = String(state || '').split('.');
  if (!payload || !signature) throw new Error('Meta authorization state is missing.');
  const expected = crypto
    .createHmac('sha256', getEncryptionKey())
    .update(`meta-oauth\n${payload}`)
    .digest('base64url');
  if (!safeEqual(signature, expected)) {
    throw new Error('Meta authorization state is invalid.');
  }
  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (
    !parsed?.accountId ||
    !parsed?.returnTo ||
    !parsed?.exp ||
    parsed.exp <= Math.floor(Date.now() / 1000)
  ) {
    throw new Error('Meta authorization state expired.');
  }
  return parsed;
}

function graphUrl(path) {
  const { graphVersion } = getConfig();
  return `${META_GRAPH_BASE}/${graphVersion}/${path.replace(/^\//, '')}`;
}

async function graphGet(path, params) {
  const url = new URL(graphUrl(path));
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  const response = await fetch(url, { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const message = data.error?.message || response.statusText || 'Meta request failed.';
    const error = new Error(message);
    error.code = data.error?.code;
    error.status = response.status;
    throw error;
  }
  return data;
}

export function getMetaConfiguration() {
  const config = getConfig();
  return {
    configured: Boolean(config.appId && config.appSecret),
    redirectUri: config.redirectUri,
    graphVersion: config.graphVersion,
  };
}

export function buildMetaAuthorizationUrl(accountId, returnTo) {
  const config = requireConfig();
  const url = new URL(
    `${META_AUTHORIZE_BASE}/${config.graphVersion}/dialog/oauth`,
  );
  url.searchParams.set('client_id', config.appId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', createState(accountId, returnTo));
  url.searchParams.set('scope', META_SCOPES.join(','));
  url.searchParams.set('auth_type', 'rerequest');
  return url.toString();
}

async function exchangeAuthorizationCode(code) {
  const config = requireConfig();
  const shortLived = await graphGet('/oauth/access_token', {
    client_id: config.appId,
    client_secret: config.appSecret,
    redirect_uri: config.redirectUri,
    code,
  });
  if (!shortLived.access_token) {
    throw new Error('Meta did not return an access token.');
  }

  const longLived = await graphGet('/oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: config.appId,
    client_secret: config.appSecret,
    fb_exchange_token: shortLived.access_token,
  });
  return longLived.access_token || shortLived.access_token;
}

async function listManagedPages(userToken) {
  const pages = [];
  let next = new URL(graphUrl('/me/accounts'));
  next.searchParams.set(
    'fields',
    'id,name,access_token,instagram_business_account{id,username},connected_instagram_account{id,username}',
  );
  next.searchParams.set('limit', '100');
  next.searchParams.set('access_token', userToken);

  for (let page = 0; page < 5 && next; page += 1) {
    const response = await fetch(next, { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.error) {
      throw new Error(body.error?.message || 'Could not load Facebook Pages.');
    }
    pages.push(...(Array.isArray(body.data) ? body.data : []));
    next = body.paging?.next ? new URL(body.paging.next) : null;
  }
  return pages;
}

function configuredPageId(account) {
  return (
    readEnv(account.env?.pageId) ||
    readEnv(account.legacyEnv?.pageId) ||
    ''
  );
}

function choosePage(account, pages) {
  const expectedPageId = configuredPageId(account);
  if (expectedPageId) {
    const exact = pages.find(page => String(page.id) === String(expectedPageId));
    if (exact) return exact;
  }
  if (pages.length === 1) return pages[0];
  const byName = pages.find(page =>
    String(page.name || '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .includes(account.id.toLowerCase()),
  );
  if (byName) return byName;
  throw new Error(
    `Could not identify the ${account.name} Facebook Page. Confirm its Page ID in SMMPRO.`,
  );
}

function instagramAccount(page) {
  return page.instagram_business_account || page.connected_instagram_account || null;
}

async function saveConnection({ account, page, instagram, userToken }) {
  await ensureMetaSchema();
  await getSql()`INSERT INTO smmpro_meta_connections (
      account_id, page_id, page_name, ig_user_id, ig_username,
      encrypted_user_token, encrypted_page_token, scopes,
      connected_at, updated_at
    ) VALUES (
      ${account.id}, ${String(page.id)}, ${page.name || null},
      ${String(instagram.id)}, ${instagram.username || null},
      ${encryptToken(userToken)}, ${encryptToken(page.access_token)},
      ${JSON.stringify(META_SCOPES)}::jsonb, now(), now()
    )
    ON CONFLICT (account_id) DO UPDATE SET
      page_id = EXCLUDED.page_id,
      page_name = EXCLUDED.page_name,
      ig_user_id = EXCLUDED.ig_user_id,
      ig_username = EXCLUDED.ig_username,
      encrypted_user_token = EXCLUDED.encrypted_user_token,
      encrypted_page_token = EXCLUDED.encrypted_page_token,
      scopes = EXCLUDED.scopes,
      connected_at = now(),
      updated_at = now()`;
}

export async function completeMetaAuthorization({ code, state }) {
  const parsed = readState(state);
  const account = getSocialAccount(parsed.accountId);
  const userToken = await exchangeAuthorizationCode(code);
  const pages = await listManagedPages(userToken);
  const page = choosePage(account, pages);
  if (!page.access_token) {
    throw new Error(`Meta did not return a Page token for ${account.name}.`);
  }
  const instagram = instagramAccount(page);
  if (!instagram?.id) {
    throw new Error(
      `${account.name} does not have a connected Instagram professional account.`,
    );
  }
  await saveConnection({ account, page, instagram, userToken });
  return {
    accountId: account.id,
    pageId: String(page.id),
    pageName: page.name || null,
    igUserId: String(instagram.id),
    igUsername: instagram.username || null,
    returnTo: parsed.returnTo,
  };
}

async function loadStoredConnection(accountId) {
  await ensureMetaSchema();
  const rows = await getSql()`SELECT account_id, page_id, page_name, ig_user_id,
      ig_username, encrypted_user_token, encrypted_page_token, scopes,
      connected_at, updated_at
    FROM smmpro_meta_connections WHERE account_id = ${accountId}`;
  if (!rows[0]) return null;
  return {
    accountId: String(rows[0].account_id),
    pageId: String(rows[0].page_id),
    pageName: rows[0].page_name ? String(rows[0].page_name) : null,
    igUserId: String(rows[0].ig_user_id),
    igUsername: rows[0].ig_username ? String(rows[0].ig_username) : null,
    userToken: decryptToken(rows[0].encrypted_user_token),
    pageToken: decryptToken(rows[0].encrypted_page_token),
    scopes: Array.isArray(rows[0].scopes) ? rows[0].scopes : [],
    connectedAt: new Date(rows[0].connected_at).toISOString(),
    updatedAt: new Date(rows[0].updated_at).toISOString(),
  };
}

async function validateToken(path, token) {
  try {
    await graphGet(path, { fields: 'id', access_token: token });
    return true;
  } catch {
    return false;
  }
}

async function refreshStoredPageToken(connection) {
  const userValid = await validateToken('/me', connection.userToken);
  if (!userValid) {
    throw new Error(
      'Facebook authorization has expired. Reconnect JengaSites in SMMPRO.',
    );
  }
  const pages = await listManagedPages(connection.userToken);
  const page = pages.find(item => String(item.id) === connection.pageId);
  if (!page?.access_token) {
    throw new Error(
      'Facebook did not return a fresh Page token. Reconnect JengaSites in SMMPRO.',
    );
  }
  const instagram = instagramAccount(page) || {
    id: connection.igUserId,
    username: connection.igUsername,
  };
  const account = getSocialAccount(connection.accountId);
  await saveConnection({
    account,
    page,
    instagram,
    userToken: connection.userToken,
  });
  return {
    ...connection,
    pageName: page.name || connection.pageName,
    igUserId: String(instagram.id),
    igUsername: instagram.username || connection.igUsername,
    pageToken: page.access_token,
    updatedAt: new Date().toISOString(),
  };
}

export async function getStoredMetaConnection(accountId, { validate = true } = {}) {
  const connection = await loadStoredConnection(accountId);
  if (!connection || !validate) return connection;
  const pageValid = await validateToken(`/${connection.pageId}`, connection.pageToken);
  return pageValid ? connection : refreshStoredPageToken(connection);
}

function envCredentials(account) {
  const pageId =
    readEnv(account.env?.pageId) || readEnv(account.legacyEnv?.pageId) || undefined;
  const pageToken =
    readEnv(account.env?.pageToken) ||
    readEnv(account.legacyEnv?.pageToken) ||
    undefined;
  const userToken =
    readEnv(account.env?.userToken) ||
    readEnv(account.legacyEnv?.userToken) ||
    undefined;
  const igUserId =
    readEnv(account.env?.igUserId) || readEnv(account.legacyEnv?.igUserId) || undefined;
  return { pageId, pageToken, userToken, igUserId };
}

export async function getResolvedMetaCredentials(accountId) {
  const account = getSocialAccount(accountId);
  const stored = await getStoredMetaConnection(account.id).catch(error => {
    if (String(error?.message || '').includes('Reconnect')) throw error;
    return null;
  });
  if (stored) {
    return {
      account,
      source: 'oauth',
      credentials: {
        pageId: stored.pageId,
        pageToken: stored.pageToken,
        userToken: stored.pageToken,
        metaUserToken: stored.userToken,
        instagramAccessToken: stored.pageToken,
        igUserId: stored.igUserId,
      },
      connection: stored,
    };
  }
  const credentials = envCredentials(account);
  return {
    account,
    source: 'environment',
    credentials: {
      ...credentials,
      metaUserToken: credentials.userToken,
      instagramAccessToken: credentials.pageToken,
      userToken: credentials.pageToken,
    },
    connection: null,
  };
}

export async function getMetaConnectionStatus(accountId) {
  const account = getSocialAccount(accountId);
  const configuration = getMetaConfiguration();
  try {
    const connection = await getStoredMetaConnection(account.id, { validate: false });
    return {
      configured: configuration.configured,
      connected: Boolean(connection),
      accountId: account.id,
      accountName: account.name,
      pageId: connection?.pageId || null,
      pageName: connection?.pageName || null,
      igUserId: connection?.igUserId || null,
      igUsername: connection?.igUsername || null,
      connectedAt: connection?.connectedAt || null,
      updatedAt: connection?.updatedAt || null,
      redirectUri: configuration.redirectUri,
    };
  } catch (error) {
    return {
      configured: configuration.configured,
      connected: false,
      accountId: account.id,
      accountName: account.name,
      error: error instanceof Error ? error.message : 'Could not load Meta connection.',
      redirectUri: configuration.redirectUri,
    };
  }
}

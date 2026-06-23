const fs = require('fs');
const path = require('path');

const DEFAULT_GRAPH_VERSION = 'v20.0';

function usage() {
  console.log(`
Usage:
  node get-long-lived-tokens.js --app-id <META_APP_ID> --app-secret <META_APP_SECRET> [options]

Options:
  --user-token <token>       Short-lived user token. Defaults to FB_USER_ACCESS_TOKEN in .env.local.
  --page-id <id>            Facebook Page ID. Defaults to NEXT_PUBLIC_FB_PAGE_ID in .env.local.
  --env-file <path>         Env file to read and update. Defaults to .env.local.
  --graph-version <version> Meta Graph API version. Defaults to META_GRAPH_VERSION or ${DEFAULT_GRAPH_VERSION}.
  --no-write                Exchange tokens but do not update the env file.
  --skip-page-token         Do not fetch/update FB_PAGE_ACCESS_TOKEN.
  --skip-instagram          Do not discover/update IG_USER_ID.

Env fallbacks:
  META_APP_ID, FB_APP_ID
  META_APP_SECRET, FB_APP_SECRET
  FB_USER_ACCESS_TOKEN
  NEXT_PUBLIC_FB_PAGE_ID
`);
}

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }

    if (arg === '--no-write' || arg === '--skip-page-token' || arg === '--skip-instagram') {
      args[arg.slice(2)] = true;
      continue;
    }

    if (!arg.startsWith('--')) {
      throw new Error(`Unknown argument: ${arg}`);
    }

    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      throw new Error(`Missing value for ${arg}`);
    }

    args[key] = next;
    i += 1;
  }

  return args;
}

function parseEnv(content) {
  const env = {};

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[match[1]] = value;
  }

  return env;
}

function setEnvValue(content, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');

  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }

  const separator = content.endsWith('\n') || content.length === 0 ? '' : '\n';
  return `${content}${separator}${line}\n`;
}

function readEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    return { content: '', env: {} };
  }

  const content = fs.readFileSync(envPath, 'utf8');
  return { content, env: parseEnv(content) };
}

function required(value, label) {
  if (!value || value.trim() === '') {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

function redact(value) {
  if (!value) return '(missing)';
  if (value.length <= 12) return '********';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

async function graphGet(graphVersion, pathName, params) {
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${pathName.replace(/^\//, '')}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.error) {
    const message = data.error?.message || response.statusText || 'Meta Graph request failed';
    const code = data.error?.code ? ` code ${data.error.code}` : '';
    throw new Error(`${message}${code}`);
  }

  return data;
}

async function exchangeUserToken({ graphVersion, appId, appSecret, userToken }) {
  return graphGet(graphVersion, '/oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: userToken,
  });
}

async function getPageToken({ graphVersion, pageId, userToken }) {
  const data = await graphGet(graphVersion, `/${pageId}`, {
    fields: 'access_token',
    access_token: userToken,
  });

  if (!data.access_token) {
    throw new Error('Meta did not return a Page access token. Check Page admin permissions.');
  }

  return data.access_token;
}

async function getInstagramAccount({ graphVersion, pageId, pageToken }) {
  const data = await graphGet(graphVersion, `/${pageId}`, {
    fields: 'instagram_business_account{id,username},connected_instagram_account{id,username}',
    access_token: pageToken,
  });

  return data.instagram_business_account || data.connected_instagram_account || null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const envPath = path.resolve(process.cwd(), args['env-file'] || '.env.local');
  const { content, env } = readEnvFile(envPath);

  const appId = required(args['app-id'] || process.env.META_APP_ID || process.env.FB_APP_ID || env.META_APP_ID || env.FB_APP_ID, 'Meta App ID');
  const appSecret = required(args['app-secret'] || process.env.META_APP_SECRET || process.env.FB_APP_SECRET || env.META_APP_SECRET || env.FB_APP_SECRET, 'Meta App Secret');
  const userToken = required(args['user-token'] || process.env.FB_USER_ACCESS_TOKEN || env.FB_USER_ACCESS_TOKEN, 'Short-lived user token');
  const pageId = args['page-id'] || process.env.NEXT_PUBLIC_FB_PAGE_ID || env.NEXT_PUBLIC_FB_PAGE_ID;
  const graphVersion = args['graph-version'] || process.env.META_GRAPH_VERSION || env.META_GRAPH_VERSION || DEFAULT_GRAPH_VERSION;
  const shouldWrite = !args['no-write'];
  const shouldFetchPageToken = !args['skip-page-token'];
  const shouldFetchInstagram = !args['skip-instagram'];

  console.log(`Using env file: ${envPath}`);
  console.log(`Using Graph API: ${graphVersion}`);
  console.log(`Using App ID: ${appId}`);
  console.log(`Using user token: ${redact(userToken)}`);

  console.log('Exchanging user token for a long-lived token...');
  const exchanged = await exchangeUserToken({ graphVersion, appId, appSecret, userToken });
  const longLivedUserToken = required(exchanged.access_token, 'Long-lived user token');
  console.log(`Long-lived user token received: ${redact(longLivedUserToken)}`);

  let longLivedPageToken = null;
  if (shouldFetchPageToken && pageId) {
    console.log(`Fetching Page token for page ${pageId}...`);
    longLivedPageToken = await getPageToken({ graphVersion, pageId, userToken: longLivedUserToken });
    console.log(`Page token received: ${redact(longLivedPageToken)}`);
  } else if (shouldFetchPageToken) {
    console.log('Skipping Page token fetch because NEXT_PUBLIC_FB_PAGE_ID is not configured.');
  }

  let instagramAccount = null;
  if (shouldFetchInstagram && pageId && longLivedPageToken) {
    console.log('Looking up connected Instagram account...');
    instagramAccount = await getInstagramAccount({ graphVersion, pageId, pageToken: longLivedPageToken });

    if (instagramAccount?.id) {
      const username = instagramAccount.username ? ` (@${instagramAccount.username})` : '';
      console.log(`Instagram account found: ${instagramAccount.id}${username}`);
    } else {
      console.log('No connected Instagram professional account was returned for this Page.');
    }
  }

  if (!shouldWrite) {
    console.log('Done. Env file was not updated because --no-write was set.');
    return;
  }

  let nextContent = content;
  nextContent = setEnvValue(nextContent, 'FB_USER_ACCESS_TOKEN', longLivedUserToken);

  if (longLivedPageToken) {
    nextContent = setEnvValue(nextContent, 'FB_PAGE_ACCESS_TOKEN', longLivedPageToken);
  }

  if (instagramAccount?.id) {
    nextContent = setEnvValue(nextContent, 'IG_USER_ID', instagramAccount.id);
  }

  fs.writeFileSync(envPath, nextContent);
  console.log('Updated env file with refreshed token values.');
}

main().catch((error) => {
  console.error(`Token exchange failed: ${error.message}`);
  process.exit(1);
});

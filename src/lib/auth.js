import crypto from 'node:crypto';

export const AUTH_COOKIE_NAME = 'auth-token';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function getAuthSecret() {
  return process.env.AUTH_SECRET?.trim() || '';
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(value) {
  const secret = getAuthSecret();
  if (!secret) {
    throw new Error('AUTH_SECRET is not configured');
  }

  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS
  };
}

export function createSessionToken(email) {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(JSON.stringify({
    sub: email,
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS
  }));
  const signature = sign(payload);

  return `${payload}.${signature}`;
}

export function verifySessionToken(token) {
  if (!token || !token.includes('.')) {
    return null;
  }

  const [payload, signature] = token.split('.');
  if (!payload || !signature) {
    return null;
  }

  let expectedSignature;
  try {
    expectedSignature = sign(payload);
  } catch {
    return null;
  }

  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const session = JSON.parse(base64UrlDecode(payload));
    const now = Math.floor(Date.now() / 1000);

    if (!session?.sub || !session?.exp || session.exp <= now) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export function getSessionFromRequest(request) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value || '';
  return verifySessionToken(token);
}

export function unauthorizedResponse() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

export function requireAuth(request) {
  return getSessionFromRequest(request) ? null : unauthorizedResponse();
}

export function verifyPassword(inputPassword, expectedPassword) {
  if (!inputPassword || !expectedPassword) {
    return false;
  }

  return safeEqual(inputPassword, expectedPassword);
}

import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';

const STALE_CLAIM_MINUTES = 15;
let sql;

function getSql() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for durable idempotent publishing.');
  }
  sql ||= neon(databaseUrl);
  return sql;
}

function requestHash(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export async function beginIdempotentPublish(key, payload) {
  if (!key) return { mode: 'untracked' };
  if (key.length > 200) throw new Error('Idempotency key must be 200 characters or fewer.');

  const db = getSql();
  const hash = requestHash(payload);
  const inserted = await db`INSERT INTO smmpro_publish_idempotency
      (idempotency_key, request_hash, status, claimed_at, updated_at)
    VALUES (${key}, ${hash}, 'processing', now(), now())
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING idempotency_key`;
  if (inserted[0]) return { mode: 'claimed', key };

  const rows = await db`SELECT request_hash, status, response,
      claimed_at < now() - (${STALE_CLAIM_MINUTES} * interval '1 minute') AS stale
    FROM smmpro_publish_idempotency WHERE idempotency_key = ${key}`;
  const record = rows[0];
  if (!record) return { mode: 'in_progress' };
  if (record.request_hash !== hash) return { mode: 'conflict' };
  if (record.status === 'succeeded') {
    return { mode: 'replay', response: record.response };
  }

  if (record.status === 'failed' || record.stale) {
    const claimed = await db`UPDATE smmpro_publish_idempotency
      SET status = 'processing', response = NULL, claimed_at = now(), updated_at = now()
      WHERE idempotency_key = ${key}
        AND (status = 'failed' OR claimed_at < now() - (${STALE_CLAIM_MINUTES} * interval '1 minute'))
      RETURNING idempotency_key`;
    if (claimed[0]) return { mode: 'claimed', key };
  }

  return { mode: 'in_progress' };
}

export async function completeIdempotentPublish(key, response) {
  if (!key) return;
  await getSql()`UPDATE smmpro_publish_idempotency
    SET status = 'succeeded', response = ${JSON.stringify(response)}::jsonb, updated_at = now()
    WHERE idempotency_key = ${key}`;
}

export async function failIdempotentPublish(key, response) {
  if (!key) return;
  await getSql()`UPDATE smmpro_publish_idempotency
    SET status = 'failed', response = ${JSON.stringify(response)}::jsonb, updated_at = now()
    WHERE idempotency_key = ${key}`;
}

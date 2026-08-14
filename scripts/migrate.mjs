import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required. Run with `node --env-file=.env.local`.');
}

const sql = neon(databaseUrl);
const statements = [
  `CREATE TABLE IF NOT EXISTS smmpro_publish_idempotency (
    idempotency_key text PRIMARY KEY,
    request_hash text NOT NULL,
    status text NOT NULL CHECK (status IN ('processing', 'succeeded', 'failed')),
    response jsonb,
    claimed_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS smmpro_publish_idempotency_status_idx
    ON smmpro_publish_idempotency (status, claimed_at)`,
  `CREATE TABLE IF NOT EXISTS smmpro_scheduled_publishes (
    job_id text PRIMARY KEY,
    source_key text,
    account_id text NOT NULL,
    platform text NOT NULL CHECK (platform IN ('facebook', 'instagram')),
    publish_mode text NOT NULL CHECK (publish_mode IN ('individual', 'story')),
    message text NOT NULL DEFAULT '',
    image_url text,
    scheduled_for timestamptz NOT NULL,
    occurrence_index integer NOT NULL DEFAULT 0 CHECK (occurrence_index >= 0),
    recurrence_frequency text NOT NULL DEFAULT 'none'
      CHECK (recurrence_frequency IN ('none', 'daily', 'weekly')),
    recurrence_count integer NOT NULL DEFAULT 1 CHECK (recurrence_count BETWEEN 1 AND 60),
    status text NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'processing', 'retry', 'succeeded', 'failed')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts >= 1),
    locked_at timestamptz,
    published_at timestamptz,
    provider_result jsonb,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS smmpro_scheduled_publishes_due_idx
    ON smmpro_scheduled_publishes (status, scheduled_for)`,
  `CREATE INDEX IF NOT EXISTS smmpro_scheduled_publishes_source_idx
    ON smmpro_scheduled_publishes (source_key, occurrence_index, platform)`,
  `CREATE TABLE IF NOT EXISTS smmpro_tiktok_connections (
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
  `CREATE INDEX IF NOT EXISTS smmpro_tiktok_connections_expiry_idx
    ON smmpro_tiktok_connections (access_token_expires_at, refresh_token_expires_at)`
];

for (const statement of statements) {
  await sql.query(statement);
}

console.log(`Applied ${statements.length} SMMPRO database statements.`);

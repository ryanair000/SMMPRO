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
    ON smmpro_publish_idempotency (status, claimed_at)`
];

for (const statement of statements) {
  await sql.query(statement);
}

console.log(`Applied ${statements.length} SMMPRO database statements.`);

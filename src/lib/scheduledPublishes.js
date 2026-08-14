import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { buildOccurrenceTimes, normalizeRecurrence } from '@/lib/scheduleRecurrence';

const DEFAULT_MAX_ATTEMPTS = 5;
let sql;
let schemaReady;

function getSql() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for scheduled publishing.');
  }
  sql ||= neon(databaseUrl);
  return sql;
}

async function ensureScheduledPublishSchema(db) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.query(`CREATE TABLE IF NOT EXISTS smmpro_scheduled_publishes (
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
      )`);
      await db.query(`CREATE INDEX IF NOT EXISTS smmpro_scheduled_publishes_due_idx
        ON smmpro_scheduled_publishes (status, scheduled_for)`);
      await db.query(`CREATE INDEX IF NOT EXISTS smmpro_scheduled_publishes_source_idx
        ON smmpro_scheduled_publishes (source_key, occurrence_index, platform)`);
    })().catch(error => {
      schemaReady = undefined;
      throw error;
    });
  }
  return schemaReady;
}

function deterministicJobId(sourceKey, occurrenceIndex, platform) {
  if (!sourceKey) return crypto.randomUUID();
  return crypto
    .createHash('sha256')
    .update(`${sourceKey}\n${occurrenceIndex}\n${platform}`)
    .digest('hex');
}

export async function enqueueScheduledPublishes({
  sourceKey,
  accountId,
  message,
  imageUrl,
  publishMode,
  platforms,
  firstScheduledUnix,
  recurrenceFrequency,
  recurrenceCount
}) {
  const db = getSql();
  await ensureScheduledPublishSchema(db);
  const recurrence = normalizeRecurrence(recurrenceFrequency, recurrenceCount);
  const occurrenceTimes = buildOccurrenceTimes(
    firstScheduledUnix,
    recurrence.frequency,
    recurrence.count
  );
  const jobs = occurrenceTimes.flatMap((scheduledUnix, occurrenceIndex) =>
    platforms.map(platform => ({
      jobId: deterministicJobId(sourceKey, occurrenceIndex, platform),
      platform,
      scheduledUnix,
      occurrenceIndex
    }))
  );

  await db.transaction(jobs.map(job => db`INSERT INTO smmpro_scheduled_publishes (
      job_id, source_key, account_id, platform, publish_mode, message, image_url,
      scheduled_for, occurrence_index, recurrence_frequency, recurrence_count,
      status, max_attempts, created_at, updated_at
    ) VALUES (
      ${job.jobId}, ${sourceKey || null}, ${accountId}, ${job.platform}, ${publishMode},
      ${message || ''}, ${imageUrl || null}, to_timestamp(${job.scheduledUnix}),
      ${job.occurrenceIndex}, ${recurrence.frequency}, ${recurrence.count},
      'pending', ${DEFAULT_MAX_ATTEMPTS}, now(), now()
    ) ON CONFLICT (job_id) DO NOTHING`));

  return {
    jobs,
    occurrenceCount: occurrenceTimes.length,
    firstScheduledFor: new Date(occurrenceTimes[0] * 1000).toISOString(),
    lastScheduledFor: new Date(occurrenceTimes.at(-1) * 1000).toISOString()
  };
}

export async function claimDueScheduledPublishes(limit = 10) {
  const safeLimit = Math.min(25, Math.max(1, Number.parseInt(limit, 10) || 10));
  const db = getSql();
  await ensureScheduledPublishSchema(db);
  return db`WITH due AS (
      SELECT job_id
      FROM smmpro_scheduled_publishes
      WHERE (
          status IN ('pending', 'retry') AND scheduled_for <= now()
        ) OR (
          status = 'processing' AND locked_at < now() - interval '15 minutes'
        )
      ORDER BY scheduled_for, created_at
      LIMIT ${safeLimit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE smmpro_scheduled_publishes AS jobs
    SET status = 'processing', attempts = attempts + 1, locked_at = now(), updated_at = now()
    FROM due
    WHERE jobs.job_id = due.job_id
    RETURNING jobs.*`;
}

export async function completeScheduledPublish(jobId, providerResult) {
  await getSql()`UPDATE smmpro_scheduled_publishes
    SET status = 'succeeded', provider_result = ${JSON.stringify(providerResult)}::jsonb,
      last_error = NULL, locked_at = NULL, published_at = now(), updated_at = now()
    WHERE job_id = ${jobId}`;
}

export async function failScheduledPublish(jobId, error) {
  const message = error instanceof Error ? error.message : String(error || 'Publishing failed.');
  await getSql()`UPDATE smmpro_scheduled_publishes
    SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'retry' END,
      last_error = ${message.slice(0, 2000)}, locked_at = NULL,
      scheduled_for = CASE
        WHEN attempts >= max_attempts THEN scheduled_for
        ELSE now() + (attempts * interval '5 minutes')
      END,
      updated_at = now()
    WHERE job_id = ${jobId}`;
}

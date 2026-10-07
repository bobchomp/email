import { Pool } from "pg";

// Reuse a single pool across invocations (important in serverless: avoids
// exhausting the DB's connection limit on every cold start / hot reload).
const globalForPg = globalThis as unknown as { pgPool?: Pool };

// Vercel's Storage tab prefixes every var it injects with the storage
// resource's name (e.g. `storage_DATABASE_URL`, `storage_POSTGRES_URL`)
// instead of a plain `DATABASE_URL`. Fall back to finding one of those.
function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const keys = Object.keys(process.env);
  const pooledSuffixes = [/_DATABASE_URL$/, /_POSTGRES_URL$/];
  for (const pattern of pooledSuffixes) {
    const key = keys.find((k) => pattern.test(k) && !/NON_POOLING|NO_SSL|PRISMA|UNPOOLED/.test(k));
    if (key) return process.env[key]!;
  }

  throw new Error(
    "DATABASE_URL environment variable is not set, and no *_DATABASE_URL / " +
      "*_POSTGRES_URL fallback was found either. Add a Postgres database " +
      "(Vercel Storage tab) or set DATABASE_URL directly."
  );
}

function getPool(): Pool {
  if (!globalForPg.pgPool) {
    const url = resolveDatabaseUrl();
    globalForPg.pgPool = new Pool({
      connectionString: url,
      ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
      max: 3,
    });
  }
  return globalForPg.pgPool;
}

// Tagged-template helper matching the call sites below, backed by `pg`.
function sql() {
  const pool = getPool();
  return async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0];
    const params: unknown[] = [];
    values.forEach((v, i) => {
      params.push(v);
      text += `$${i + 1}${strings[i + 1]}`;
    });
    const result = await pool.query(text, params);
    return result.rows;
  };
}

let schemaReady: Promise<void> | null = null;

// Idempotent, cheap (IF NOT EXISTS) — safe to call on every cold start.
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    const db = sql();
    schemaReady = (async () => {
      await db`
        CREATE TABLE IF NOT EXISTS google_account (
          id INT PRIMARY KEY DEFAULT 1,
          email TEXT,
          encrypted_refresh_token TEXT NOT NULL,
          connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT single_row CHECK (id = 1)
        )
      `;
      await db`
        CREATE TABLE IF NOT EXISTS pin_attempts (
          id INT PRIMARY KEY DEFAULT 1,
          failed_count INT NOT NULL DEFAULT 0,
          locked_until TIMESTAMPTZ,
          last_lockout_seconds INT NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT single_row CHECK (id = 1)
        )
      `;
      await db`
        CREATE TABLE IF NOT EXISTS pinned_labels (
          label_id TEXT PRIMARY KEY,
          pinned_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      // Files attached in the composer, held only until the message is sent
      // (or for a day if it never is). Stored in chunks because a single
      // request to a Vercel function is capped at 4.5MB.
      await db`
        CREATE TABLE IF NOT EXISTS uploads (
          id UUID PRIMARY KEY,
          filename TEXT NOT NULL,
          content_type TEXT NOT NULL,
          size INT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await db`
        CREATE TABLE IF NOT EXISTS upload_chunks (
          upload_id UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
          idx INT NOT NULL,
          data BYTEA NOT NULL,
          PRIMARY KEY (upload_id, idx)
        )
      `;
    })();
  }
  return schemaReady;
}

export async function getGoogleAccount(): Promise<{
  email: string | null;
  encryptedRefreshToken: string;
} | null> {
  await ensureSchema();
  const db = sql();
  const rows = await db`
    SELECT email, encrypted_refresh_token FROM google_account WHERE id = 1
  `;
  if (rows.length === 0) return null;
  const row = rows[0] as { email: string | null; encrypted_refresh_token: string };
  return { email: row.email, encryptedRefreshToken: row.encrypted_refresh_token };
}

export async function saveGoogleAccount(
  email: string | null,
  encryptedRefreshToken: string
): Promise<void> {
  await ensureSchema();
  const db = sql();
  await db`
    INSERT INTO google_account (id, email, encrypted_refresh_token, connected_at)
    VALUES (1, ${email}, ${encryptedRefreshToken}, now())
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
      connected_at = now()
  `;
}

export async function clearGoogleAccount(): Promise<void> {
  await ensureSchema();
  const db = sql();
  await db`DELETE FROM google_account WHERE id = 1`;
}

export type PinAttemptState = {
  failedCount: number;
  lockedUntil: Date | null;
  lastLockoutSeconds: number;
};

export async function getPinAttemptState(): Promise<PinAttemptState> {
  await ensureSchema();
  const db = sql();
  const rows = await db`
    SELECT failed_count, locked_until, last_lockout_seconds
    FROM pin_attempts WHERE id = 1
  `;
  if (rows.length === 0) {
    return { failedCount: 0, lockedUntil: null, lastLockoutSeconds: 0 };
  }
  const row = rows[0] as {
    failed_count: number;
    locked_until: string | null;
    last_lockout_seconds: number;
  };
  return {
    failedCount: row.failed_count,
    lockedUntil: row.locked_until ? new Date(row.locked_until) : null,
    lastLockoutSeconds: row.last_lockout_seconds,
  };
}

export async function savePinAttemptState(state: PinAttemptState): Promise<void> {
  await ensureSchema();
  const db = sql();
  await db`
    INSERT INTO pin_attempts (id, failed_count, locked_until, last_lockout_seconds, updated_at)
    VALUES (1, ${state.failedCount}, ${state.lockedUntil ? state.lockedUntil.toISOString() : null}, ${state.lastLockoutSeconds}, now())
    ON CONFLICT (id) DO UPDATE SET
      failed_count = EXCLUDED.failed_count,
      locked_until = EXCLUDED.locked_until,
      last_lockout_seconds = EXCLUDED.last_lockout_seconds,
      updated_at = now()
  `;
}

export async function getPinnedLabelIds(): Promise<string[]> {
  await ensureSchema();
  const db = sql();
  const rows = await db`SELECT label_id FROM pinned_labels ORDER BY pinned_at ASC`;
  return (rows as { label_id: string }[]).map((r) => r.label_id);
}

export async function pinLabel(labelId: string): Promise<void> {
  await ensureSchema();
  const db = sql();
  await db`
    INSERT INTO pinned_labels (label_id) VALUES (${labelId})
    ON CONFLICT (label_id) DO NOTHING
  `;
}

export async function unpinLabel(labelId: string): Promise<void> {
  await ensureSchema();
  const db = sql();
  await db`DELETE FROM pinned_labels WHERE label_id = ${labelId}`;
}

export type UploadMeta = { id: string; filename: string; contentType: string; size: number };

export async function createUpload(meta: UploadMeta): Promise<void> {
  await ensureSchema();
  const db = sql();
  await db`DELETE FROM uploads WHERE created_at < now() - interval '1 day'`;
  await db`
    INSERT INTO uploads (id, filename, content_type, size)
    VALUES (${meta.id}, ${meta.filename}, ${meta.contentType}, ${meta.size})
  `;
}

export async function getUploadMeta(id: string): Promise<UploadMeta | null> {
  await ensureSchema();
  const db = sql();
  const rows = (await db`
    SELECT id, filename, content_type, size FROM uploads WHERE id = ${id}
  `) as { id: string; filename: string; content_type: string; size: number }[];
  if (rows.length === 0) return null;
  const r = rows[0];
  return { id: r.id, filename: r.filename, contentType: r.content_type, size: r.size };
}

export async function putUploadChunk(id: string, idx: number, data: Buffer): Promise<void> {
  await ensureSchema();
  const db = sql();
  await db`
    INSERT INTO upload_chunks (upload_id, idx, data) VALUES (${id}, ${idx}, ${data})
    ON CONFLICT (upload_id, idx) DO UPDATE SET data = EXCLUDED.data
  `;
}

// Reassembles a finished upload; null if it doesn't exist or isn't complete.
export async function readUpload(id: string): Promise<(UploadMeta & { data: Buffer }) | null> {
  const meta = await getUploadMeta(id);
  if (!meta) return null;
  const db = sql();
  const rows = (await db`
    SELECT data FROM upload_chunks WHERE upload_id = ${id} ORDER BY idx ASC
  `) as { data: Buffer }[];
  const data = Buffer.concat(rows.map((r) => r.data));
  if (data.length !== meta.size) return null;
  return { ...meta, data };
}

export async function deleteUploads(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await ensureSchema();
  const db = sql();
  await db`DELETE FROM uploads WHERE id = ANY(${ids}::uuid[])`;
}

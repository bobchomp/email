import { Pool } from "pg";

// Reuse a single pool across invocations (important in serverless: avoids
// exhausting the DB's connection limit on every cold start / hot reload).
const globalForPg = globalThis as unknown as { pgPool?: Pool };

function getPool(): Pool {
  if (!globalForPg.pgPool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
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

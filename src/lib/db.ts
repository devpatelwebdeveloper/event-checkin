import { Pool } from "pg";

// Vercel Postgres (Neon) injects POSTGRES_URL automatically when you add
// the Storage integration. Falling back to DATABASE_URL for local/dev use.
const connectionString =
  process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!connectionString) {
  // Don't throw at import time during build — only when actually queried.
  console.warn(
    "[db] No POSTGRES_URL or DATABASE_URL set. Set this in Vercel's Storage tab or your .env.local"
  );
}

declare global {
  var __pgPool: Pool | undefined;
}

function getPool(): Pool {
  if (!global.__pgPool) {
    global.__pgPool = new Pool({
      connectionString,
      ssl: connectionString?.includes("localhost")
        ? false
        : { rejectUnauthorized: false },
      max: 10,
    });
  }
  return global.__pgPool;
}

export async function query<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const pool = getPool();
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function queryOne<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

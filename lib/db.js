import pg from 'pg';

const { Pool } = pg;

// Cache the pool on globalThis so Next.js dev HMR (which re-evaluates
// modules) doesn't leak a new pool per reload. Scripts and the production
// server simply get a process-wide singleton.
const globalForDb = globalThis;

export function getPool() {
  if (!globalForDb.__leetcodePgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL is not set — add it to .env (see .env.example)',
      );
    }
    globalForDb.__leetcodePgPool = new Pool({
      connectionString,
      // Supabase's server cert chains to Supabase's own CA, which is not in
      // Node's default trust store — encrypt, but skip chain verification.
      ssl: { rejectUnauthorized: false },
      max: 5,
    });
  }
  return globalForDb.__leetcodePgPool;
}

// Single-statement helper: query('SELECT ... WHERE x = $1', [x]) -> pg Result.
export const query = (text, params) => getPool().query(text, params);

// Host part of DATABASE_URL for log lines — never includes credentials.
export function getDbHost() {
  try {
    return new URL(process.env.DATABASE_URL).host;
  } catch {
    return '(DATABASE_URL not set)';
  }
}

// For scripts — an open pool keeps the process alive until it is ended.
// The Next.js server never calls this; it keeps the pool for its lifetime.
export async function closePool() {
  if (globalForDb.__leetcodePgPool) {
    await globalForDb.__leetcodePgPool.end();
    globalForDb.__leetcodePgPool = undefined;
  }
}

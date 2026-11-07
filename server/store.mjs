import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from './errors.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

export function createPostgresStore(pool) {
  return {
    kind: 'postgres',
    query: (text, params = []) => pool.query(text, params),
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await work({ query: (text, params = []) => client.query(text, params) });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        throw error;
      } finally { client.release(); }
    },
    close: () => pool.end(),
  };
}

export async function openStore({
  databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL,
  sqliteFile = process.env.WASIT_DB ?? resolve(root, 'data/wasit.sqlite'),
  production = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production',
  migrate = true,
} = {}) {
  if (databaseUrl) {
    let url;
    try { url = new URL(databaseUrl); } catch { throw new HttpError(503, 'storage_not_configured', 'Persistent storage is not configured correctly.'); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new HttpError(503, 'storage_not_configured', 'Persistent storage requires a PostgreSQL connection.');
    if (production && url.searchParams.get('sslmode') === 'disable') throw new HttpError(503, 'storage_not_configured', 'Production storage requires an encrypted connection.');
    const { Pool, types } = await import('pg');
    const pool = new Pool({
      connectionString: databaseUrl, max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000,
      allowExitOnIdle: true,
      ...(!url.searchParams.has('sslmode') && production ? { ssl: { rejectUnauthorized: true } } : {}),
      types: { getTypeParser(oid, format) {
        if (oid !== 20) return types.getTypeParser(oid, format);
        return (value) => {
          const parsed = Number(value);
          if (!Number.isSafeInteger(parsed)) throw new Error('Stored integer exceeds the supported range.');
          return parsed;
        };
      } },
    });
    // A failed idle connection must not terminate the worker or expose credentials.
    pool.on('error', () => {});
    const store = createPostgresStore(pool);
    if (migrate) {
      try { const { migratePostgres } = await import('./postgres-schema.mjs'); await migratePostgres(store); }
      catch (error) { await store.close(); throw error; }
    }
    return store;
  }
  if (production) throw new HttpError(503, 'storage_not_configured', 'A persistent production database is required.');
  const { openDb } = await import('./db.mjs');
  const db = openDb(sqliteFile);
  let tail = Promise.resolve(), closed = false;
  const lock = (work) => {
    const next = tail.then(() => { if (closed) throw new Error('Storage is closed.'); return work(); });
    tail = next.catch(() => {});
    return next;
  };
  function query(text, params = []) {
    const bound = [];
    const sql = text.replace(/\$(\d+)/g, (_match, index) => {
      if (Number(index) > params.length) throw new Error('Missing SQL parameter.');
      bound.push(params[Number(index) - 1]);
      return '?';
    });
    const statement = db.prepare(sql);
    if (/^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) {
      const rows = statement.all(...bound);
      return { rows, rowCount: rows.length };
    }
    const result = statement.run(...bound);
    return { rows: [], rowCount: Number(result.changes) };
  }
  return {
    kind: 'sqlite',
    query: (text, params = []) => lock(() => query(text, params)),
    transaction: (work) => lock(async () => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = await work({ query: async (text, params = []) => query(text, params) });
        db.exec('COMMIT'); return result;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    }),
    close: () => lock(() => { db.close(); closed = true; }),
  };
}

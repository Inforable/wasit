import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// One column registry initializes fresh databases and adds missing columns to older files.
// Existing rows are preserved; columns requiring an application backfill remain nullable.
import { TABLES, IMMUTABLE_TRIGGERS } from './schema.mjs';
export { TABLES, IMMUTABLE_TRIGGERS } from './schema.mjs';

export function openDb(file = ':memory:') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  try {
    db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE;');
    for (const table of ['messages', 'events']) {
      const old = db.prepare(`PRAGMA table_info("${table}")`).all().find((c) => c.name === 'id');
      if (old?.type === 'INTEGER') {
        const count = db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n;
        if (count) throw new Error(`Export existing ${table} before migrating legacy numeric IDs.`);
        db.exec(`DROP TABLE "${table}"`);
      }
    }
    for (const [table, columns] of Object.entries(TABLES)) {
      const definitions = Object.entries(columns).map(([name, type]) => `"${name}" ${type}`);
      db.exec(`CREATE TABLE IF NOT EXISTS "${table}" (${definitions.join(', ')});`);
      const present = new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name));
      for (const [name, type] of Object.entries(columns)) {
        if (present.has(name)) continue;
        if (/PRIMARY KEY|UNIQUE/.test(type)) {
          throw new Error(`Database migration requires a key column: ${table}.${name}`);
        }
        db.exec(`ALTER TABLE "${table}" ADD COLUMN "${name}" ${type};`);
      }
    }
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS deal_per_request ON deals(request_id);
      CREATE UNIQUE INDEX IF NOT EXISTS version_number_per_deal ON agreement_versions(deal_id, number);
      CREATE UNIQUE INDEX IF NOT EXISTS one_active_version ON agreement_versions(deal_id) WHERE status='active';
      CREATE UNIQUE INDEX IF NOT EXISTS one_pending_version ON agreement_versions(deal_id) WHERE status IN ('draft','pending');
      CREATE UNIQUE INDEX IF NOT EXISTS acceptance_per_role ON acceptances(version_id, role);
      CREATE UNIQUE INDEX IF NOT EXISTS message_replay_key ON messages(branch_id, client_message_id) WHERE client_message_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS events_by_request ON events(request_id, id);
      CREATE INDEX IF NOT EXISTS requests_by_owner ON requests(user_id, created_at);
      CREATE INDEX IF NOT EXISTS branches_by_request ON branches(request_id);
      CREATE INDEX IF NOT EXISTS messages_by_branch ON messages(branch_id, id);
      CREATE INDEX IF NOT EXISTS quotes_by_branch ON quotes(branch_id, version);
      CREATE UNIQUE INDEX IF NOT EXISTS locked_deal_by_request ON locked_deals(request_id);
    `);
    db.exec(IMMUTABLE_TRIGGERS);
    db.exec('COMMIT;');
    return db;
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch {}
    db.close();
    throw error;
  }
}

export const j = (value) => value === undefined ? null : JSON.stringify(value);
export const pj = (value, fallback = null) => value == null ? fallback : JSON.parse(value);

import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, TABLES } from '../server/db.mjs';

test('all domain tables exist and locked deals cannot be changed or deleted', () => {
  const db = openDb();
  try {
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name));
    for (const name of Object.keys(TABLES)) assert.ok(tables.has(name), name);
    db.prepare('INSERT INTO locked_deals (id, request_id, terms_snapshot, terms_hash) VALUES (?,?,?,?)').run('deal_1', 'req_1', '{}', 'hash');
    assert.throws(() => db.exec("UPDATE locked_deals SET terms_hash='changed'"), /immutable/);
    assert.throws(() => db.exec('DELETE FROM locked_deals'), /immutable/);
    assert.equal(db.prepare('SELECT terms_hash FROM locked_deals').get().terms_hash, 'hash');
  } finally { db.close(); }
});
test('additive migrations preserve old rows, enable WAL, and can run twice', () => {
  const folder = mkdtempSync(join(tmpdir(), 'wasit-db-'));
  const file = join(folder, 'old.sqlite');
  let db;
  try {
    db = new DatabaseSync(file);
    db.exec("CREATE TABLE requests (id TEXT PRIMARY KEY, request_text TEXT); INSERT INTO requests VALUES ('req_old', 'Keep this request');");
    db.close(); db = openDb(file);
    assert.equal(db.prepare('SELECT request_text FROM requests').get().request_text, 'Keep this request');
    assert.ok(db.prepare('PRAGMA table_info(requests)').all().some((c) => c.name === 'user_id'));
    assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
    db.close(); db = openDb(file);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM requests').get().n, 1);
  } finally { db?.close(); rmSync(folder, { recursive: true, force: true }); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';

test('database protects version terms, one active/proposal, and unique immutable acceptance', () => {
  const db = openDb();
  try {
    db.prepare('INSERT INTO deals (id, request_id) VALUES (?,?)').run('deal_demo01', 'request_demo01');
    const insert = db.prepare('INSERT INTO agreement_versions (id,deal_id,number,status,terms_json,terms_digest,created_at) VALUES (?,?,?,?,?,?,?)');
    insert.run('version_demo01','deal_demo01',1,'active','{}','digest1',1);
    insert.run('version_demo02','deal_demo01',2,'pending','{}','digest2',2);
    assert.throws(() => insert.run('version_demo03','deal_demo01',3,'active','{}','digest3',3), /UNIQUE/);
    assert.throws(() => insert.run('version_demo03','deal_demo01',3,'draft','{}','digest3',3), /UNIQUE/);
    assert.throws(() => db.exec("UPDATE agreement_versions SET terms_json='changed' WHERE id='version_demo01'"), /immutable/);
    assert.throws(() => db.exec("DELETE FROM agreement_versions WHERE id='version_demo01'"), /immutable/);
    const accept = db.prepare('INSERT INTO acceptances (id,version_id,role,actor_id,terms_digest,budget_ack_limit,accepted_at) VALUES (?,?,?,?,?,?,?)');
    accept.run('accept_demo01','version_demo01','consumer','consumer_demo01','digest1',250000,1);
    assert.throws(() => accept.run('accept_demo02','version_demo01','consumer','consumer_demo01','digest1',250000,2), /UNIQUE/);
    assert.throws(() => db.exec("UPDATE acceptances SET budget_ack_limit=1"), /immutable/);
    assert.throws(() => db.exec('DELETE FROM acceptances'), /immutable/);
    db.exec("BEGIN; UPDATE agreement_versions SET status='superseded' WHERE id='version_demo01'; UPDATE agreement_versions SET status='active' WHERE id='version_demo02'; COMMIT;");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM agreement_versions WHERE status='active'").get().n, 1);
  } finally { db.close(); }
});

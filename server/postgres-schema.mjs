import { TABLES } from './schema.mjs';

function pgType(type) {
  if (type === 'INTEGER PRIMARY KEY AUTOINCREMENT') return 'BIGSERIAL PRIMARY KEY';
  return type.replace(/\bINTEGER\b/g, 'BIGINT').replace(/\bREAL\b/g, 'DOUBLE PRECISION');
}
const indexes = [
  'CREATE UNIQUE INDEX IF NOT EXISTS deal_per_request ON deals(request_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS version_number_per_deal ON agreement_versions(deal_id, number)',
  "CREATE UNIQUE INDEX IF NOT EXISTS one_active_version ON agreement_versions(deal_id) WHERE status='active'",
  "CREATE UNIQUE INDEX IF NOT EXISTS one_pending_version ON agreement_versions(deal_id) WHERE status IN ('draft','pending')",
  'CREATE UNIQUE INDEX IF NOT EXISTS acceptance_per_role ON acceptances(version_id, role)',
  'CREATE UNIQUE INDEX IF NOT EXISTS message_replay_key ON messages(branch_id, client_message_id) WHERE client_message_id IS NOT NULL',
  'CREATE INDEX IF NOT EXISTS events_by_request ON events(request_id, id)',
  'CREATE INDEX IF NOT EXISTS requests_by_owner ON requests(user_id, created_at)',
  'CREATE INDEX IF NOT EXISTS branches_by_request ON branches(request_id)',
  'CREATE INDEX IF NOT EXISTS messages_by_branch ON messages(branch_id, id)',
  'CREATE INDEX IF NOT EXISTS quotes_by_branch ON quotes(branch_id, version)',
  'CREATE UNIQUE INDEX IF NOT EXISTS locked_deal_by_request ON locked_deals(request_id)',
];
export async function migratePostgres(store) {
  await store.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock($1)', [17460401]);
    for (const [table, columns] of Object.entries(TABLES)) {
      const definitions = Object.entries(columns).map(([name, type]) => `"${name}" ${pgType(type)}`);
      await tx.query(`CREATE TABLE IF NOT EXISTS "${table}" (${definitions.join(', ')})`);
      for (const [name, type] of Object.entries(columns)) {
        if (/PRIMARY KEY|UNIQUE/.test(type)) continue;
        await tx.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${name}" ${pgType(type)}`);
      }
    }
    for (const statement of indexes) await tx.query(statement);
    await tx.query(`CREATE OR REPLACE FUNCTION wasit_reject_mutation() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'This record is immutable' USING ERRCODE = '23000'; END; $$`);
    for (const [name, event, table] of [
      ['agreement_terms_no_update', 'UPDATE OF deal_id, number, parent_version_id, terms_json, terms_digest, created_at', 'agreement_versions'],
      ['agreement_versions_no_delete', 'DELETE', 'agreement_versions'],
      ['acceptance_no_update', 'UPDATE', 'acceptances'],
      ['acceptance_no_delete', 'DELETE', 'acceptances'],
      ['locked_deals_no_update', 'UPDATE', 'locked_deals'],
      ['locked_deals_no_delete', 'DELETE', 'locked_deals'],
    ]) {
      await tx.query(`DROP TRIGGER IF EXISTS "${name}" ON "${table}"`);
      await tx.query(`CREATE TRIGGER "${name}" BEFORE ${event} ON "${table}" FOR EACH ROW EXECUTE FUNCTION wasit_reject_mutation()`);
    }
  });
}

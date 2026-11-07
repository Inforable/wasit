import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// One column registry initializes fresh databases and adds missing columns to older files.
// Existing rows are preserved; columns requiring an application backfill remain nullable.
export const TABLES = {
  sessions: { id: 'TEXT PRIMARY KEY', actor_id: 'TEXT', csrf_hash: 'TEXT', expires_at: 'INTEGER', generation: 'INTEGER NOT NULL DEFAULT 0' },
  deals: { id: 'TEXT PRIMARY KEY', request_id: 'TEXT', branch_id: 'TEXT', provider_label: 'TEXT', active_version_id: 'TEXT', pending_version_id: 'TEXT', created_at: 'INTEGER' },
  agreement_versions: {
    id: 'TEXT PRIMARY KEY', deal_id: 'TEXT NOT NULL REFERENCES deals(id)', number: 'INTEGER NOT NULL',
    parent_version_id: 'TEXT', status: 'TEXT NOT NULL', terms_json: 'TEXT NOT NULL',
    terms_digest: 'TEXT NOT NULL', created_at: 'INTEGER NOT NULL',
  },
  acceptances: {
    id: 'TEXT PRIMARY KEY', version_id: 'TEXT NOT NULL REFERENCES agreement_versions(id)',
    role: "TEXT NOT NULL CHECK(role IN ('consumer','provider'))", actor_id: 'TEXT NOT NULL',
    terms_digest: 'TEXT NOT NULL', budget_ack_limit: 'INTEGER', accepted_at: 'INTEGER NOT NULL',
  },
  bill_checks: { id: 'TEXT PRIMARY KEY', deal_id: 'TEXT REFERENCES deals(id)', version_id: 'TEXT REFERENCES agreement_versions(id)', lines_json: 'TEXT', results_json: 'TEXT', submitted_total: 'INTEGER', created_at: 'INTEGER' },
  profiles: { id: 'TEXT PRIMARY KEY', profile_json: 'TEXT', updated_at: 'INTEGER' },
  providers: {
    id: 'TEXT PRIMARY KEY', name: 'TEXT', category: 'TEXT', channel: 'TEXT', rating: 'REAL',
    jobs_done: 'INTEGER', persona: 'TEXT', delay: 'INTEGER',
    consent: 'INTEGER NOT NULL DEFAULT 0', consent_at: 'INTEGER', consent_text: 'TEXT',
    pool: "TEXT NOT NULL DEFAULT 'default'", base_kecamatan: 'TEXT',
    radius_km: 'REAL', avail_json: 'TEXT',
  },
  provider_prices: {
    provider_id: 'TEXT PRIMARY KEY', base: 'INTEGER', floor: 'INTEGER', transport: 'INTEGER',
    addons_json: 'TEXT', warranty_days: 'INTEGER', includes_item: 'INTEGER NOT NULL DEFAULT 1',
    seed_version: 'TEXT', updated_by: 'TEXT', updated_at: 'INTEGER',
  },
  requests: {
    id: 'TEXT PRIMARY KEY', parent_id: 'TEXT', user_id: 'TEXT', request_text: 'TEXT',
    status: 'TEXT', job_json: 'TEXT', questions_json: 'TEXT', weights_json: 'TEXT',
    formatter_by: 'TEXT', fair_range_json: 'TEXT', scenario_id: 'TEXT', manual_for: 'TEXT',
    timeout_ms: 'INTEGER', accepted_quote_id: 'TEXT', error: 'TEXT', created_at: 'INTEGER',
    evaluated_at: 'INTEGER',
  },
  branches: {
    id: 'TEXT PRIMARY KEY', request_id: 'TEXT', provider_id: 'TEXT', channel: 'TEXT',
    mode: "TEXT NOT NULL DEFAULT 'auto'", wasit_mode: "TEXT NOT NULL DEFAULT 'agent'",
    status: 'TEXT', round: 'INTEGER NOT NULL DEFAULT 0',
    asked_basics: 'INTEGER NOT NULL DEFAULT 0', asked_addons: 'INTEGER NOT NULL DEFAULT 0',
    asked_terms: 'INTEGER NOT NULL DEFAULT 0', countered: 'INTEGER NOT NULL DEFAULT 0',
    suspicious: 'INTEGER NOT NULL DEFAULT 0', pending_question: 'TEXT', token: 'TEXT', token_hash: 'TEXT', token_expires_at: 'INTEGER',
    deadline_at: 'INTEGER', created_at: 'INTEGER', updated_at: 'INTEGER',
  },
  messages: {
    id: 'INTEGER PRIMARY KEY AUTOINCREMENT', branch_id: 'TEXT', direction: 'TEXT',
    intent: 'TEXT', text: 'TEXT', sender: 'TEXT', client_message_id: 'TEXT', amounts_json: 'TEXT', honesty_json: 'TEXT', created_at: 'INTEGER',
  },
  quotes: {
    id: 'TEXT PRIMARY KEY', branch_id: 'TEXT', request_id: 'TEXT', version: 'INTEGER',
    data_json: 'TEXT', status: 'TEXT', flags_json: 'TEXT', reasons_json: 'TEXT',
    comparable_json: 'TEXT', created_at: 'INTEGER',
  },
  verdicts: {
    quote_id: 'TEXT PRIMARY KEY', request_id: 'TEXT', rank: 'INTEGER', score: 'REAL',
    total: 'INTEGER', flags_json: 'TEXT', parts_json: 'TEXT', penalty: 'REAL',
    explanation: 'TEXT', by: 'TEXT',
  },
  decisions: {
    id: 'INTEGER PRIMARY KEY AUTOINCREMENT', request_id: 'TEXT', quote_id: 'TEXT',
    action: 'TEXT', created_at: 'INTEGER',
  },
  locked_deals: {
    id: 'TEXT PRIMARY KEY', request_id: 'TEXT UNIQUE', quote_id: 'TEXT',
    terms_snapshot: 'TEXT', terms_hash: 'TEXT', created_at: 'INTEGER',
  },
  addon_checks: {
    id: 'TEXT PRIMARY KEY', deal_id: 'TEXT', item: 'TEXT', proposed_price: 'INTEGER',
    verdict: 'TEXT', reason: 'TEXT', result_json: 'TEXT',
    approved: 'INTEGER NOT NULL DEFAULT 0', approved_price: 'INTEGER',
    declined: 'INTEGER NOT NULL DEFAULT 0', created_at: 'INTEGER',
  },
  deal_state: {
    deal_id: 'TEXT PRIMARY KEY', status: 'TEXT', held: 'INTEGER NOT NULL DEFAULT 0',
    released: 'INTEGER NOT NULL DEFAULT 0', refunded: 'INTEGER NOT NULL DEFAULT 0',
    done_at: 'INTEGER', confirmed_at: 'INTEGER', updated_at: 'INTEGER',
  },
  payments: {
    id: 'TEXT PRIMARY KEY', deal_id: 'TEXT', kind: 'TEXT', amount: 'INTEGER',
    note: 'TEXT', version_id: 'TEXT', created_at: 'INTEGER',
  },
  disputes: {
    id: 'TEXT PRIMARY KEY', deal_id: 'TEXT', reason: 'TEXT', detail: 'TEXT',
    asked_amount: 'INTEGER', recommendation_json: 'TEXT', status: 'TEXT',
    prev_status: 'TEXT', provider_response: 'TEXT', provider_note: 'TEXT',
    evidence_json: 'TEXT', created_at: 'INTEGER', resolved_at: 'INTEGER',
  },
  ratings: {
    deal_id: 'TEXT PRIMARY KEY', user_id: 'TEXT', provider_id: 'TEXT', stars: 'INTEGER',
    tags_json: 'TEXT', comment: 'TEXT', reply: 'TEXT', reply_at: 'INTEGER', created_at: 'INTEGER',
  },
  events: {
    id: 'INTEGER PRIMARY KEY AUTOINCREMENT', request_id: 'TEXT', branch_id: 'TEXT',
    t_ms: 'INTEGER', actor: 'TEXT', kind: 'TEXT', engine: 'TEXT', title: 'TEXT',
    detail: 'TEXT', data_json: 'TEXT', created_at: 'INTEGER',
  },
  settings: { key: 'TEXT PRIMARY KEY', value_json: 'TEXT' },
};

export const IMMUTABLE_TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS agreement_terms_no_update
BEFORE UPDATE OF deal_id, number, parent_version_id, terms_json, terms_digest, created_at ON agreement_versions
BEGIN SELECT RAISE(ABORT, 'agreement terms are immutable'); END;
CREATE TRIGGER IF NOT EXISTS agreement_versions_no_delete BEFORE DELETE ON agreement_versions
BEGIN SELECT RAISE(ABORT, 'agreement versions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS acceptance_no_update BEFORE UPDATE ON acceptances
BEGIN SELECT RAISE(ABORT, 'acceptance is immutable'); END;
CREATE TRIGGER IF NOT EXISTS acceptance_no_delete BEFORE DELETE ON acceptances
BEGIN SELECT RAISE(ABORT, 'acceptance is immutable'); END;
CREATE TRIGGER IF NOT EXISTS locked_deals_no_update BEFORE UPDATE ON locked_deals
BEGIN SELECT RAISE(ABORT, 'locked_deals is immutable'); END;
CREATE TRIGGER IF NOT EXISTS locked_deals_no_delete BEFORE DELETE ON locked_deals
BEGIN SELECT RAISE(ABORT, 'locked_deals is immutable'); END;
`;

export function openDb(file = ':memory:') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  try {
    db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE;');
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

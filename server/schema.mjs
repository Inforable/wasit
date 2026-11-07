export const TABLES = {
  accounts: { actor_id: 'TEXT PRIMARY KEY', email: 'TEXT NOT NULL UNIQUE', display_name: 'TEXT NOT NULL', password_salt: 'TEXT NOT NULL', password_hash: 'TEXT NOT NULL', created_at: 'INTEGER NOT NULL', updated_at: 'INTEGER NOT NULL' },
  auth_attempts: { key: 'TEXT PRIMARY KEY', attempts: 'INTEGER NOT NULL DEFAULT 0', window_started: 'INTEGER NOT NULL', blocked_until: 'INTEGER NOT NULL DEFAULT 0' },
  tasks: { id: 'TEXT PRIMARY KEY', request_id: 'TEXT NOT NULL', branch_id: 'TEXT', kind: 'TEXT NOT NULL', source_key: 'TEXT NOT NULL', generation: 'INTEGER NOT NULL DEFAULT 0', status: "TEXT NOT NULL DEFAULT 'pending'", lease_token: 'TEXT', lease_until: 'INTEGER', due_at: 'INTEGER NOT NULL DEFAULT 0', payload_json: 'TEXT', created_at: 'INTEGER', updated_at: 'INTEGER', attempts: 'INTEGER NOT NULL DEFAULT 0' },
  sessions: { id: 'TEXT PRIMARY KEY', actor_id: 'TEXT', csrf_hash: 'TEXT', created_at: 'INTEGER', expires_at: 'INTEGER', generation: 'INTEGER NOT NULL DEFAULT 0' },
  deals: { id: 'TEXT PRIMARY KEY', request_id: 'TEXT', branch_id: 'TEXT', quote_revision: 'INTEGER', provider_label: 'TEXT', active_version_id: 'TEXT', pending_version_id: 'TEXT', created_at: 'INTEGER' },
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
    id: 'TEXT PRIMARY KEY', parent_id: 'TEXT', user_id: 'TEXT', request_text: 'TEXT', input_json: 'TEXT', generation: 'INTEGER NOT NULL DEFAULT 0', archived_at: 'INTEGER',
    status: 'TEXT', job_json: 'TEXT', questions_json: 'TEXT', weights_json: 'TEXT',
    formatter_by: 'TEXT', fair_range_json: 'TEXT', scenario_id: 'TEXT', manual_for: 'TEXT',
    timeout_ms: 'INTEGER', accepted_quote_id: 'TEXT', error: 'TEXT', created_at: 'INTEGER',
    evaluated_at: 'INTEGER',
  },
  branches: {
    id: 'TEXT PRIMARY KEY', request_id: 'TEXT', provider_id: 'TEXT', channel: 'TEXT',
    mode: "TEXT NOT NULL DEFAULT 'auto'", wasit_mode: "TEXT NOT NULL DEFAULT 'agent'",
    status: 'TEXT', round: 'INTEGER NOT NULL DEFAULT 0', clarifications_sent: 'INTEGER NOT NULL DEFAULT 0',
    asked_basics: 'INTEGER NOT NULL DEFAULT 0', asked_addons: 'INTEGER NOT NULL DEFAULT 0',
    asked_terms: 'INTEGER NOT NULL DEFAULT 0', countered: 'INTEGER NOT NULL DEFAULT 0',
    suspicious: 'INTEGER NOT NULL DEFAULT 0', pending_question: 'TEXT', token: 'TEXT', token_hash: 'TEXT', token_nonce: 'TEXT', token_expires_at: 'INTEGER',
    deadline_at: 'INTEGER', created_at: 'INTEGER', updated_at: 'INTEGER',
  },
  messages: {
    id: 'TEXT PRIMARY KEY', branch_id: 'TEXT', direction: 'TEXT',
    intent: 'TEXT', text: 'TEXT', sender: 'TEXT', engine: 'TEXT', client_message_id: 'TEXT', amounts_json: 'TEXT', honesty_json: 'TEXT', created_at: 'INTEGER',
  },
  quotes: {
    id: 'TEXT PRIMARY KEY', branch_id: 'TEXT', request_id: 'TEXT', version: 'INTEGER', source_message_id: 'TEXT',
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
    done_at: 'INTEGER', confirmed_at: 'INTEGER', funded_version_id: 'TEXT', done_version_id: 'TEXT', updated_at: 'INTEGER',
  },
  payments: {
    id: 'TEXT PRIMARY KEY', deal_id: 'TEXT', kind: 'TEXT', amount: 'INTEGER',
    note: 'TEXT', version_id: 'TEXT', created_at: 'INTEGER',
  },
  disputes: {
    id: 'TEXT PRIMARY KEY', deal_id: 'TEXT', version_id: 'TEXT', reason: 'TEXT', detail: 'TEXT',
    asked_amount: 'INTEGER', recommendation_json: 'TEXT', status: 'TEXT',
    prev_status: 'TEXT', provider_response: 'TEXT', provider_note: 'TEXT',
    evidence_json: 'TEXT', created_at: 'INTEGER', resolved_at: 'INTEGER',
  },
  ratings: {
    deal_id: 'TEXT PRIMARY KEY', user_id: 'TEXT', provider_id: 'TEXT', stars: 'INTEGER',
    tags_json: 'TEXT', comment: 'TEXT', reply: 'TEXT', reply_at: 'INTEGER', created_at: 'INTEGER',
  },
  events: {
    id: 'TEXT PRIMARY KEY', request_id: 'TEXT', branch_id: 'TEXT',
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


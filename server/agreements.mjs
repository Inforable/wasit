import { randomBytes } from 'node:crypto';
import { HttpError } from './errors.mjs';
import { termsDigest, committedTotal, publicTerms } from './agreement-terms.mjs';
import { checkBillLines } from './bill-check.mjs';
import { catalog, normalizeItem, supportedUnits } from './catalog.mjs';
import { parseAmounts } from './money.mjs';
import { stableJson } from '../shared/canonical.mjs';
import { quoteEligibility } from './comparison.mjs';

const failure = (status, code, message) => new HttpError(status, code, message);
const parse = (value) => typeof value === 'string' ? JSON.parse(value) : structuredClone(value);
const defaultId = (prefix) => prefix + '_' + randomBytes(10).toString('hex');
const lineKey = (line) => line.item_code + ':' + line.unit;
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isMoney = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000;

// Business mutations return internal consumer deal objects. Provider HTTP handlers must project public versions.
export function createAgreements({ store, now = Date.now, newId = defaultId, loadQuote, loadJob, loadSourceMessage } = {}) {
  if (!store?.query || !store?.transaction) throw new TypeError('An asynchronous transactional store is required.');
  const first = async (db, text, params) => (await db.query(text, params)).rows[0] ?? null;
  const quoteLoader = loadQuote ?? (async (branchId) => {
    const row = await first(store, 'SELECT data_json FROM quotes WHERE branch_id=$1 ORDER BY version DESC LIMIT 1', [branchId]);
    return row ? parse(row.data_json) : null;
  });
  const jobLoader = loadJob ?? (async (requestId) => {
    const row = await first(store, 'SELECT job_json FROM requests WHERE id=$1', [requestId]);
    return row?.job_json ? parse(row.job_json) : null;
  });
  const sourceLoader = loadSourceMessage ?? (async (messageId) => first(store, 'SELECT * FROM messages WHERE id=$1', [messageId]));

  function actorRole(actor, required) {
    if (!actor?.actor_id || !['consumer', 'provider'].includes(actor.role)) throw failure(401, 'session_required', 'Sign in to continue.');
    if (required && actor.role !== required) throw failure(403, 'wrong_role', 'This action is not available for your role.');
  }
  function ownership(row, actor, consumerOnly = false) {
    actorRole(actor, consumerOnly ? 'consumer' : undefined);
    if (!row) throw failure(404, 'not_found', 'The agreement was not found.');
    if (row.user_id == null || row.linked_request_id !== row.request_id) throw failure(409, 'invalid_transition', 'The agreement has an invalid request relationship.');
    if (actor.role === 'consumer' && row.user_id !== actor.actor_id) throw failure(404, 'not_found', 'The agreement was not found.');
    if (actor.role === 'provider' && (!actor.branch_id || actor.branch_id !== row.branch_id)) throw failure(403, 'wrong_role', 'This agreement is not available for this provider branch.');
  }
  async function header(db, dealId, lock = false) {
    if (lock) {
      const related=await first(db,'SELECT request_id FROM deals WHERE id=$1',[dealId]);
      if(related)await db.query('UPDATE requests SET status=status WHERE id=$1',[related.request_id]);
      await db.query('UPDATE deals SET id=id WHERE id=$1', [dealId]);
    }
    return first(db, 'SELECT d.*, r.user_id,r.job_json, b.request_id AS linked_request_id FROM deals d JOIN requests r ON r.id=d.request_id JOIN branches b ON b.id=d.branch_id WHERE d.id=$1 AND r.archived_at IS NULL', [dealId]);
  }
  async function readDeal(db, dealId) {
    const row = await first(db, 'SELECT * FROM deals WHERE id=$1', [dealId]);
    if (!row) throw failure(404, 'not_found', 'The agreement was not found.');
    const versions = (await db.query('SELECT * FROM agreement_versions WHERE deal_id=$1 ORDER BY number', [dealId])).rows;
    const mapped = [];
    for (const version of versions) {
      const acceptances = (await db.query('SELECT role,actor_id,version_id,terms_digest,accepted_at,budget_ack_limit FROM acceptances WHERE version_id=$1 ORDER BY role', [version.id])).rows.map((acceptance) => ({
        ...acceptance, accepted_at: Number(acceptance.accepted_at),
        budget_ack_limit: acceptance.budget_ack_limit == null ? null : Number(acceptance.budget_ack_limit),
      }));
      mapped.push({
        id: version.id, number: Number(version.number), parent_version_id: version.parent_version_id ?? null,
        status: version.status, terms: parse(version.terms_json), terms_digest: version.terms_digest,
        acceptances, created_at: Number(version.created_at),
      });
    }
    return {
      id: row.id, request_id: row.request_id, branch_id: row.branch_id, provider_label: row.provider_label,
      active_version_id: row.active_version_id ?? null, pending_version_id: row.pending_version_id ?? null,
      versions: mapped, lifecycle: null,
    };
  }
  async function versionRow(db, dealId, versionId) {
    const row = await first(db, 'SELECT * FROM agreement_versions WHERE id=$1 AND deal_id=$2', [versionId, dealId]);
    if (!row) throw failure(409, 'stale_version', 'Reload the latest agreement version before continuing.');
    return { ...row, terms: parse(row.terms_json) };
  }
  function digestMatches(version, body) {
    if (!body || body.terms_digest !== version.terms_digest || termsDigest(version.terms) !== version.terms_digest) throw failure(409, 'stale_digest', 'The agreement details changed. Reload and review them again.');
  }
  function expectedActive(row, body) {
    if (!hasOwn(body ?? {}, 'expected_active_version_id') || body.expected_active_version_id !== (row.active_version_id ?? null)) throw failure(409, 'stale_version', 'The active agreement changed. Reload it before continuing.');
  }
  function validateTerms(terms,job=null) {
    if (!Array.isArray(terms.lines) || !terms.lines.length || terms.lines.length > 16 || !isMoney(terms.spending_limit)) throw failure(422, 'ambiguous_terms', 'The agreement needs complete lines and an explicit spending limit.');
    const keys = new Set(), ids = new Set();
    for (const line of terms.lines) {
      if (!line || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20 || keys.has(lineKey(line))) throw failure(422, 'ambiguous_terms', 'Agreement items must have clear, unique units and quantities.');
      if (typeof line.id !== 'string' || ids.has(line.id)) throw failure(422, 'ambiguous_terms', 'Each agreement line needs a unique server-assigned ID.');
      ids.add(line.id);
      keys.add(lineKey(line));
      if (line.kind === 'unknown' ? line.unit_price !== null : !isMoney(line.unit_price)) throw failure(422, 'ambiguous_terms', 'A quoted price must be explicit; an unknown price must remain unknown.');
      if (line.kind === 'included' && line.unit_price !== 0) throw failure(422, 'ambiguous_terms', 'An included item cannot carry an additional price.');
    }
    const total = committedTotal(terms.lines);
    if (total !== terms.committed_total) throw failure(422, 'ambiguous_terms', 'The committed total does not match the agreed lines.');
    if (total > terms.spending_limit) throw failure(422, 'budget_exceeded', 'The proposed work exceeds your spending limit. Propose and acknowledge a new limit first.');
    if(job){
      const base=terms.lines.find(line=>line.item_code===catalog(job.category).baseItem&&['committed','included'].includes(line.kind));
      if(terms.scope!==job.scope||terms.units!==job.units||terms.schedule_label!==job.schedule_label||terms.location_label!==job.location_label||!base||base.quantity!==job.units)throw failure(422,'incomplete_quote','The agreement scope, quantity, location and schedule must match the request.');
    }
  }
  async function validateSource(line, branchId, category, expectedMessageId = null) {
    if (!line.source?.message_id || !line.source?.snippet || (expectedMessageId && line.source.message_id !== expectedMessageId)) throw failure(422, 'invalid_source', 'The quoted line does not match its provider message.');
    const message = await sourceLoader(line.source.message_id);
    if (!message || message.branch_id !== branchId || (message.sender ?? (message.direction === 'in' ? 'provider' : null)) !== 'provider' || !String(message.text).includes(line.source.snippet)) throw failure(422, 'invalid_source', 'Each price must come from this provider branch and an exact source quote.');
    if (normalizeItem(category, line.source.snippet) !== line.item_code || !supportedUnits(category, line.item_code).includes(line.unit)) throw failure(422, 'invalid_source', 'The source must identify the quoted item and a supported unit.');
    if (line.unit_price != null && line.unit_price > 0 && !parseAmounts(line.source.snippet).some((amount) => amount.value === line.unit_price)) throw failure(422, 'invalid_source', 'The quoted price must be present in the source for this item.');
    if (line.unit_price === 0 && !/(gratis|free|termasuk|included|\b0\b)/i.test(line.source.snippet)) throw failure(422, 'invalid_source', 'A free or included item must be stated explicitly.');
    return message;
  }
  function quoteTerms(quote, job) {
    if (!quote || quote.status !== 'ready' || !isMoney(quote.fixed_total) || !quote.schedule_label || quote.category !== job.category || quote.scope !== job.scope || quote.units !== job.units || quote.unresolved?.length) throw failure(422, 'incomplete_quote', 'Choose a complete quote with the requested category, scope, units and schedule.');
    const eligible=quoteEligibility(job,quote);
    if(!eligible.ok)throw failure(422,'incomplete_quote',eligible.reason);
    const book = catalog(job.category);
    for (const code of book.requiredItems) {
      const line = quote.lines.find((candidate) => candidate.item_code === code && ['fixed', 'included'].includes(candidate.kind));
      if (!line) throw failure(422, 'incomplete_quote', 'A required service or transport cost is not explicit.');
    }
    const terms = {
      scope: quote.scope, units: quote.units, location_label: job.location_label, schedule_label: quote.schedule_label,
      lines: quote.lines.map(({ source, kind, ...line }) => ({ ...line, kind: kind === 'fixed' ? 'committed' : kind, source_message_id: source.message_id })),
      committed_total: quote.fixed_total, spending_limit: job.max_budget, change_reason: null,
    };
    validateTerms(terms,job);
    return terms;
  }
  async function ensureMutableLifecycle(tx, dealId) {
    const state = await first(tx, 'SELECT status FROM deal_state WHERE deal_id=$1', [dealId]);
    if (state && ['released', 'resolved', 'disputed', 'escalated'].includes(state.status)) {
      throw failure(409, 'invalid_transition', 'Resolve the current work or dispute before changing this agreement.');
    }
  }
  async function insertVersion(tx, row, terms, parentId) {
    await ensureMutableLifecycle(tx, row.id);
    validateTerms(terms);
    const latest = await first(tx, 'SELECT COALESCE(MAX(number),0) AS n FROM agreement_versions WHERE deal_id=$1', [row.id]);
    const id = newId('version');
    await tx.query('INSERT INTO agreement_versions (id,deal_id,number,parent_version_id,status,terms_json,terms_digest,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [id, row.id, Number(latest.n) + 1, parentId, 'draft', JSON.stringify(terms), termsDigest(terms), now()]);
    await tx.query('UPDATE deals SET pending_version_id=$1 WHERE id=$2', [id, row.id]);
    return id;
  }

  async function createDeal({ requestId, branchId, quoteRevision, actor }) {
    actorRole(actor, 'consumer');
    if (!Number.isInteger(quoteRevision) || quoteRevision < 1) throw failure(400, 'invalid_payload', 'Choose a current quote revision.');
    const owner = await first(store, 'SELECT * FROM requests WHERE id=$1 AND archived_at IS NULL', [requestId]);
    if (!owner || owner.user_id !== actor.actor_id) throw failure(404, 'not_found', 'The request was not found.');
    const existing = await first(store, 'SELECT * FROM deals WHERE request_id=$1', [requestId]);
    if (existing) {
      if (existing.branch_id !== branchId || Number(existing.quote_revision) !== quoteRevision) throw failure(409, 'deal_exists', 'This request already has a selected provider and quote.');
      return getDeal(existing.id, actor);
    }
    const [quote, job] = await Promise.all([quoteLoader(branchId), jobLoader(requestId)]);
    if (!job || quote?.branch_id !== branchId || quote?.revision !== quoteRevision) throw failure(409, 'stale_quote', 'The quote changed. Review its current revision.');
    const terms = quoteTerms(quote, job);
    for (const line of quote.lines) await validateSource(line, branchId, job.category);
    return store.transaction(async (tx) => {
      await tx.query('UPDATE requests SET status=status WHERE id=$1', [requestId]);
      const currentOwner = await first(tx, 'SELECT * FROM requests WHERE id=$1 AND archived_at IS NULL', [requestId]);
      const branch = await first(tx, 'SELECT * FROM branches WHERE id=$1 AND request_id=$2', [branchId, requestId]);
      if (!currentOwner || currentOwner.user_id !== actor.actor_id || !branch) throw failure(404, 'not_found', 'The request or provider branch was not found.');
      if(branch.pending_question)throw failure(409,'customer_question_pending','Answer the provider question before selecting this quotation.');
      const replay = await first(tx, 'SELECT * FROM deals WHERE request_id=$1', [requestId]);
      if (replay) {
        if (replay.branch_id !== branchId || Number(replay.quote_revision) !== quoteRevision) throw failure(409, 'deal_exists', 'This request already has a selected provider and quote.');
        return readDeal(tx, replay.id);
      }
      const pendingMessage=await first(tx,"SELECT m.id FROM messages m WHERE m.branch_id=$1 AND (m.sender='provider' OR (m.sender IS NULL AND m.direction='in')) AND NOT EXISTS(SELECT 1 FROM quotes q WHERE q.branch_id=m.branch_id AND q.source_message_id=m.id) LIMIT 1",[branchId]);
      if(pendingMessage)throw failure(409,'quote_processing','A provider message is still being checked. Process it before selecting the quote.');
      const persistedQuote = await first(tx, 'SELECT data_json,request_id,version FROM quotes WHERE branch_id=$1 ORDER BY version DESC LIMIT 1', [branchId]);
      if (!persistedQuote || persistedQuote.request_id !== requestId || Number(persistedQuote.version) !== quoteRevision || stableJson(parse(persistedQuote.data_json)) !== stableJson(quote)) throw failure(409, 'stale_quote', 'The quote changed. Review its current revision.');
      if (currentOwner.job_json && stableJson(parse(currentOwner.job_json)) !== stableJson(job)) throw failure(409, 'stale_quote', 'The request details changed. Review the quote again.');
      const id = newId('deal');
      const provider = await first(tx, 'SELECT name FROM providers WHERE id=$1', [branch.provider_id]);
      await tx.query('INSERT INTO deals (id,request_id,branch_id,provider_label,quote_revision,active_version_id,pending_version_id,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [id, requestId, branchId, provider?.name ?? branch.provider_id ?? 'Service provider', quoteRevision, null, null, now()]);
      await insertVersion(tx, { id }, terms, null);
      return readDeal(tx, id);
    });
  }

  async function getDeal(dealId, actor) {
    ownership(await header(store, dealId), actor, true);
    return readDeal(store, dealId);
  }

  async function submit(dealId, body, actor) {
    return store.transaction(async (tx) => {
      const row = await header(tx, dealId, true); ownership(row, actor, true);
      const version = await versionRow(tx, dealId, body?.version_id); digestMatches(version, body);
      if (['pending', 'active', 'superseded'].includes(version.status)) {
        if (!hasOwn(body, 'expected_active_version_id') || body.expected_active_version_id !== (version.parent_version_id ?? null)) throw failure(409, 'stale_version', 'This submit request does not match the original proposal.');
        return readDeal(tx, dealId);
      }
      expectedActive(row, body);
      if (version.status !== 'draft' || row.pending_version_id !== version.id || version.parent_version_id !== (row.active_version_id ?? null)) throw failure(409, 'invalid_transition', 'Only the current draft can be submitted.');
      await ensureMutableLifecycle(tx, dealId);
      validateTerms(version.terms,parse(row.job_json));
      await tx.query("UPDATE agreement_versions SET status='pending' WHERE id=$1", [version.id]);
      return readDeal(tx, dealId);
    });
  }

  async function accept(dealId, body, actor) {
    return store.transaction(async (tx) => {
      const row = await header(tx, dealId, true); ownership(row, actor);
      const version = await versionRow(tx, dealId, body?.version_id); digestMatches(version, body);
      const expectedAck = actor.role === 'consumer' ? version.terms.spending_limit : null;
      if (!hasOwn(body, 'budget_ack_limit') || body.budget_ack_limit !== expectedAck) throw failure(409, 'stale_version', actor.role === 'consumer' ? 'Acknowledge the exact spending limit for this version.' : 'Provider acceptance cannot acknowledge a private spending limit.');
      if (version.status === 'rejected') throw failure(409, 'invalid_transition', 'This proposal was rejected and cannot be accepted.');
      const previous = await first(tx, 'SELECT * FROM acceptances WHERE version_id=$1 AND role=$2', [version.id, actor.role]);
      if (previous) {
        if (previous.actor_id !== actor.actor_id || previous.terms_digest !== body.terms_digest || (previous.budget_ack_limit == null ? null : Number(previous.budget_ack_limit)) !== expectedAck) throw failure(409, 'idempotency_conflict', 'This role has already accepted with different details.');
        return readDeal(tx, dealId);
      }
      expectedActive(row, body);
      if (version.status !== 'pending' || row.pending_version_id !== version.id || version.parent_version_id !== (row.active_version_id ?? null)) throw failure(409, 'invalid_transition', 'Only the current pending version can be accepted.');
      await ensureMutableLifecycle(tx, dealId);
      validateTerms(version.terms,parse(row.job_json));
      await tx.query('INSERT INTO acceptances (id,version_id,role,actor_id,terms_digest,budget_ack_limit,accepted_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [newId('accept'), version.id, actor.role, actor.actor_id, version.terms_digest, expectedAck, now()]);
      const accepted = (await tx.query('SELECT role FROM acceptances WHERE version_id=$1', [version.id])).rows;
      if (new Set(accepted.map((item) => item.role)).size === 2) {
        if (row.active_version_id) await tx.query("UPDATE agreement_versions SET status='superseded' WHERE id=$1 AND status='active'", [row.active_version_id]);
        await tx.query("UPDATE agreement_versions SET status='active' WHERE id=$1", [version.id]);
        await tx.query('UPDATE deals SET active_version_id=$1,pending_version_id=NULL WHERE id=$2', [version.id, dealId]);
        await tx.query("UPDATE requests SET status='locked' WHERE id=$1", [row.request_id]);
      }
      return readDeal(tx, dealId);
    });
  }

  async function reject(dealId, body, actor) {
    return store.transaction(async (tx) => {
      const row = await header(tx, dealId, true); ownership(row, actor);
      const version = await versionRow(tx, dealId, body?.version_id); digestMatches(version, body);
      if (version.status === 'rejected') return readDeal(tx, dealId);
      if (!['draft', 'pending'].includes(version.status) || row.pending_version_id !== version.id) throw failure(409, 'invalid_transition', 'Only the current proposal can be rejected.');
      await tx.query("UPDATE agreement_versions SET status='rejected' WHERE id=$1", [version.id]);
      await tx.query('UPDATE deals SET pending_version_id=NULL WHERE id=$1', [dealId]);
      return readDeal(tx, dealId);
    });
  }

  async function proposeChange(dealId, body, actor) {
    actorRole(actor, 'consumer');
    if (!Array.isArray(body?.committed_line_ids) || !body.committed_line_ids.length || new Set(body.committed_line_ids).size !== body.committed_line_ids.length || !isMoney(body.spending_limit)) throw failure(400, 'invalid_payload', 'Choose distinct provider-quoted lines and an explicit spending limit.');
    const before = await header(store, dealId); ownership(before, actor, true);
    const [quote, job, message] = await Promise.all([quoteLoader(before.branch_id), jobLoader(before.request_id), sourceLoader(body.change_message_id)]);
    if (!quote || !job || quote.branch_id !== before.branch_id || !message || message.branch_id !== before.branch_id || (message.sender ?? (message.direction === 'in' ? 'provider' : null)) !== 'provider') throw failure(422, 'invalid_source', 'Changes must come from the selected provider branch.');
    const candidates = body.committed_line_ids.map((id) => quote.lines.find((line) => line.id === id));
    for (const line of candidates) {
      if (!line || line.kind !== 'optional' || line.item_code === 'other' || !isMoney(line.unit_price)) throw failure(422, 'unsupported_change', 'Only explicit provider-quoted optional work can be proposed.');
      await validateSource(line, before.branch_id, job.category, body.change_message_id);
    }
    return store.transaction(async (tx) => {
      const row = await header(tx, dealId, true); ownership(row, actor, true); expectedActive(row, body);
      const question=await first(tx,'SELECT pending_question FROM branches WHERE id=$1',[row.branch_id]);
      if(question?.pending_question)throw failure(409,'customer_question_pending','Answer the provider question before proposing changed work.');
      if (!row.active_version_id) throw failure(409, 'invalid_transition', 'Activate the first agreement before proposing changes.');
      const persistedQuote = await first(tx, 'SELECT data_json,request_id FROM quotes WHERE branch_id=$1 ORDER BY version DESC LIMIT 1', [row.branch_id]);
      if (!persistedQuote || persistedQuote.request_id !== row.request_id || stableJson(parse(persistedQuote.data_json)) !== stableJson(quote)) throw failure(409, 'stale_quote', 'The provider quote changed. Review the latest quoted work.');
      const current = await versionRow(tx, dealId, row.active_version_id);
      const terms = structuredClone(current.terms);
      terms.spending_limit = body.spending_limit;
      terms.change_reason = 'Work explicitly quoted by the selected provider.';
      for (const line of candidates) {
        const index = terms.lines.findIndex((old) => lineKey(old) === lineKey(line));
        const old = terms.lines[index];
        if (old?.kind === 'included') throw failure(422, 'unsupported_change', 'An included item cannot be charged again without a separate clarified scope.');
        if (old?.kind === 'committed' && (old.source_message_id === body.change_message_id || (old.unit_price === line.unit_price && old.quantity === line.quantity))) throw failure(422, 'unsupported_change', 'This work is already committed at the same price and quantity.');
        if (terms.lines.some((oldLine) => oldLine.item_code === line.item_code && oldLine.unit !== line.unit)) throw failure(422, 'ambiguous_terms', 'Different units need scope clarification before a change can be proposed.');
        const { source, ...fields } = line;
        const committed = { ...fields, kind: 'committed', source_message_id: source.message_id };
        if (index < 0) terms.lines.push(committed); else terms.lines[index] = committed;
      }
      terms.committed_total = committedTotal(terms.lines);
      validateTerms(terms);
      if (row.pending_version_id) {
        const pending = await versionRow(tx, dealId, row.pending_version_id);
        if (stableJson(pending.terms) === stableJson(terms) && pending.parent_version_id === current.id) return readDeal(tx, dealId);
        throw failure(409, 'pending_version_exists', 'Finish or reject the current proposal before creating another.');
      }
      await insertVersion(tx, row, terms, current.id);
      return readDeal(tx, dealId);
    });
  }

  async function checkBill(dealId, body, actor) {
    const row = await header(store, dealId); ownership(row, actor, true);
    const job = await jobLoader(row.request_id);
    return store.transaction(async (tx) => {
      const current = await header(tx, dealId, true); ownership(current, actor, true); expectedActive(current, body);
      if (!current.active_version_id) throw failure(409, 'invalid_transition', 'An active agreement is required before checking a bill.');
      const version = await versionRow(tx, dealId, current.active_version_id);
      const checked = checkBillLines({ terms: version.terms, lines: body.lines, knownItems: catalog(job.category).items.map((line) => line.id) });
      const result = { id: newId('check'), deal_id: dealId, version_id: version.id, lines: structuredClone(body.lines), ...checked, created_at: now() };
      await tx.query('INSERT INTO bill_checks (id,deal_id,version_id,lines_json,results_json,submitted_total,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [result.id, dealId, version.id, JSON.stringify(result.lines), JSON.stringify(result.results), result.submitted_total, result.created_at]);
      return result;
    });
  }

  async function getPublicVersions(dealId, actor) {
    ownership(await header(store, dealId), actor);
    const deal = await readDeal(store, dealId);
    return deal.versions.map((version) => ({
      id: version.id, number: version.number, parent_version_id: version.parent_version_id,
      status: version.status, public_terms: publicTerms(version.terms), terms_digest: version.terms_digest,
      consumer_accepted: version.acceptances.some((item) => item.role === 'consumer'),
      provider_accepted: version.acceptances.some((item) => item.role === 'provider'),
    }));
  }
  return { createDeal, getDeal, submit, accept, reject, proposeChange, checkBill, getPublicVersions };
}

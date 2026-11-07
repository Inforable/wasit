import { randomBytes } from 'node:crypto';
import { HttpError } from './errors.mjs';
import { committedTotal, termsDigest } from './agreement-terms.mjs';

const MAX_MONEY = 100_000_000;
const REVIEW_TAGS = ['On time', 'Agreed price', 'Tidy work', 'Helpful', 'Clear explanation', 'Late arrival', 'Unapproved charge', 'Poor workmanship'];
const REASONS = { no_show: 'The provider did not arrive', unresolved_work: 'The work remains unresolved', unapproved_charge: 'An unapproved charge was requested' };
const ALIASES = { tidak_datang: 'no_show', hasil_buruk: 'unresolved_work', minta_bayar_lebih: 'unapproved_charge' };
const STATUS_LABELS = {
  locked: 'Agreement accepted — payment pending (simulation)',
  paid: 'Paid — funds held (simulation)',
  done: 'Provider marked the agreed work complete',
  released: 'Funds released (simulation)',
  disputed: 'Dispute open — funds remain held (simulation)',
  resolved: 'Dispute resolved (simulation)',
  escalated: 'Dispute escalated — no mediator is connected',
};
const fail = (status, code, message) => new HttpError(status, code, message);
const parse = (value, fallback = null) => value == null ? fallback : typeof value === 'string' ? JSON.parse(value) : structuredClone(value);
const first = async (db, text, params = []) => (await db.query(text, params)).rows[0] ?? null;
const defaultId = (prefix) => prefix + '_' + randomBytes(10).toString('hex');
const isMoney = (value) => Number.isSafeInteger(value) && value >= 0 && value <= MAX_MONEY;
const nullableNumber = (value) => value == null ? null : Number(value);

export function createLifecycle({ store, now = Date.now, newId = defaultId, autoReleaseHours = 72 } = {}) {
  if (!store?.query || !store?.transaction) throw new TypeError('An asynchronous transactional store is required.');
  if (!Number.isFinite(autoReleaseHours) || autoReleaseHours <= 0) throw new TypeError('The release delay must be positive.');

  function actorRole(actor, expected) {
    if (!actor?.actor_id || !['consumer', 'provider'].includes(actor.role)) throw fail(401, 'session_required', 'Sign in to continue.');
    if (expected && actor.role !== expected) throw fail(403, 'wrong_role', 'This action is not available for your role.');
  }
  function owns(header, actor, expected) {
    actorRole(actor, expected);
    if (!header) throw fail(404, 'not_found', 'The agreement was not found.');
    if (header.linked_request_id !== header.request_id || !header.user_id) throw fail(409, 'invalid_transition', 'The agreement has an invalid request relationship.');
    if (actor.role === 'consumer' && header.user_id !== actor.actor_id) throw fail(404, 'not_found', 'The agreement was not found.');
    if (actor.role === 'provider' && (!actor.branch_id || actor.branch_id !== header.branch_id)) throw fail(403, 'wrong_role', 'This agreement is not available for this provider branch.');
  }
  async function context(db, dealId, { lock = false, actor, role, requireActive = true } = {}) {
    if (actor !== undefined) actorRole(actor, role);
    if (lock) {
      const related=await first(db,'SELECT request_id FROM deals WHERE id=$1',[dealId]);
      if(related)await db.query('UPDATE requests SET status=status WHERE id=$1',[related.request_id]);
      await db.query('UPDATE deals SET id=id WHERE id=$1', [dealId]);
    }
    const header = await first(db, 'SELECT d.*,r.user_id,b.provider_id,b.request_id AS linked_request_id FROM deals d JOIN requests r ON r.id=d.request_id JOIN branches b ON b.id=d.branch_id WHERE d.id=$1 AND r.archived_at IS NULL', [dealId]);
    if (actor !== undefined) owns(header, actor, role);
    if (!header) throw fail(404, 'not_found', 'The agreement was not found.');
    if (header.linked_request_id !== header.request_id || !header.user_id) throw fail(409, 'invalid_transition', 'The agreement has an invalid request relationship.');
    if (!header.active_version_id) {
      if (requireActive) throw fail(409, 'not_payable', 'Both parties must accept an agreement before this action.');
      return { header, version: null, terms: null };
    }
    const version = await first(db, 'SELECT * FROM agreement_versions WHERE id=$1 AND deal_id=$2', [header.active_version_id, dealId]);
    if (!version || version.status !== 'active') throw fail(409, 'stale_version', 'Reload the current active agreement.');
    const terms = parse(version.terms_json);
    const total = committedTotal(terms.lines);
    if (!isMoney(total) || total !== terms.committed_total || total > terms.spending_limit || termsDigest(terms) !== version.terms_digest) {
      throw fail(409, 'invalid_transition', 'The active agreement has inconsistent committed costs.');
    }
    return { header, version, terms };
  }
  function expected(ctx, body) {
    if (!body || body.expected_active_version_id !== ctx.header.active_version_id) throw fail(409, 'stale_version', 'The active agreement changed. Reload it before continuing.');
  }
  async function state(db, dealId) {
    const row = await first(db, 'SELECT * FROM deal_state WHERE deal_id=$1', [dealId]);
    return row ? {
      ...row, held: Number(row.held), released: Number(row.released), refunded: Number(row.refunded),
      done_at: nullableNumber(row.done_at), confirmed_at: nullableNumber(row.confirmed_at),
      funded_version_id: row.funded_version_id ?? null, done_version_id: row.done_version_id ?? null,
    } : { deal_id: dealId, status: 'locked', held: 0, released: 0, refunded: 0, done_at: null, confirmed_at: null, funded_version_id: null, done_version_id: null };
  }
  async function ensureState(db, dealId) {
    await db.query('INSERT INTO deal_state (deal_id,status,held,released,refunded,updated_at) VALUES ($1,$2,0,0,0,$3) ON CONFLICT(deal_id) DO NOTHING', [dealId, 'locked', now()]);
    return state(db, dealId);
  }
  async function updateState(db, dealId, fields) {
    const keys = Object.keys(fields);
    await db.query('UPDATE deal_state SET ' + keys.map((key, index) => key + '=$' + (index + 1)).join(',') + ',updated_at=$' + (keys.length + 1) + ' WHERE deal_id=$' + (keys.length + 2), [...keys.map((key) => fields[key]), now(), dealId]);
  }
  async function payment(db, ctx, kind, amount, note) {
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_MONEY) throw fail(409, 'invalid_transition', 'A simulated ledger amount is invalid.');
    await db.query('INSERT INTO payments (id,deal_id,version_id,kind,amount,note,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [newId('payment'), ctx.header.id, ctx.version.id, kind, amount, note, now()]);
  }
  function checkBalances(row) {
    if (![row.held, row.released, row.refunded].every(isMoney)) throw fail(409, 'invalid_transition', 'The simulated ledger balances are invalid.');
  }
  async function latestDispute(db, dealId) {
    return first(db, 'SELECT * FROM disputes WHERE deal_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1', [dealId]);
  }
  const unresolvedDispute = (dispute) => dispute && ['open', 'escalated'].includes(dispute.status);
  function disputeView(row) {
    if (!row) return null;
    return {
      id: row.id, version_id: row.version_id, reason: row.reason, reason_label: REASONS[row.reason] ?? row.reason,
      detail: row.detail ?? '', asked_amount: nullableNumber(row.asked_amount),
      recommendation: parse(row.recommendation_json), status: row.status,
      provider_response: row.provider_response ?? null, provider_note: row.provider_note ?? null,
      evidence: parse(row.evidence_json, []), created_at: Number(row.created_at), resolved_at: nullableNumber(row.resolved_at),
      simulation: true,
    };
  }
  function ratingView(row) {
    return row ? { stars: Number(row.stars), tags: parse(row.tags_json, []), comment: row.comment ?? '', created_at: Number(row.created_at), reply: row.reply ?? null, reply_at: nullableNumber(row.reply_at) } : null;
  }
  async function readView(db, ctx) {
    if (!ctx.version) return null;
    const row = await state(db, ctx.header.id);
    checkBalances(row);
    const [payments, dispute, rating] = await Promise.all([
      db.query('SELECT id,version_id,kind,amount,note,created_at FROM payments WHERE deal_id=$1 ORDER BY created_at,id', [ctx.header.id]),
      latestDispute(db, ctx.header.id),
      first(db, 'SELECT * FROM ratings WHERE deal_id=$1', [ctx.header.id]),
    ]);
    const terminal = ['released', 'resolved'].includes(row.status);
    const waiting = row.status === 'done' && row.done_version_id === ctx.version.id && !ctx.header.pending_version_id && !unresolvedDispute(dispute);
    return {
      status: row.status, status_label: STATUS_LABELS[row.status] ?? row.status,
      active_version_id: ctx.version.id,
      amount: { lines: ctx.terms.lines.filter((line) => line.kind === 'committed').map((line) => ({ label: line.label, quantity: line.quantity, unit: line.unit, unit_price: line.unit_price, price: line.quantity * line.unit_price })), total: ctx.terms.committed_total },
      due: terminal ? 0 : Math.max(0, ctx.terms.committed_total - row.held - row.released),
      held: row.held, released: row.released, refunded: row.refunded,
      funded_version_id: row.funded_version_id, done_version_id: row.done_version_id,
      done_at: row.done_at, confirmed_at: row.confirmed_at,
      auto_release_at: waiting && row.done_at != null ? row.done_at + autoReleaseHours * 3_600_000 : null,
      auto_release_hours: autoReleaseHours,
      payments: payments.rows.map((entry) => ({ ...entry, amount: Number(entry.amount), created_at: Number(entry.created_at) })),
      dispute: disputeView(dispute), rating: ratingView(rating), tags: REVIEW_TAGS, reasons: REASONS, simulation: true,
    };
  }
  // The optional actor is for trusted internal composition; HTTP callers must always supply their principal.
  async function view(dealId, actor) {
    return store.transaction(async (tx) => {
      if (store.kind === 'postgres') await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      return readView(tx, await context(tx, dealId, { actor, requireActive: false }));
    });
  }
  async function mutate(dealId, body, actor, role, work) {
    actorRole(actor, role);
    return store.transaction(async (tx) => {
      const ctx = await context(tx, dealId, { lock: true, actor, role });
      expected(ctx, body);
      const row = await ensureState(tx, dealId);
      checkBalances(row);
      await work(tx, ctx, row);
      return readView(tx, ctx);
    });
  }
  async function pay(dealId, body, actor) {
    return mutate(dealId, body, actor, 'consumer', async (tx, ctx, row) => {
      if (['released', 'resolved'].includes(row.status) && row.funded_version_id === ctx.version.id) return;
      if (!['locked', 'paid', 'done'].includes(row.status)) throw fail(409, 'not_payable', 'This agreement is not available for a simulated payment.');
      if (ctx.header.pending_version_id) throw fail(409, 'pending_version_exists', 'Resolve the proposed agreement change before paying.');
      if (unresolvedDispute(await latestDispute(tx, dealId))) throw fail(409, 'not_payable', 'Funds remain held while the dispute is unresolved.');
      const total = ctx.terms.committed_total;
      const difference = total - row.held;
      let refunded = row.refunded;
      if (difference > 0) {
        const prior = await first(tx, "SELECT id FROM payments WHERE deal_id=$1 AND kind IN ('hold','topup') LIMIT 1", [dealId]);
        await payment(tx, ctx, prior ? 'topup' : 'hold', difference, 'Simulated funds held for the active agreed work; no real money moves.');
      } else if (difference < 0) {
        refunded -= difference;
        if (!isMoney(refunded)) throw fail(409, 'invalid_transition', 'The cumulative simulated refund exceeds the supported range.');
        await payment(tx, ctx, 'refund', -difference, 'Simulated excess funding returned after an agreed lower total.');
      }
      const preserveDone = difference === 0 && row.status === 'done' && row.done_version_id === ctx.version.id;
      await updateState(tx, dealId, {
        status: preserveDone ? 'done' : 'paid', held: total, refunded,
        funded_version_id: ctx.version.id,
        done_at: preserveDone ? row.done_at : null, done_version_id: preserveDone ? row.done_version_id : null,
      });
    });
  }
  async function markDone(dealId, body, actor) {
    return mutate(dealId, body, actor, 'provider', async (tx, ctx, row) => {
      if (ctx.header.pending_version_id) throw fail(409, 'pending_version_exists', 'Resolve the proposed change before marking work complete.');
      if (unresolvedDispute(await latestDispute(tx, dealId))) throw fail(409, 'not_finished', 'Resolve the dispute before marking the work complete.');
      if (['done', 'released'].includes(row.status) && row.done_version_id === ctx.version.id) return;
      if (!['paid', 'done'].includes(row.status) || row.held < ctx.terms.committed_total) throw fail(409, 'not_payable', 'The active agreed work must be fully funded before completion.');
      await updateState(tx, dealId, { status: 'done', done_at: now(), done_version_id: ctx.version.id, confirmed_at: null });
    });
  }
  async function release(tx, ctx, row, note) {
    const total = ctx.terms.committed_total;
    if (row.held < total) throw fail(409, 'not_payable', 'The active agreement is not fully funded.');
    const extra = row.held - total;
    if (!isMoney(row.released + total) || !isMoney(row.refunded + extra)) throw fail(409, 'invalid_transition', 'The simulated settlement exceeds the supported range.');
    if (total > 0) await payment(tx, ctx, 'release', total, note);
    if (extra > 0) await payment(tx, ctx, 'refund', extra, 'Simulated excess funding returned against the final agreed total.');
    await updateState(tx, ctx.header.id, { status: 'released', held: 0, released: row.released + total, refunded: row.refunded + extra, confirmed_at: now() });
  }
  async function confirmDone(dealId, body, actor) {
    return mutate(dealId, body, actor, 'consumer', async (tx, ctx, row) => {
      if (row.status === 'released' && row.done_version_id === ctx.version.id) return;
      if (row.status !== 'done' || row.done_version_id !== ctx.version.id) throw fail(409, 'not_done', 'The provider must mark the current agreed work complete first.');
      if (ctx.header.pending_version_id || unresolvedDispute(await latestDispute(tx, dealId))) throw fail(409, 'not_finished', 'Resolve the proposed change or dispute before releasing funds.');
      await release(tx, ctx, row, 'Simulated funds released after the customer confirmed the active agreed work.');
    });
  }
  // Explicit settlement worker: read-only views never write a ledger entry.
  async function settleDue(dealId) {
    return store.transaction(async (tx) => {
      const ctx = await context(tx, dealId, { lock: true, requireActive: false });
      if (!ctx.version) return null;
      const row = await state(tx, dealId);
      checkBalances(row);
      if (row.status === 'done' && row.done_version_id === ctx.version.id && row.done_at != null &&
          now() >= row.done_at + autoReleaseHours * 3_600_000 && !ctx.header.pending_version_id &&
          !unresolvedDispute(await latestDispute(tx, dealId))) {
        await release(tx, ctx, row, 'Simulated funds released after the stated confirmation period with no unresolved dispute or change.');
      }
      return readView(tx, ctx);
    });
  }

  function textField(value, maximum, required = false) {
    if (value != null && typeof value !== 'string') throw fail(400, 'invalid_payload', 'Text fields must contain text.');
    const text = String(value ?? '').trim();
    if ((required && !text) || text.length > maximum) throw fail(400, 'invalid_payload', 'Provide text within the allowed length.');
    return text;
  }
  function recommendation(reason, row) {
    if (reason === 'no_show') return { action: 'refund', refund: row.held, text: 'Simulation proposal: return held funds if both parties agree the provider did not attend.' };
    if (reason === 'unresolved_work') return { action: 'rework', refund: 0, text: 'Simulation proposal: agree on rework without an additional charge; funds remain held until completion is confirmed.' };
    return { action: 'keep_deal', refund: 0, text: 'Simulation proposal: keep the active agreement; a charge outside it is not approved by this dispute.' };
  }
  async function openDispute(dealId, body, actor) {
    return mutate(dealId, body, actor, 'consumer', async (tx, ctx, row) => {
      const reason = ALIASES[body.reason] ?? body.reason;
      if (!Object.hasOwn(REASONS, reason)) throw fail(400, 'bad_reason', 'Choose a supported dispute reason.');
      const detail = textField(body.detail, 1000);
      const askedAmount = body.asked_amount ?? null;
      if (askedAmount !== null && !isMoney(askedAmount)) throw fail(400, 'invalid_payload', 'The requested charge must be an integer Rupiah amount.');
      const existing = await latestDispute(tx, dealId);
      if (unresolvedDispute(existing)) {
        if (existing.version_id !== ctx.version.id) throw fail(409, 'stale_version', 'The unresolved dispute concerns an earlier agreement version.');
        if (existing.reason === reason && (existing.detail ?? '') === detail && nullableNumber(existing.asked_amount) === askedAmount) return;
        throw fail(409, 'no_open_dispute', 'An unresolved dispute already exists for this agreement.');
      }
      if (!['paid', 'done'].includes(row.status)) throw fail(409, 'not_disputable', 'Only funded work awaiting final settlement can be disputed.');
      if (ctx.header.pending_version_id) throw fail(409, 'pending_version_exists', 'Resolve the proposed agreement change before opening a dispute.');
      await tx.query('INSERT INTO disputes (id,deal_id,version_id,reason,detail,asked_amount,recommendation_json,status,prev_status,evidence_json,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [newId('dispute'), dealId, ctx.version.id, reason, detail, askedAmount, JSON.stringify(recommendation(reason, row)), 'open', row.status, '[]', Math.max(now(), Number(existing?.created_at ?? 0) + 1)]);
      await updateState(tx, dealId, { status: 'disputed' });
    });
  }
  async function respondDispute(dealId, body, actor) {
    return mutate(dealId, body, actor, 'provider', async (tx, ctx, row) => {
      if (typeof body.accept !== 'boolean' || typeof body.dispute_id !== 'string') throw fail(400, 'invalid_payload', 'Choose a response to a specific dispute.');
      const note = textField(body.note, 500);
      const dispute = await first(tx, 'SELECT * FROM disputes WHERE id=$1 AND deal_id=$2', [body.dispute_id, dealId]);
      if (!dispute) throw fail(404, 'not_found', 'The dispute was not found.');
      if (dispute.version_id !== ctx.version.id) throw fail(409, 'stale_version', 'This dispute concerns an earlier agreement version.');
      const response = body.accept ? 'accept' : 'reject';
      if (dispute.provider_response != null) {
        if (dispute.provider_response === response && (dispute.provider_note ?? '') === note) return;
        throw fail(409, 'invalid_transition', 'This dispute already has a different provider response.');
      }
      if (dispute.status !== 'open' || row.status !== 'disputed') throw fail(409, 'no_open_dispute', 'There is no open dispute awaiting a provider response.');
      if (!body.accept) {
        await tx.query('UPDATE disputes SET status=$1,provider_response=$2,provider_note=$3 WHERE id=$4', ['escalated', response, note, dispute.id]);
        await updateState(tx, dealId, { status: 'escalated' });
        return;
      }
      const proposal = parse(dispute.recommendation_json);
      let disputeStatus = 'resolved';
      if (proposal.action === 'refund') {
        if (!isMoney(row.refunded + row.held)) throw fail(409, 'invalid_transition', 'The simulated refund exceeds the supported range.');
        if (row.held > 0) await payment(tx, ctx, 'refund', row.held, 'Simulated full refund after both parties accepted the dispute outcome.');
        await updateState(tx, dealId, { status: 'resolved', refunded: row.refunded + row.held, held: 0, confirmed_at: now() });
      } else if (proposal.action === 'rework') {
        disputeStatus = 'rework';
        await updateState(tx, dealId, { status: 'paid', done_at: null, done_version_id: null, confirmed_at: null });
      } else if (proposal.action === 'keep_deal') {
        const previous = dispute.prev_status === 'done' && row.done_version_id === ctx.version.id ? 'done' : 'paid';
        await updateState(tx, dealId, { status: previous, ...(previous === 'done' ? { done_at: now() } : {}) });
      } else throw fail(409, 'invalid_transition', 'The dispute recommendation needs manual clarification.');
      await tx.query('UPDATE disputes SET status=$1,provider_response=$2,provider_note=$3,resolved_at=$4 WHERE id=$5', [disputeStatus, response, note, now(), dispute.id]);
    });
  }
  async function addEvidence(dealId, body, actor) {
    return mutate(dealId, body, actor, undefined, async (tx, ctx) => {
      if (typeof body.dispute_id !== 'string') throw fail(400, 'invalid_payload', 'Choose the dispute this evidence belongs to.');
      const text = textField(body.text, 500, true);
      const dispute = await first(tx, 'SELECT * FROM disputes WHERE id=$1 AND deal_id=$2', [body.dispute_id, dealId]);
      if (!dispute) throw fail(404, 'not_found', 'The dispute was not found.');
      if (dispute.version_id !== ctx.version.id) throw fail(409, 'stale_version', 'This evidence concerns an earlier agreement version.');
      if (!['open', 'escalated'].includes(dispute.status)) throw fail(409, 'no_open_dispute', 'Evidence can be added only to an unresolved dispute.');
      const evidence = parse(dispute.evidence_json, []);
      if (evidence.some((entry) => entry.by === actor.role && entry.text === text)) return;
      if (evidence.length >= 20) throw fail(409, 'too_many', 'This dispute already has twenty evidence notes.');
      evidence.push({ by: actor.role, text, at: now() });
      await tx.query('UPDATE disputes SET evidence_json=$1 WHERE id=$2', [JSON.stringify(evidence), dispute.id]);
    });
  }
  async function rate(dealId, body, actor) {
    return mutate(dealId, body, actor, 'consumer', async (tx, ctx, row) => {
      if (!['released', 'resolved'].includes(row.status)) throw fail(409, 'not_finished', 'Review the provider after the agreement has been settled.');
      if (!Number.isInteger(body.stars) || body.stars < 1 || body.stars > 5) throw fail(400, 'bad_stars', 'Choose a rating from one to five stars.');
      if (!Array.isArray(body.tags ?? []) || (body.tags ?? []).some((tag) => !REVIEW_TAGS.includes(tag))) throw fail(400, 'invalid_payload', 'Choose review tags from the supported list.');
      const tags = [...new Set(body.tags ?? [])].sort();
      const comment = textField(body.comment, 280);
      const existing = await first(tx, 'SELECT * FROM ratings WHERE deal_id=$1', [dealId]);
      if (existing) {
        if (Number(existing.stars) === body.stars && existing.comment === comment && JSON.stringify(parse(existing.tags_json, [])) === JSON.stringify(tags)) return;
        throw fail(409, 'already_rated', 'This agreement already has a review.');
      }
      await tx.query('INSERT INTO ratings (deal_id,user_id,provider_id,stars,tags_json,comment,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [dealId, actor.actor_id, ctx.header.provider_id, body.stars, JSON.stringify(tags), comment, now()]);
    });
  }
  async function replyReview(dealId, body, actor) {
    return mutate(dealId, body, actor, 'provider', async (tx, ctx) => {
      const text = textField(body.text, 280, true);
      const existing = await first(tx, 'SELECT * FROM ratings WHERE deal_id=$1', [dealId]);
      if (!existing || existing.provider_id !== ctx.header.provider_id) throw fail(404, 'not_found', 'The review was not found.');
      if (existing.reply != null) {
        if (existing.reply === text) return;
        throw fail(409, 'already_replied', 'This review already has a provider reply.');
      }
      await tx.query('UPDATE ratings SET reply=$1,reply_at=$2 WHERE deal_id=$3', [text, now(), dealId]);
    });
  }
  async function reviewsFor(providerId, actor) {
    actorRole(actor, 'provider');
    const branch = actor.branch_id ? await first(store, 'SELECT provider_id FROM branches WHERE id=$1', [actor.branch_id]) : null;
    if ((actor.provider_id ?? branch?.provider_id) !== providerId) throw fail(403, 'wrong_role', 'These reviews are not available for this provider.');
    const rows = (await store.query('SELECT * FROM ratings WHERE provider_id=$1 ORDER BY created_at DESC,deal_id', [providerId])).rows;
    return {
      summary: { n: rows.length, avg: rows.length ? rows.reduce((sum, row) => sum + Number(row.stars), 0) / rows.length : null },
      reviews: rows.map((row) => ({ deal_id: row.deal_id, ...ratingView(row) })),
    };
  }

  return { view, pay, markDone, confirmDone, settleDue, openDispute, respondDispute, addEvidence, rate, replyReview, reviewsFor };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { openStore } from '../server/store.mjs';
import { createLifecycle } from '../server/lifecycle.mjs';
import { createAgreements } from '../server/agreements.mjs';
import { termsDigest } from '../server/agreement-terms.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/deal-locked.json', import.meta.url), 'utf8'));
const consumer = { role: 'consumer', actor_id: 'consumer_demo01' };
const provider = { role: 'provider', actor_id: 'provider_demo01', branch_id: 'branch_human01', provider_id: 'provider_demo01' };
const dealId = 'deal_demo01';
const version1 = 'version_demo01';
const body = (version = version1, extra = {}) => ({ expected_active_version_id: version, ...extra });

async function setup(t, { free = false } = {}) {
  const store = await openStore({ sqliteFile: ':memory:', databaseUrl: '', production: false });
  t.after(() => store.close());
  let clock = 1_800_000_000_000;
  let sequence = 0;
  const now = () => clock;
  const newId = (prefix) => prefix + '_test' + String(++sequence).padStart(8, '0');
  const terms = structuredClone(fixture.versions[0].terms);
  if (free) { terms.lines.filter((line) => line.kind === 'committed').forEach((line) => { line.unit_price = 0; }); terms.committed_total = 0; }
  await store.query('INSERT INTO requests (id,user_id,status) VALUES ($1,$2,$3)', ['request_demo01', consumer.actor_id, 'locked']);
  await store.query('INSERT INTO branches (id,request_id,provider_id,mode,status) VALUES ($1,$2,$3,$4,$5)', [provider.branch_id, 'request_demo01', provider.provider_id, 'human', 'ready']);
  await store.query('INSERT INTO deals (id,request_id,branch_id,provider_label,active_version_id) VALUES ($1,$2,$3,$4,$5)', [dealId, 'request_demo01', provider.branch_id, 'Dingin Jaya Teknik', version1]);
  await store.query('INSERT INTO agreement_versions (id,deal_id,number,status,terms_json,terms_digest,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [version1, dealId, 1, 'active', JSON.stringify(terms), termsDigest(terms), clock]);
  const lifecycle = createLifecycle({ store, now, newId });
  async function v2({ total = 260000, pending = false } = {}) {
    const revised = structuredClone(terms);
    if (total >= 110000) {
      revised.lines.find((line) => line.item_code === 'ganti_kapasitor').kind = 'committed';
      revised.lines.find((line) => line.item_code === 'ganti_kapasitor').unit_price = total - 110000;
    } else {
      revised.lines.find((line) => line.item_code === 'cuci_ac').unit_price = total - 20000;
    }
    revised.committed_total = total; revised.spending_limit = Math.max(250000, total);
    revised.change_reason = 'Both parties agreed to revised work.';
    await store.transaction(async (tx) => {
      await tx.query('INSERT INTO agreement_versions (id,deal_id,number,parent_version_id,status,terms_json,terms_digest,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', ['version_demo02', dealId, 2, version1, 'pending', JSON.stringify(revised), termsDigest(revised), clock]);
      if (pending) await tx.query('UPDATE deals SET pending_version_id=$1 WHERE id=$2', ['version_demo02', dealId]);
      else {
        await tx.query('UPDATE agreement_versions SET status=$1 WHERE id=$2', ['superseded', version1]);
        await tx.query('UPDATE agreement_versions SET status=$1 WHERE id=$2', ['active', 'version_demo02']);
        await tx.query('UPDATE deals SET active_version_id=$1,pending_version_id=NULL WHERE id=$2', ['version_demo02', dealId]);
      }
    });
    return revised;
  }
  return { store, lifecycle, terms, v2, advance: (ms) => { clock += ms; }, now };
}

test('lifecycle reads do not create payment/state rows and enforce ownership', async (t) => {
  const { store, lifecycle } = await setup(t);
  const value = await lifecycle.view(dealId, consumer);
  assert.equal(value.status, 'locked');
  assert.equal(value.due, 110000);
  assert.equal(value.amount.total, 110000);
  assert.equal(value.simulation, true);
  assert.equal((await store.query('SELECT COUNT(*) AS n FROM deal_state')).rows[0].n, 0);
  assert.equal((await store.query('SELECT COUNT(*) AS n FROM payments')).rows[0].n, 0);
  await assert.rejects(lifecycle.view(dealId, { ...consumer, actor_id: 'consumer_other01' }), (e) => e.status === 404);
  await assert.rejects(lifecycle.view(dealId, { ...provider, branch_id: 'branch_other01' }), (e) => e.status === 403);
  assert.equal(JSON.stringify(await lifecycle.view(dealId, provider)).includes('spending_limit'), false);
});

test('archived requests reject direct lifecycle reads, payment and completion without ledger changes',async t=>{
  const {store,lifecycle}=await setup(t);
  await store.query('UPDATE requests SET archived_at=$1,generation=generation+1 WHERE id=$2',[1,'request_demo01']);
  for(const operation of [()=>lifecycle.view(dealId,consumer),()=>lifecycle.view(dealId,provider),()=>lifecycle.pay(dealId,body(),consumer),()=>lifecycle.markDone(dealId,body(),provider),()=>lifecycle.confirmDone(dealId,body(),consumer),()=>lifecycle.settleDue(dealId)])await assert.rejects(operation(),error=>error.status===404);
  assert.equal((await store.query('SELECT COUNT(*) AS n FROM payments')).rows[0].n,0);
  assert.equal((await store.query('SELECT COUNT(*) AS n FROM deal_state')).rows[0].n,0);
});

test('concurrent simulated pay/complete/confirm retries never duplicate ledger movements', async (t) => {
  const { lifecycle } = await setup(t);
  const [paid] = await Promise.all([lifecycle.pay(dealId, body(), consumer), lifecycle.pay(dealId, body(), consumer)]);
  assert.equal(paid.held, 110000);
  assert.equal(paid.payments.length, 1);
  assert.equal(paid.payments[0].kind, 'hold');
  await Promise.all([lifecycle.markDone(dealId, body(), provider), lifecycle.markDone(dealId, body(), provider)]);
  const [released] = await Promise.all([lifecycle.confirmDone(dealId, body(), consumer), lifecycle.confirmDone(dealId, body(), consumer)]);
  assert.equal(released.released, 110000);
  assert.equal(released.held, 0);
  assert.equal(released.payments.filter((p) => p.kind === 'release').length, 1);
  const replay = await lifecycle.pay(dealId, body(), consumer);
  assert.equal(replay.payments.length, 2);
  assert.equal(replay.status, 'released');
});

test('wrong role, unpaid completion, premature release and stale versions are rejected', async (t) => {
  const { lifecycle } = await setup(t);
  await assert.rejects(lifecycle.pay(dealId, body(), provider), (e) => e.status === 403);
  await assert.rejects(lifecycle.markDone(dealId, body(), consumer), (e) => e.status === 403);
  await assert.rejects(lifecycle.markDone(dealId, body(), provider), (e) => e.status === 409);
  await assert.rejects(lifecycle.confirmDone(dealId, body(), consumer), (e) => e.code === 'not_done');
  await assert.rejects(lifecycle.pay(dealId, body('version_stale01'), consumer), (e) => e.code === 'stale_version');
});

test('accepted v2 does not count as paid: a source-bound topup funds its additional work', async (t) => {
  const { lifecycle, v2 } = await setup(t);
  await lifecycle.pay(dealId, body(), consumer);
  await v2();
  const changed = await lifecycle.view(dealId, consumer);
  assert.equal(changed.held, 110000); assert.equal(changed.due, 150000);
  await assert.rejects(lifecycle.markDone(dealId, body('version_demo02'), provider), (e) => e.code === 'not_payable');
  await assert.rejects(lifecycle.pay(dealId, body(), consumer), (e) => e.code === 'stale_version');
  await Promise.all([lifecycle.pay(dealId, body('version_demo02'), consumer), lifecycle.pay(dealId, body('version_demo02'), consumer)]);
  const paid = await lifecycle.view(dealId, consumer);
  assert.equal(paid.held, 260000); assert.equal(paid.due, 0);
  assert.deepEqual(paid.payments.map((p) => [p.kind, p.amount, p.version_id]), [['hold',110000,version1],['topup',150000,'version_demo02']]);
  await lifecycle.markDone(dealId, body('version_demo02'), provider);
  const settled = await lifecycle.confirmDone(dealId, body('version_demo02'), consumer);
  assert.equal(settled.released, 260000);
});

test('an unresolved agreement proposal blocks payment, completion and release', async (t) => {
  const { lifecycle, v2 } = await setup(t);
  await lifecycle.pay(dealId, body(), consumer);
  await lifecycle.markDone(dealId, body(), provider);
  await v2({ pending: true });
  await assert.rejects(lifecycle.pay(dealId, body(), consumer), (e) => e.code === 'pending_version_exists');
  await assert.rejects(lifecycle.markDone(dealId, body(), provider), (e) => e.code === 'pending_version_exists');
  await assert.rejects(lifecycle.confirmDone(dealId, body(), consumer), (e) => e.code === 'not_finished');
});

test('reads never auto-release money; explicit settlement runs once at the deadline', async (t) => {
  const { lifecycle, advance } = await setup(t);
  await lifecycle.pay(dealId, body(), consumer);
  const done = await lifecycle.markDone(dealId, body(), provider);
  assert.equal(done.auto_release_at, done.done_at + 72 * 3600000);
  advance(72 * 3600000 - 1);
  assert.equal((await lifecycle.settleDue(dealId)).status, 'done');
  advance(1);
  assert.equal((await lifecycle.view(dealId, consumer)).status, 'done');
  const released = await lifecycle.settleDue(dealId);
  assert.equal(released.status, 'released'); assert.equal(released.released, 110000);
  assert.equal((await lifecycle.settleDue(dealId)).payments.filter((p) => p.kind === 'release').length, 1);
});

test('a newer active version cannot inherit completion or auto-release eligibility', async (t) => {
  const { lifecycle, v2, advance } = await setup(t);
  await lifecycle.pay(dealId, body(), consumer);
  await lifecycle.markDone(dealId, body(), provider);
  await v2();
  advance(80 * 3600000);
  assert.equal((await lifecycle.settleDue(dealId)).released, 0);
  await assert.rejects(lifecycle.confirmDone(dealId, body('version_demo02'), consumer), (e) => e.code === 'not_done');
  await lifecycle.pay(dealId, body('version_demo02'), consumer);
  assert.equal((await lifecycle.view(dealId, consumer)).done_at, null);
});

test('agreed lower totals refund excess funding and free work needs no fabricated ledger amount', async (t) => {
  const { lifecycle, v2 } = await setup(t);
  await lifecycle.pay(dealId, body(), consumer);
  await v2({ total: 90000 });
  const paid = await lifecycle.pay(dealId, body('version_demo02'), consumer);
  assert.equal(paid.held, 90000); assert.equal(paid.refunded, 20000);
  await lifecycle.markDone(dealId, body('version_demo02'), provider);
  const settled = await lifecycle.confirmDone(dealId, body('version_demo02'), consumer);
  assert.equal(settled.released, 90000); assert.equal(settled.refunded, 20000);
  const free = await setup(t, { free: true });
  await free.lifecycle.pay(dealId, body(), consumer);
  await free.lifecycle.markDone(dealId, body(), provider);
  const zero = await free.lifecycle.confirmDone(dealId, body(), consumer);
  assert.equal(zero.status, 'released'); assert.equal(zero.payments.length, 0);
});

test('accepted no-show dispute refunds held funds once and stops automatic release', async (t) => {
  const { lifecycle, advance } = await setup(t);
  await lifecycle.pay(dealId, body(), consumer);
  await lifecycle.markDone(dealId, body(), provider);
  const disputed = await lifecycle.openDispute(dealId, body(version1, { reason: 'no_show', detail: 'No provider attended.' }), consumer);
  assert.equal(disputed.dispute.version_id, version1);
  assert.equal(disputed.dispute.recommendation.refund, 110000);
  advance(100 * 3600000);
  assert.equal((await lifecycle.settleDue(dealId)).status, 'disputed');
  const response = body(version1, { dispute_id: disputed.dispute.id, accept: true, note: 'Confirmed.' });
  await lifecycle.respondDispute(dealId, response, provider);
  const replay = await lifecycle.respondDispute(dealId, response, provider);
  assert.equal(replay.status, 'resolved'); assert.equal(replay.refunded, 110000); assert.equal(replay.held, 0);
  assert.equal(replay.payments.filter((p) => p.kind === 'refund').length, 1);
});

test('rework requires renewed completion, whereas rejected disputes stay escalated with held funds', async (t) => {
  const one = await setup(t);
  await one.lifecycle.pay(dealId, body(), consumer);
  await one.lifecycle.markDone(dealId, body(), provider);
  const disputed = await one.lifecycle.openDispute(dealId, body(version1, { reason: 'unresolved_work' }), consumer);
  const accepted = await one.lifecycle.respondDispute(dealId, body(version1, { dispute_id: disputed.dispute.id, accept: true }), provider);
  assert.equal(accepted.status, 'paid'); assert.equal(accepted.done_at, null); assert.equal(accepted.refunded, 0);
  await assert.rejects(one.lifecycle.confirmDone(dealId, body(), consumer), (e) => e.code === 'not_done');
  await one.lifecycle.markDone(dealId, body(), provider);
  assert.equal((await one.lifecycle.confirmDone(dealId, body(), consumer)).released, 110000);

  const two = await setup(t);
  await two.lifecycle.pay(dealId, body(), consumer);
  const opened = await two.lifecycle.openDispute(dealId, body(version1, { reason: 'unapproved_charge', asked_amount: 50000 }), consumer);
  const escalated = await two.lifecycle.respondDispute(dealId, body(version1, { dispute_id: opened.dispute.id, accept: false, note: 'I disagree.' }), provider);
  assert.equal(escalated.status, 'escalated'); assert.equal(escalated.held, 110000);
  two.advance(100 * 3600000);
  assert.equal((await two.lifecycle.settleDue(dealId)).released, 0);
  await assert.rejects(two.lifecycle.pay(dealId, body(), consumer), (e) => e.code === 'not_payable');
});

test('evidence limits and review/reply ownership, completion and replay rules are enforced', async (t) => {
  const { lifecycle } = await setup(t);
  await assert.rejects(lifecycle.rate(dealId, body(version1, { stars: 5 }), consumer), (e) => e.code === 'not_finished');
  await lifecycle.pay(dealId, body(), consumer);
  const opened = await lifecycle.openDispute(dealId, body(version1, { reason: 'no_show' }), consumer);
  const dispute_id = opened.dispute.id;
  await assert.rejects(lifecycle.addEvidence(dealId, body(version1, { dispute_id, text: 'x'.repeat(501) }), consumer), (e) => e.status === 400);
  await lifecycle.addEvidence(dealId, body(version1, { dispute_id, text: 'Customer record.' }), consumer);
  await lifecycle.addEvidence(dealId, body(version1, { dispute_id, text: 'Provider record.' }), provider);
  const repeated = await lifecycle.addEvidence(dealId, body(version1, { dispute_id, text: 'Customer record.' }), consumer);
  assert.equal(repeated.dispute.evidence.length, 2);
  for (let i = 2; i < 20; i++) await lifecycle.addEvidence(dealId, body(version1, { dispute_id, text: 'Note ' + i }), consumer);
  await assert.rejects(lifecycle.addEvidence(dealId, body(version1, { dispute_id, text: 'One note too many' }), provider), (e) => e.code === 'too_many');
  await lifecycle.respondDispute(dealId, body(version1, { dispute_id, accept: true }), provider);
  const review = body(version1, { stars: 2, tags: ['Late arrival'], comment: 'The visit did not happen.' });
  await lifecycle.rate(dealId, review, consumer); await lifecycle.rate(dealId, review, consumer);
  await assert.rejects(lifecycle.rate(dealId, { ...review, stars: 5 }, consumer), (e) => e.code === 'already_rated');
  await assert.rejects(lifecycle.replyReview(dealId, body(version1, { text: 'Reply' }), consumer), (e) => e.status === 403);
  await lifecycle.replyReview(dealId, body(version1, { text: 'We acknowledge the issue.' }), provider);
  await lifecycle.replyReview(dealId, body(version1, { text: 'We acknowledge the issue.' }), provider);
  await assert.rejects(lifecycle.replyReview(dealId, body(version1, { text: 'Changed reply' }), provider), (e) => e.code === 'already_replied');
  const reviews = await lifecycle.reviewsFor(provider.provider_id, provider);
  assert.equal(reviews.summary.n, 1); assert.equal(reviews.summary.avg, 2);
  await assert.rejects(lifecycle.reviewsFor('provider_other01', provider), (e) => e.status === 403);
});

test('a dispute response cannot refund against a later agreement version', async (t) => {
  const { lifecycle, v2 } = await setup(t);
  await lifecycle.pay(dealId, body(), consumer);
  const opened = await lifecycle.openDispute(dealId, body(version1, { reason: 'no_show' }), consumer);
  await v2();
  await assert.rejects(lifecycle.respondDispute(dealId, body('version_demo02', { dispute_id: opened.dispute.id, accept: true }), provider), (e) => e.code === 'stale_version');
  await assert.rejects(lifecycle.addEvidence(dealId, body('version_demo02', { dispute_id: opened.dispute.id, text: 'Evidence for the earlier work.' }), consumer), (e) => e.code === 'stale_version');
  assert.equal((await lifecycle.view(dealId, consumer)).refunded, 0);
});

test('settled and disputed lifecycle states reject agreement changes without adding versions', async (t) => {
  const readFixture = async (name) => JSON.parse(await readFile(new URL('./fixtures/' + name + '.json', import.meta.url), 'utf8'));
  for (const status of ['released', 'resolved', 'disputed', 'escalated']) {
    await t.test(status, async (t) => {
      const { store, lifecycle, now } = await setup(t);
      const [job, quote, message] = await Promise.all(['job', 'quote', 'message'].map(readFixture));
      await store.query('INSERT INTO quotes (id,branch_id,request_id,version,data_json,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [quote.id, quote.branch_id, job.id, quote.revision, JSON.stringify(quote), quote.status, now()]);
      const agreements = createAgreements({ store, now, loadQuote: async () => quote, loadJob: async () => job, loadSourceMessage: async () => message });
      await lifecycle.pay(dealId, body(), consumer);
      if (status === 'released') {
        await lifecycle.markDone(dealId, body(), provider);
        await lifecycle.confirmDone(dealId, body(), consumer);
      } else {
        const opened = await lifecycle.openDispute(dealId, body(version1, { reason: 'no_show' }), consumer);
        if (status !== 'disputed') await lifecycle.respondDispute(dealId, body(version1, { dispute_id: opened.dispute.id, accept: status === 'resolved' }), provider);
      }
      assert.equal((await lifecycle.view(dealId, consumer)).status, status);
      await assert.rejects(agreements.proposeChange(dealId, body(version1, { change_message_id: message.id, committed_line_ids: ['line_extra01'], spending_limit: 260000 }), consumer), (error) => error.status === 409);
      assert.equal((await store.query('SELECT COUNT(*) AS n FROM agreement_versions')).rows[0].n, 1);
      assert.equal((await store.query('SELECT pending_version_id FROM deals WHERE id=$1', [dealId])).rows[0].pending_version_id, null);
    });
  }
});

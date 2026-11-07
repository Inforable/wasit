import test from 'node:test';
import assert from 'node:assert/strict';
import { createContractValidator, readFixture } from '../scripts/contracts.mjs';
import { publicTerms, termsDigest, committedTotal } from '../server/agreement-terms.mjs';

const validate = await createContractValidator();
for (const { file, schema } of await readFixture('manifest.json')) {
  test('contract fixture: ' + file, async () => { validate(schema, await readFixture(file)); });
}
test('contracts reject missing budgets, invented actions and unknown prices set to zero', async () => {
  const job = await readFixture('job.json'); delete job.max_budget;
  assert.throws(() => validate('job.schema.json', job), /max_budget/);
  const decision = await readFixture('buyer-decision.json'); decision.action = 'invent_price';
  assert.throws(() => validate('agent-buyer.schema.json', decision), /action/);
  const quote = await readFixture('quote-needs-detail.json'); quote.lines[1].unit_price = 0;
  assert.throws(() => validate('quote.schema.json', quote), /unit_price/);
});
test('quoted totals exclude optional work and ranked prices are actual quoted amounts', async () => {
  const quote = await readFixture('quote.json');
  const ranked = await readFixture('request-ranked.json');
  assert.equal(quote.fixed_total, quote.lines.filter((line) => line.kind === 'fixed').reduce((sum, line) => sum + line.unit_price * line.quantity, 0));
  assert.equal(ranked.cards[0].quoted_total, quote.fixed_total);
  const job = ranked.job, card = ranked.cards[0];
  assert.equal(card.score, Object.keys(job.weights).reduce((sum, key) => sum + card.parts[key] * job.weights[key], 0) / 100);
});
test('public digests match while consumer spending limits remain private', async () => {
  const deal = await readFixture('deal-locked.json'), version = deal.versions[0];
  assert.equal(version.terms_digest, termsDigest(version.terms));
  assert.equal(committedTotal(version.terms.lines), 110000);
  assert.equal(termsDigest({ ...version.terms, spending_limit: 999999 }), version.terms_digest);
  const changed = structuredClone(version.terms); changed.lines[0].unit_price += 1000;
  assert.notEqual(termsDigest(changed), version.terms_digest);
  assert.equal(publicTerms(version.terms).spending_limit, undefined);
});
test('v2 examples preserve previous terms and acceptances and require an explicit higher limit', async () => {
  const initial = await readFixture('deal-locked.json');
  const pending = await readFixture('deal-v2-pending.json');
  const active = await readFixture('deal-v2-active.json');
  assert.equal(pending.active_version_id, initial.active_version_id);
  assert.equal(pending.pending_version_id, 'version_demo02');
  assert.deepEqual(initial.versions[0].terms, active.versions[0].terms);
  assert.deepEqual(initial.versions[0].acceptances, active.versions[0].acceptances);
  const v2 = active.versions[1];
  assert.equal(committedTotal(v2.terms.lines), 260000);
  assert.equal(v2.terms.spending_limit, 260000);
  assert.equal(v2.terms_digest, termsDigest(v2.terms));
  assert.equal(v2.acceptances.find((a) => a.role === 'consumer').budget_ack_limit, 260000);
});
test('provider fixture contains no consumer limit, actor or internal trace at any depth', async () => {
  const provider = await readFixture('provider-snapshot.json');
  const forbidden = new Set(['spending_limit','max_budget','target_price','budget_ack_limit','actor_id','events','token','csrf_token']);
  function check(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) { assert.ok(!forbidden.has(key), key); check(child); }
  }
  check(provider);
  const deal = await readFixture('deal-locked.json');
  assert.deepEqual(provider.versions[0].public_terms, publicTerms(deal.versions[0].terms));
});

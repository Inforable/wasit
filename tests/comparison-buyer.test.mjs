import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compareQuotes, quoteEligibility } from '../server/comparison.mjs';
import { allowedBuyerActions, decideBuyer } from '../server/buyer-policy.mjs';

const fixture = async (name) => JSON.parse(await readFile(new URL('./fixtures/' + name, import.meta.url), 'utf8'));
const job = await fixture('job.json');
const original = await fixture('quote.json');
const copy = (value) => structuredClone(value);
function quote({ id = 'quote_second01', branch = 'branch_second01', base = 85000, transport = 20000, status = 'ready' } = {}) {
  const value = copy(original);
  value.id = id; value.branch_id = branch; value.status = status;
  value.lines[0].unit_price = base; value.lines[1].unit_price = transport;
  value.fixed_total = base + transport;
  return value;
}
const context = (own = original, extra = {}) => ({ job: copy(job), quote: copy(own), branch: { clarifications_sent: 0, countered: false, asked_terms: false }, competitorQuotes: [quote()], ...extra });

test('equivalent complete quotes rank by explicit fixed total and optional costs stay excluded', () => {
  const cheap = quote();
  cheap.lines[3].unit_price = 9999999;
  const result = compareQuotes({ job, quotes: [original, cheap], providers: { [original.branch_id]: { rating: 4 }, [cheap.branch_id]: { rating: 4 } } });
  assert.equal(result.comparison.groups.length, 1);
  assert.equal(result.cards.length, 2);
  assert.equal(result.cards[0].quote_id, cheap.id);
  assert.equal(result.cards[0].quoted_total, 105000);
  assert.equal(result.cards[0].parts.price, 58);
  assert.equal(result.cards[0].parts.trust, 80);
  assert.equal(result.cards[0].parts.slot, 50);
});

test('missing costs, scope differences, quantities, unsupported units, foreign requests and bad arithmetic cannot rank', () => {
  const mutations = [
    (q) => { q.status = 'needs_detail'; q.fixed_total = null; q.unresolved = ['transport']; q.lines[1].kind = 'unknown'; q.lines[1].unit_price = null; },
    (q) => { q.scope = 'different_scope'; },
    (q) => { q.units = 2; },
    (q) => { q.lines[0].unit = 'pcs'; },
    (q) => { q.request_id = 'request_someone_else'; },
    (q) => { q.location_label = 'Tebet'; },
    (q) => { q.fixed_total = 1; },
    (q) => { q.lines.push(copy(q.lines[0])); },
    (q) => { q.lines[2].unit_price = 10000; },
    (q) => { q.lines[0].source = null; },
    (q) => { q.lines = q.lines.filter((line) => line.item_code !== 'cek_freon'); },
  ];
  for (const mutate of mutations) {
    const value = quote(); mutate(value);
    const result = compareQuotes({ job, quotes: [value] });
    assert.equal(result.cards.length, 0, JSON.stringify(value));
    assert.equal(result.comparison.excluded.length, 1);
  }
});

test('only confirmed canonical labels or explicit in-window ISO slots establish schedule equivalence', () => {
  const other = quote(); other.schedule_label = 'Tomorrow morning';
  assert.equal(compareQuotes({ job, quotes: [other] }).cards.length, 0);
  other.slot = '2026-11-07T02:00:00.000Z';
  const inWindow = compareQuotes({ job, quotes: [other] });
  assert.equal(inWindow.cards.length, 1);
  assert.equal(inWindow.cards[0].parts.slot, 75);
  other.slot = '2026-11-07T07:00:00.000Z';
  assert.equal(compareQuotes({ job, quotes: [other] }).cards.length, 0);
});

test('stale quote revisions never rank or supply a cheaper competitor citation', () => {
  const stale = quote({ id: 'quote_stale01', base: 60000 });
  const latest = quote({ id: 'quote_latest01', base: 120000 });
  latest.revision = 2;
  const result = compareQuotes({ job, quotes: [stale, latest, original] });
  assert.equal(result.cards.some((card) => card.quote_id === stale.id), false);
  assert.ok(result.comparison.excluded.find((entry) => entry.quote_id === stale.id));
  assert.equal(allowedBuyerActions(context(original, { competitorQuotes: [stale, latest] })).available_cites.competitor_best, undefined);
});

test('unknown trust remains neutral and ties are deterministic regardless of input order', () => {
  const a = quote({ id: 'quote_alpha01', branch: 'branch_alpha01', base: 90000 });
  const b = quote({ id: 'quote_bravo01', branch: 'branch_bravo01', base: 90000 });
  const first = compareQuotes({ job, quotes: [b, a] });
  const second = compareQuotes({ job, quotes: [a, b] });
  assert.deepEqual(first, second);
  assert.equal(first.cards[0].quote_id, a.id);
  assert.equal(first.cards[0].parts.trust, 50);
  assert.throws(() => compareQuotes({ job, quotes: [a], weights: { price: 0, slot: 0, trust: 0 } }), /totaling 100/);
});

test('different base units create separate groups and cannot be used as competitor cites', () => {
  const cleaningJob = { ...job, category: 'cleaning', scope: 'home_cleaning' };
  function cleaning(id, baseUnit) {
    return { ...quote({ id, branch: 'branch_' + id, base: 90000 }), category: 'cleaning', scope: 'home_cleaning', lines: [
      { ...copy(original.lines[0]), item_code: 'bersih_rumah', unit: baseUnit },
      copy(original.lines[1]),
      { ...copy(original.lines[2]), item_code: 'alat_bahan', unit: 'job' },
    ] };
  }
  const hourly = cleaning('quote_hourly01', 'hour');
  const perJob = cleaning('quote_perjob01', 'job');
  const result = compareQuotes({ job: cleaningJob, quotes: [hourly, perJob] });
  assert.equal(result.comparison.groups.length, 2);
  assert.deepEqual(result.cards.map((card) => card.rank), [1, 1]);
  perJob.lines[0].unit_price -= 5000; perJob.fixed_total -= 5000;
  assert.equal(allowedBuyerActions({ job: cleaningJob, quote: hourly, branch: {}, competitorQuotes: [perJob] }).available_cites.competitor_best, undefined);
});

test('over-budget quotes cannot rank but may be countered using a valid lower quote', () => {
  const own = quote({ base: 250000, status: 'over_budget' });
  const ctx = context(own, { competitorQuotes: [copy(original)] });
  assert.equal(compareQuotes({ job, quotes: [own] }).cards.length, 0);
  const policy = allowedBuyerActions(ctx);
  assert.ok(policy.allowed_actions.includes('counter'));
  assert.equal(policy.available_cites.competitor_best.amount, 110000);
  assert.equal(policy.allowed_actions.includes('counter_terms'), false);
});

test('clarification cap, one counter and explicit target authorization are enforced', () => {
  const incomplete = quote(); incomplete.status = 'needs_detail'; incomplete.unresolved = ['transport'];
  assert.ok(allowedBuyerActions(context(incomplete)).allowed_actions.includes('ask_detail'));
  assert.equal(allowedBuyerActions(context(incomplete, { branch: { clarifications_sent: 3 } })).allowed_actions.includes('ask_detail'), false);
  assert.equal(allowedBuyerActions(context(original, { branch: { countered: true } })).allowed_actions.includes('counter'), false);
  const targetJob = { ...job, target_price: 100000 };
  const noConsent = allowedBuyerActions(context(original, { job: targetJob, competitorQuotes: [] }));
  assert.equal(noConsent.available_cites.target, undefined);
  targetJob.target_authorized = true;
  assert.equal(allowedBuyerActions(context(original, { job: targetJob, competitorQuotes: [] })).available_cites.target.amount, 100000);
  assert.deepEqual(allowedBuyerActions(context(original, { branch: { status: 'closed' } })).allowed_actions, ['close']);
});

test('rules produce source-bound counter templates and never change a quote', async () => {
  const ctx = context();
  const before = copy(ctx);
  const result = await decideBuyer(ctx);
  assert.equal(result.engine, 'rules');
  assert.equal(result.action, 'counter');
  assert.equal(result.cite, 'competitor_best');
  assert.equal(result.amount, 105000);
  assert.match(result.message, /Rp105\.000/);
  assert.equal(result.message.includes(String(job.max_budget)), false);
  assert.deepEqual(ctx, before);
});

test('model context excludes private budgets, consumer data and raw competing provider messages', async () => {
  const privateJob = { ...job, max_budget: 342111, customer_name: 'Secret Customer', phone: '08123456789' };
  const ctx = context(original, { job: privateJob, recent_messages: [{ id: 'msg_foreign01', text: 'Foreign provider private message' }] });
  let sent;
  const result = await decideBuyer(ctx, async (call) => {
    sent = JSON.parse(call.user);
    return { action: 'counter', detail_key: null, cite: 'competitor_best', source_message_ids: ['msg_quote01'], reason: 'A lower valid quote is available.' };
  });
  assert.equal(result.engine, 'model');
  const serialized = JSON.stringify(sent);
  for (const secret of ['max_budget', '342111', 'Secret Customer', '08123456789', 'Foreign provider private message']) assert.equal(serialized.includes(secret), false, secret);
  assert.equal(sent.available_cites.competitor_best.amount, 105000);
});

test('malformed, unauthorized and invented model decisions fall back to rules with rejection reasons', async () => {
  const good = { action: 'counter', detail_key: null, cite: 'competitor_best', source_message_ids: ['msg_quote01'], reason: 'A lower current offer exists.' };
  const cases = [
    { ...good, action: 'refund' },
    { ...good, cite: 'target' },
    { ...good, detail_key: 'transport' },
    { ...good, source_message_ids: ['msg_foreign01'] },
    { ...good, amount: 60000 },
    { ...good, reason: 'The best offer is Rp60.000.' },
    { ...good, action: 'ask_detail', detail_key: 'transport', cite: 'none' },
    { ...good, action: 'close', cite: 'target' },
    null,
  ];
  for (const output of cases) {
    const result = await decideBuyer(context(), async () => output);
    assert.equal(result.engine, 'rules', JSON.stringify(output));
    assert.ok(result.rejected);
    assert.equal(result.amount, 105000);
    assert.equal(result.message.includes('60.000'), false);
  }
  const unavailable = await decideBuyer(context(), async () => { throw new Error('Do not expose this error'); });
  assert.equal(unavailable.engine, 'rules');
  assert.equal(unavailable.rejected, 'The model was unavailable.');
});

test('model term selection is rendered from verified terms, never from a model message', async () => {
  const ctx = context(original, { competitorQuotes: [] });
  const output = { action: 'counter_terms', detail_key: null, cite: 'waive_transport', source_message_ids: ['msg_quote01'], reason: 'Ask for a better transport term.' };
  const result = await decideBuyer(ctx, async () => output);
  assert.equal(result.engine, 'model');
  assert.match(result.message, /waive the transport/);
  const bad = await decideBuyer(ctx, async () => ({ ...output, cite: 'longer_warranty' }));
  assert.equal(bad.engine, 'rules');
  assert.ok(bad.rejected);
});

test('zero-budget free explicitly quoted scope remains eligible', () => {
  const zeroJob = { ...job, max_budget: 0 };
  const free = quote({ base: 0, transport: 0 });
  const result = compareQuotes({ job: zeroJob, quotes: [free] });
  assert.equal(result.cards[0].parts.price, 100);
  assert.equal(quoteEligibility(zeroJob, free).total, 0);
});

test('warranty counter-terms require their own recorded provider source and allow that source in decisions',async()=>{
  const offer=structuredClone(original),transport=offer.lines.find(line=>line.item_code==='transport');
  transport.kind='included';transport.unit_price=0;offer.fixed_total=90000;offer.warranty_days=30;offer.warranty_source={message_id:'msg_warranty01',snippet:'Service warranty 30 days.'};
  const ctx=context(offer,{competitorQuotes:[],branch:{countered:true}}),policy=allowedBuyerActions(ctx);
  assert.deepEqual(policy.available_terms,['longer_warranty']);let sent;
  const result=await decideBuyer(ctx,async call=>{sent=JSON.parse(call.user);return {action:'counter_terms',detail_key:null,cite:'longer_warranty',source_message_ids:['msg_warranty01'],reason:'Ask about the explicitly quoted warranty.'};});
  assert.equal(result.engine,'model');assert.ok(sent.own_source_message_ids.includes('msg_warranty01'));
  delete ctx.quote.warranty_source;assert.equal(allowedBuyerActions(ctx).available_terms.includes('longer_warranty'),false);
});

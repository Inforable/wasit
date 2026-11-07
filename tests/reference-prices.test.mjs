import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildReferenceBook, referenceFor, planningScenarios } from '../server/reference-prices.mjs';
import { buildPriceBookFile } from '../scripts/build-price-book.mjs';
import { compareQuotes } from '../server/comparison.mjs';

const query = { category: 'ac_service', item_code: 'cuci_ac', unit: 'unit', scope: 'ac_cleaning_inspection' };
const row = (index, extra = {}) => ({ category: query.category, item: query.item_code, unit: query.unit, scope: query.scope, price: 80000 + index * 10000, publisher: ['Offline sample A', 'Offline sample B', 'Offline sample C'][index % 3], source: 'https://sample.invalid/prices/' + index, date: '2026-01-0' + (index + 1), kecamatan: 'Kelapa Gading', ...extra });
const survey = (rows, extra = {}) => ({ snapshot_id: 'offline-validation-snapshot', synthetic: false, rows, ...extra });
const five = () => Array.from({ length: 5 }, (_, i) => row(i));
const fixture = async (name) => JSON.parse(await readFile(new URL('./fixtures/' + name + '.json', import.meta.url), 'utf8'));
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

test('comparable observations preserve provenance and integer nearest-rank percentile bands', () => {
  const input = freeze(survey(five()));
  const book = buildReferenceBook(input), band = referenceFor(book, query);
  assert.equal(book.status, 'sufficient'); assert.equal(book.synthetic, false); assert.equal(book.advisory_only, true);
  assert.deepEqual([band.sample_size, band.publisher_count, band.p25, band.p75], [5, 3, 90000, 110000]);
  assert.deepEqual(band.date_range, { first: '2026-01-01', last: '2026-01-05' });
  assert.equal(band.observations[0].source, input.rows[0].source);
  assert.deepEqual(band.locations, ['Kelapa Gading']);
  assert.equal(book.quality.percentile_method, 'nearest_rank');
  band.observations[0].price = 1;
  assert.equal(book.groups[0].observations[0].price, 80000);
});

test('sample and publisher gates are both required; multiple links from one publisher do not satisfy diversity', () => {
  const four = referenceFor(buildReferenceBook(survey(five().slice(0, 4))), query);
  assert.equal(four.status, 'insufficient_data'); assert.equal(four.p25, null);
  const same = referenceFor(buildReferenceBook(survey(five().map((value, i) => ({ ...value, publisher: i % 2 ? 'OFFLINE-SAMPLE-A' : 'offline sample a' })))), query);
  assert.equal(same.sample_size, 5); assert.equal(same.publisher_count, 1); assert.equal(same.p75, null);
  const six = referenceFor(buildReferenceBook(survey([...five(), row(5)])), query);
  assert.deepEqual([six.p25, six.p75], [90000, 120000]);
});

test('units, scopes and categories form separate groups with no broader-scope lookup fallback', () => {
  const cleaning = Array.from({ length: 6 }, (_, i) => row(i, { category: 'cleaning', item: 'bersih_rumah', unit: i < 3 ? 'hour' : 'job', scope: 'home_cleaning' }));
  const book = buildReferenceBook(survey([...five(), ...cleaning, row(8, { date: '2026-01-09', scope: 'ac_cleaning_without_inspection' })]));
  assert.equal(book.groups.length, 4);
  assert.equal(referenceFor(book, { category: 'cleaning', item_code: 'bersih_rumah', unit: 'hour', scope: 'home_cleaning' }).sample_size, 3);
  for (const change of [{ scope: 'different_scope' }, { unit: 'pcs' }, { category: 'washer' }, { item_code: 'isi_freon' }, { scope: '' }]) {
    const missing = referenceFor(book, { ...query, ...change });
    assert.equal(missing.status, 'insufficient_data'); assert.equal(missing.sample_size, 0); assert.equal(missing.p25, null);
  }
});

test('legacy rows without explicit units or scopes are excluded instead of being guessed', () => {
  const noUnit = row(0), noScope = row(1);
  delete noUnit.unit; delete noScope.scope;
  const book = buildReferenceBook(survey([noUnit, noScope, row(2, { item: 'ganti kapasitor', unit: 'pcs', scope: 'replacement_only' })]));
  assert.deepEqual(book.excluded.map((value) => value.reason), ['missing_unit', 'missing_scope']);
  assert.equal(book.groups[0].item_code, 'ganti_kapasitor');
  assert.equal(book.groups[0].status, 'insufficient_data');
});

test('invalid prices, dates, item bundles, sources and synthetic observations cannot become evidence', () => {
  const variants = [null, { category: 'other' }, { item: 'AC cleaning with refrigerant and parts' }, { price: 1.5 }, { price: 0 }, { price: -1 }, { price: 100000001 }, { publisher: ' ' }, { source: '' }, { source: 'javascript:alert(1)' }, { date: '2026-02-30' }, { date: 'not-a-date' }, { unit: 'pcs' }, { synthetic: true }, { simulation: true }, { origin: 'provider_price_list' }, { origin: 'estimate' }];
  const book = buildReferenceBook(survey(variants.map((variant) => variant === null ? null : row(0, variant))));
  assert.equal(book.quality.accepted_count, 0); assert.equal(book.excluded.length, variants.length);
  assert.equal(book.status, 'insufficient_data'); assert.equal(book.groups.length, 0);
  const synthetic = buildReferenceBook(survey(five(), { synthetic: true }));
  assert.equal(synthetic.groups.length, 0); assert.equal(synthetic.quality.accepted_count, 0);
  assert.ok(synthetic.excluded.every((value) => value.reason === 'synthetic_snapshot'));
  assert.equal(referenceFor(synthetic, query).p25, null);
  for (const invalid of [null, {}, survey([], { synthetic: undefined }), survey([], { snapshot_id: '' })]) assert.throws(() => buildReferenceBook(invalid), TypeError);
});

test('duplicate observations and conflicting prices cannot inflate sample size', () => {
  const first = row(0, { source: 'https://sample.invalid/prices?utm_source=one#part' });
  const duplicate = { ...first, publisher: 'OFFLINE-SAMPLE-A', source: 'https://sample.invalid/prices?utm_source=two' };
  const conflict = { ...row(1), price: 90001 };
  const book = buildReferenceBook(survey([first, duplicate, row(1), conflict, ...five().slice(2)]));
  assert.deepEqual(book.excluded.map((value) => value.reason), ['duplicate_observation', 'conflicting_observation', 'conflicting_observation']);
  assert.equal(book.quality.accepted_count, 4);
  assert.equal(referenceFor(book, query).status, 'insufficient_data');
});

test('planning uses only each explicit optional quoted amount and preserves quote, ranking and private budget', async () => {
  const [quote, job] = await Promise.all(['quote', 'job'].map(fixture));
  freeze(quote); freeze(job);
  const before = compareQuotes({ job, quotes: [quote] });
  const planning = planningScenarios(quote);
  buildReferenceBook(survey(five().map((value) => ({ ...value, price: 1 }))));
  assert.equal(planning.advisory_only, true); assert.equal(planning.quoted_total, 110000);
  assert.equal(planning.scenarios.length, 1);
  assert.deepEqual([planning.scenarios[0].additional_total, planning.scenarios[0].planning_total], [150000, 260000]);
  assert.equal(planning.scenarios[0].condition, quote.lines[3].condition);
  assert.deepEqual(compareQuotes({ job, quotes: [quote] }), before);
  assert.equal(quote.fixed_total, 110000); assert.equal(job.max_budget, 250000);
  assert.equal(JSON.stringify(planning).includes('probability'), true);
  assert.ok(!('likelihood' in planning.scenarios[0]));
});

test('optional scenarios never invent missing prices, sources or combined work', async () => {
  const quote = await fixture('quote');
  quote.lines.push({ ...quote.lines[3], id: 'line_optional02', item_code: 'isi_freon', unit: 'service', quantity: 2, unit_price: 70000, condition: null });
  const planning = planningScenarios(quote);
  assert.equal(planning.scenarios.length, 2);
  assert.deepEqual(planning.scenarios.map((value) => value.planning_total), [260000, 250000]);
  assert.ok(planning.scenarios.every((value) => !('probability' in value) && !('likelihood' in value)));
  quote.lines[3].unit_price = null;
  quote.lines[4].source = null;
  const excluded = planningScenarios(quote);
  assert.equal(excluded.scenarios.length, 0); assert.equal(excluded.excluded.length, 2); assert.equal(excluded.quoted_total, 110000);
  quote.fixed_total = null;
  assert.equal(planningScenarios(quote).status, 'insufficient_data');
});

test('planning rejects missing required costs, forged arithmetic, mismatched units and overflowing additions', async () => {
  const quote = await fixture('quote');
  for (const alter of [
    (value) => { value.lines = value.lines.filter((line) => line.item_code !== 'transport'); },
    (value) => { value.fixed_total = 1; },
    (value) => { value.lines[0].unit = 'hour'; },
    (value) => { value.lines[0].quantity = 2; },
  ]) {
    const broken = structuredClone(quote); alter(broken);
    assert.equal(planningScenarios(broken).status, 'insufficient_data');
  }
  quote.lines[3].unit_price = 100000000;
  const overflow = planningScenarios(quote);
  assert.equal(overflow.scenarios.length, 0); assert.equal(overflow.excluded[0].reason, 'optional_total_out_of_range');
});

test('CLI builder writes only the requested new output and preserves every existing snapshot', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'wasit-reference-tests-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = join(directory, 'offline-survey.json'), output = join(directory, 'advisory-book.json');
  const original = JSON.stringify(survey(five()));
  await writeFile(input, original, 'utf8');
  const built = await buildPriceBookFile(input, output);
  assert.equal(built.groups.length, 1);
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), built);
  assert.equal(await readFile(input, 'utf8'), original);
  await assert.rejects(buildPriceBookFile(input, output), (error) => error.code === 'EEXIST');
  await assert.rejects(buildPriceBookFile(input, input), /new file/);
  assert.equal(await readFile(input, 'utf8'), original);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmounts, formatRp } from '../server/money.mjs';
import { CATEGORIES, catalog, detectCategory, normalizeItem, supportedUnits } from '../server/catalog.mjs';
import { wibParts, resolveDay, parseSchedule } from '../server/time.mjs';
import { formatRequest } from '../server/formatter.mjs';
import { createContractValidator } from '../scripts/contracts.mjs';

const NOW = Date.parse('2026-11-06T03:00:00Z');
const validate = await createContractValidator();
const first = (text) => parseAmounts(text).map((entry) => entry.value);
test('Rupiah parser handles numeric, spoken and slang prices without duplicate counts', () => {
  const cases = [
    ['Rp90.000', [90000]], ['90rb', [90000]], ['90 ribu', [90000]], ['90k', [90000]],
    ['1,5jt', [1500000]], ['1.5 juta', [1500000]], ['Rp 1.500.000', [1500000]],
    ['90,000', [90000]], ['90000', [90000]], ['seratus dua puluh ribu', [120000]],
    ['satu juta dua ratus ribu', [1200000]], ['seribu lima ratus', [1500]], ['sejuta', [1000000]],
    ['cepek', [100000]], ['gocap', [50000]], ['goceng', [5000]], ['ceban', [10000]],
    ['goban', [50000]], ['gopek', [500]], ['seceng', [1000]],
    ['Cuci 90rb; kapasitor 150rb', [90000, 150000]], ['AC 1 PK, 2 unit, jam 09.00, garansi 30 hari', []],
    ['Rp100.000.001', []], ['Rp0 transport', [0]], ['harga 9000', [9000]], ['budget 4000', [4000]], ['harga -150000', []], ['Rp-150000', []],
  ];
  for (const [input, expected] of cases) assert.deepEqual(first(input), expected, input);
  assert.equal(formatRp(238000), 'Rp238.000');
  const text = 'Cuci 90rb dan transport Rp20.000';
  assert.equal(parseAmounts(text)[0].index, text.indexOf('90rb'));
});
test('five catalogs distinguish overlapping item names and scope', () => {
  assert.equal(CATEGORIES.length, 5);
  assert.equal(detectCategory('AC bocor'), 'ac_service');
  assert.equal(detectCategory('mesin cuci bocor'), 'washer');
  assert.equal(detectCategory('pipa bocor'), 'plumbing');
  assert.equal(detectCategory('MCB sering turun'), 'electrical');
  assert.equal(detectCategory('bersih rumah'), 'cleaning');
  assert.equal(normalizeItem('ac_service', 'Cek freon termasuk'), 'cek_freon');
  assert.equal(normalizeItem('ac_service', 'Isi freon Rp220.000'), 'isi_freon');
  assert.equal(normalizeItem('ac_service', 'kompresor baru'), 'other');
  assert.deepEqual(supportedUnits('ac_service', 'ganti_kapasitor'), ['pcs']);
  assert.ok(catalog('washer').requiredItems.includes('transport'));
  assert.throws(() => catalog('unknown'), RangeError);
});
test('WIB dates and English/Indonesian day phrases are timezone-independent', () => {
  const examples = [['hari ini', 6], ['today', 6], ['besok', 7], ['tomorrow', 7], ['lusa', 8], ['day after tomorrow', 8], ['Sabtu', 7], ['Saturday', 7], ['Friday', 6], ['Senin', 9]];
  for (const [word, day] of examples) assert.equal(wibParts(resolveDay(word, NOW)).day, day, word);
  assert.equal(parseSchedule('Sabtu pagi', NOW).time_window.start, '2026-11-07T01:00:00.000Z');
  assert.equal(parseSchedule('Tomorrow morning', NOW).time_window.end, '2026-11-07T05:00:00.000Z');
  assert.equal(parseSchedule('Saturday at 9', NOW).time_window.start, '2026-11-07T02:00:00.000Z');
  assert.equal(parseSchedule('Saturday 09:30–12:00 WIB', NOW).time_window.start, '2026-11-07T02:30:00.000Z');
  assert.equal(parseSchedule('2026-11-07 at 9', NOW).time_window.start, '2026-11-07T02:00:00.000Z');
  assert.equal(parseSchedule('Saturday at 25', NOW), null);
  assert.equal(parseSchedule('2026-02-30 at 9', NOW), null);
  assert.equal(parseSchedule('soon', NOW), null);
  assert.equal(parseSchedule('Saturday 09:00 UTC', NOW), null);
  assert.equal(parseSchedule('2026-11-07T02:00:00Z', NOW).time_window.start, '2026-11-07T02:00:00.000Z');
  assert.equal(parseSchedule('Saturday morning, 1-2 unit AC', NOW).time_window.start, '2026-11-07T01:00:00.000Z');
});
test('formatter produces schema-valid jobs for every service without inferring a public target', () => {
  const examples = ['AC bocor', 'Mesin cuci tidak berputar', 'Pipa wastafel bocor', 'Listrik jeglek', 'Bersih rumah'];
  for (const [index, phrase] of examples.entries()) {
    const result = formatRequest({ request_text: phrase + ', Sabtu pagi, budget maksimal Rp400rb' }, { now: NOW, profileLocation: 'Kelapa Gading', id: 'request_test' + index + '00' });
    assert.equal(result.status, 'ready', phrase);
    validate('job.schema.json', result.job);
    assert.equal(result.job.category, CATEGORIES[index].id);
    assert.equal(result.job.max_budget, 400000);
    assert.equal(result.job.target_authorized, false);
  }
});
test('around is a target, not a spending cap; explicit target permission is separate', () => {
  const partial = formatRequest({ request_text: 'AC tidak dingin, sekitar Rp300rb' }, { now: NOW, profileLocation: 'Tebet' });
  assert.equal(partial.status, 'needs_clarification');
  assert.deepEqual(partial.questions.map((q) => q.id), ['time_window', 'max_budget']);
  const result = formatRequest({ request_text: 'AC sekitar Rp300rb', answers: { time_window: 'Tomorrow morning', max_budget: 'Rp350.000' } }, { now: NOW, profileLocation: 'Tebet' });
  assert.equal(result.status, 'ready');
  assert.equal(result.job.target_price, 300000);
  assert.equal(result.job.max_budget, 350000);
  assert.equal(result.job.target_authorized, false);
  const both = formatRequest({ request_text: 'AC Sabtu pagi target Rp200rb, maks Rp250rb', target_authorized: true }, { now: NOW, profileLocation: 'Tebet' });
  assert.equal(both.job.max_budget, 250000);
  assert.equal(both.job.target_price, 200000);
  assert.equal(both.job.target_authorized, true);
});
test('English clarification chips round-trip and request location overrides profile', () => {
  const result = formatRequest({
    request_text: 'Need help at home', answers: { category: 'Washing machine service', time_window: 'Tomorrow afternoon', max_budget: 'Rp400.000', location: 'Menteng' },
  }, { now: NOW, profileLocation: 'Tebet' });
  assert.equal(result.status, 'ready');
  assert.equal(result.job.category, 'washer');
  assert.equal(result.job.location_label, 'Menteng');
  assert.equal(result.job.time_window.start, '2026-11-07T05:00:00.000Z');
  assert.match(result.job.schedule_label, /Saturday/);
  const explicit = formatRequest({ request_text: 'AC bocor di Kelapa Gading, besok pagi, maksimal 250rb' }, { now: NOW, profileLocation: 'Tebet' });
  assert.equal(explicit.job.location_label, 'Kelapa Gading');
});
test('invalid supplied facts are rejected, conflicting caps need clarification, inputs stay unchanged', () => {
  const input = { request_text: 'AC besok pagi', max_budget: 250000, location_label: 'Tebet', weights: { price: 50, slot: 25, trust: 25 } };
  const before = JSON.stringify(input);
  const result = formatRequest(input, { now: NOW });
  assert.equal(result.status, 'ready');
  result.job.weights.price = 1;
  assert.equal(JSON.stringify(input), before);
  assert.throws(() => formatRequest({ ...input, max_budget: -1 }, { now: NOW }), /Maximum budget/);
  assert.throws(() => formatRequest({ ...input, weights: { price: 100, slot: 100, trust: 100 } }, { now: NOW }), /adding up to 100/);
  assert.throws(() => formatRequest({ ...input, units: 0 }, { now: NOW }), /number of units/);
  assert.throws(() => formatRequest({ ...input, request_text: 'AC 1-2 unit besok pagi' }, { now: NOW }), /exact number of units/);
  assert.throws(() => formatRequest({ request_text: '' }, { now: NOW }), /Describe/);
  const conflict = formatRequest({ request_text: 'AC besok pagi budget 250rb, maksimal 300rb', location_label: 'Tebet' }, { now: NOW });
  assert.equal(conflict.status, 'needs_clarification');
  assert.equal(conflict.questions[0].id, 'max_budget');
});

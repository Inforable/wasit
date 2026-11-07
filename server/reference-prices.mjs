import { catalog } from './catalog.mjs';

const MAX_MONEY = 100_000_000;
const MIN_PRICES = 5;
const MIN_PUBLISHERS = 3;
const text = (value) => typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/g, ' ') : '';
const keyText = (value) => text(value).toLowerCase();
const publisherKey = (value) => keyText(value).replace(/[^\p{L}\p{N}]/gu, '');
const money = (value, positive = true) => Number.isSafeInteger(value) && value >= (positive ? 1 : 0) && value <= MAX_MONEY;
const groupKey = ({ category, item_code, unit, scope }) => JSON.stringify([category, item_code, unit, keyText(scope)]);
const sortText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const ADVISORY = 'Collected price observations are advisory context only. They do not approve work, set a market guarantee, change a quote, or establish a negotiation price.';

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function findItem(category, value) {
  let book;
  try { book = catalog(category); } catch { return null; }
  const input = keyText(value).replace(/[_-]+/g, ' ');
  return book.items.find((item) => [item.id.replaceAll('_', ' '), item.label, ...item.keywords].some((alias) => keyText(alias) === input)) ?? null;
}

function sourceKey(value) {
  const source = text(value);
  if (!source || source.length > 2000) return null;
  if (/^https?:/i.test(source)) {
    try {
      const url = new URL(source);
      if (!url.hostname || url.username || url.password) return null;
      url.hash = '';
      for (const name of [...url.searchParams.keys()]) if (/^utm_|^(?:gclid|fbclid)$/i.test(name)) url.searchParams.delete(name);
      url.searchParams.sort();
      return url.href;
    } catch { return null; }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(source) && !/^(?:phone|telephone|telepon|whatsapp|wa):/i.test(source)) return null;
  return keyText(source);
}

function normalizeRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return { reason: 'invalid_row' };
  if (row.synthetic === true || row.simulation === true || ['seed', 'demo', 'synthetic', 'assumption', 'estimate', 'provider_price_list', 'quote'].includes(keyText(row.origin))) return { reason: 'synthetic_or_uncollected' };
  let book;
  try { book = catalog(row.category); } catch { return { reason: 'invalid_category' }; }
  const item = findItem(row.category, row.item);
  if (!item) return { reason: 'unknown_or_bundled_item' };
  if (!money(row.price)) return { reason: 'invalid_price' };
  const publisher = text(row.publisher);
  if (!publisher || publisher.length > 200 || !publisherKey(publisher)) return { reason: 'missing_publisher' };
  const source = text(row.source), sourceId = sourceKey(source);
  if (!sourceId) return { reason: 'missing_or_invalid_source' };
  if (!validDate(row.date)) return { reason: 'invalid_date' };
  const unit = keyText(row.unit);
  if (!unit) return { reason: 'missing_unit' };
  if (!item.units.includes(unit)) return { reason: 'unsupported_unit' };
  const scope = text(row.scope);
  if (!scope) return { reason: 'missing_scope' };
  if (scope.length > 300) return { reason: 'invalid_scope' };
  if (row.kecamatan != null && (typeof row.kecamatan !== 'string' || text(row.kecamatan).length > 150)) return { reason: 'invalid_location' };
  return {
    row: { category: book.id, item_code: item.id, item_label: item.label, unit, scope, price: row.price, publisher, source, date: row.date, kecamatan: text(row.kecamatan) || null },
    publisherId: publisherKey(publisher), sourceId,
  };
}

// Nearest-rank percentiles preserve integer Rupiah observations: sorted[ceil(p * n) - 1].
function percentile(sorted, probability) { return sorted[Math.max(0, Math.ceil(probability * sorted.length) - 1)]; }

/** Build an advisory book from explicit collected observations, never provider app prices or synthetic seed data. */
export function buildReferenceBook(survey) {
  if (!survey || typeof survey !== 'object' || Array.isArray(survey) || !text(survey.snapshot_id) || typeof survey.synthetic !== 'boolean' || !Array.isArray(survey.rows)) {
    throw new TypeError('A survey needs a snapshot ID, an explicit synthetic flag, and an array of rows.');
  }
  const excluded = [], candidates = [];
  for (let index = 0; index < survey.rows.length; index++) {
    if (survey.synthetic) { excluded.push({ row_index: index, reason: 'synthetic_snapshot' }); continue; }
    const normalized = normalizeRow(survey.rows[index]);
    if (normalized.reason) { excluded.push({ row_index: index, reason: normalized.reason }); continue; }
    candidates.push({ ...normalized, index });
  }
  const observations = new Map();
  for (const candidate of candidates) {
    const identity = JSON.stringify([groupKey(candidate.row), candidate.publisherId, candidate.sourceId, candidate.row.date]);
    if (!observations.has(identity)) observations.set(identity, []);
    observations.get(identity).push(candidate);
  }
  const accepted = [];
  for (const sameObservation of observations.values()) {
    if (new Set(sameObservation.map(({ row }) => row.price)).size > 1) {
      for (const candidate of sameObservation) excluded.push({ row_index: candidate.index, reason: 'conflicting_observation' });
      continue;
    }
    accepted.push(sameObservation[0]);
    for (const candidate of sameObservation.slice(1)) excluded.push({ row_index: candidate.index, reason: 'duplicate_observation' });
  }
  const grouped = new Map();
  for (const candidate of accepted) {
    const key = groupKey(candidate.row);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(candidate);
  }
  const groups = [...grouped.entries()].sort(([left], [right]) => sortText(left, right)).map(([, entries]) => {
    const ordered = [...entries].sort((left, right) => sortText(left.row.date, right.row.date) || sortText(left.publisherId, right.publisherId) || sortText(left.sourceId, right.sourceId));
    const first = ordered[0].row, prices = entries.map(({ row }) => row.price).sort((a, b) => a - b);
    const publishers = new Set(entries.map(({ publisherId }) => publisherId));
    const sufficient = prices.length >= MIN_PRICES && publishers.size >= MIN_PUBLISHERS;
    return {
      category: first.category, item_code: first.item_code, item_label: first.item_label, unit: first.unit, scope: first.scope,
      status: sufficient ? 'sufficient' : 'insufficient_data', sample_size: prices.length, publisher_count: publishers.size,
      p25: sufficient ? percentile(prices, 0.25) : null, p75: sufficient ? percentile(prices, 0.75) : null,
      date_range: { first: ordered[0].row.date, last: ordered.at(-1).row.date },
      locations: [...new Set(entries.map(({ row }) => row.kecamatan).filter(Boolean))].sort(sortText),
      observations: ordered.map(({ row }) => ({ price: row.price, publisher: row.publisher, source: row.source, date: row.date, kecamatan: row.kecamatan })),
      advisory_only: true,
    };
  });
  return {
    snapshot_id: text(survey.snapshot_id), synthetic: survey.synthetic, currency: 'IDR', advisory_only: true, note: ADVISORY,
    status: groups.some((group) => group.status === 'sufficient') ? 'sufficient' : 'insufficient_data',
    quality: { row_count: survey.rows.length, accepted_count: accepted.length, excluded_count: excluded.length, min_prices: MIN_PRICES, min_publishers: MIN_PUBLISHERS, percentile_method: 'nearest_rank', source_verification: 'Reported sources and collection dates are preserved; this offline build does not verify their contents or freshness.' },
    groups, excluded: excluded.sort((left, right) => left.row_index - right.row_index),
  };
}

/** Lookup requires the same explicit category, item, unit and scope; there is no broader-scope fallback. */
export function referenceFor(book, query = {}) {
  const requested = { category: text(query.category), item_code: text(query.item_code), unit: keyText(query.unit), scope: text(query.scope) };
  const complete = Object.values(requested).every(Boolean);
  const match = complete && book?.synthetic === false && book?.advisory_only === true && Array.isArray(book.groups)
    ? book.groups.find((group) => groupKey(group) === groupKey(requested)) : null;
  if (match) return { ...structuredClone(match), snapshot_id: book.snapshot_id, currency: 'IDR', note: ADVISORY };
  return { ...requested, snapshot_id: book?.snapshot_id ?? null, currency: 'IDR', status: 'insufficient_data', sample_size: 0, publisher_count: 0, p25: null, p75: null, date_range: null, locations: [], observations: [], advisory_only: true, note: ADVISORY };
}

/** Each scenario adds exactly one explicitly priced optional quote line; no likelihood or combined necessity is inferred. */
export function planningScenarios(quote) {
  const empty = (reason) => ({ quote_id: quote?.id ?? null, advisory_only: true, status: 'insufficient_data', quoted_total: null, scenarios: [], excluded: [{ reason }] });
  if (!quote || !Array.isArray(quote.lines) || !money(quote.fixed_total, false)) return empty('incomplete_quoted_total');
  let definition;
  try { definition = catalog(quote.category); } catch { return empty('unsupported_category'); }
  const required = new Set(definition.requiredItems), keys = new Set();
  let fixed = 0;
  for (const line of quote.lines) {
    if (!line || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20 || typeof line.item_code !== 'string' || typeof line.unit !== 'string' || keys.has(line.item_code + ':' + line.unit)) return empty('ambiguous_quote_lines');
    keys.add(line.item_code + ':' + line.unit);
    if (!['fixed', 'included', 'optional', 'unknown'].includes(line.kind)) return empty('ambiguous_quote_lines');
    if (line.kind === 'fixed' || line.kind === 'included') {
      const item = definition.items.find((candidate) => candidate.id === line.item_code);
      if (!item || !item.units.includes(line.unit) || !money(line.unit_price, false) || (line.kind === 'included' && line.unit_price !== 0) || !text(line.source?.message_id) || !text(line.source?.snippet)) return empty('incomplete_quoted_total');
      if (line.item_code === definition.baseItem && quote.units != null && line.quantity !== quote.units) return empty('ambiguous_quote_lines');
      if (required.has(line.item_code)) required.delete(line.item_code);
      if (line.kind === 'fixed') fixed += line.quantity * line.unit_price;
    }
  }
  if (required.size || !money(fixed, false) || fixed !== quote.fixed_total) return empty('incomplete_quoted_total');
  const scenarios = [], excluded = [];
  for (const line of quote.lines.filter((candidate) => candidate.kind === 'optional')) {
    const item = definition.items.find((candidate) => candidate.id === line.item_code);
    if (!item || !item.units.includes(line.unit) || !money(line.unit_price, false) || !text(line.source?.message_id) || !text(line.source?.snippet)) {
      excluded.push({ line_id: line.id ?? null, reason: 'optional_price_or_source_unconfirmed' }); continue;
    }
    const additional = line.quantity * line.unit_price, total = fixed + additional;
    if (!money(additional, false) || !money(total, false)) { excluded.push({ line_id: line.id ?? null, reason: 'optional_total_out_of_range' }); continue; }
    scenarios.push({
      line_id: line.id ?? null, item_code: line.item_code, label: item.label, quantity: line.quantity, unit: line.unit, unit_price: line.unit_price,
      additional_total: additional, planning_total: total,
      condition: text(line.condition) || 'Only if this optional work is needed and explicitly approved.',
      source: { message_id: line.source.message_id, snippet: line.source.snippet }, advisory_only: true,
    });
  }
  return { quote_id: quote.id ?? null, advisory_only: true, status: 'available', quoted_total: fixed, scenarios, excluded, note: 'Each conditional scenario includes one optional item only. These values do not approve additional work or change the quoted total; no probability is assigned.' };
}

import { createHash } from 'node:crypto';
import { catalog, supportedUnits } from './catalog.mjs';

const MAX_AMOUNT = 100_000_000;
const clamp = (value) => Math.max(0, Math.min(100, value));
const canonical = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
const isMoney = (value) => Number.isSafeInteger(value) && value >= 0 && value <= MAX_AMOUNT;
const failure = (reason, unresolved = []) => ({ ok: false, reason, unresolved });

function requiredItems(job) {
  const definition = catalog(job.category);
  return definition?.requiredItems ?? definition?.required_items ?? [];
}

function parseWindow(job) {
  if (!job.time_window) return null;
  const start = Date.parse(job.time_window.start);
  const end = Date.parse(job.time_window.end);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}

function scheduleMatch(job, quote) {
  const window = parseWindow(job);
  // A structured slot is authoritative only after the extraction/source pipeline validates it.
  if (quote.slot != null) {
    const slot = Date.parse(quote.slot);
    if (!window || !Number.isFinite(slot)) return failure('The available time needs confirmation.', ['schedule']);
    if (slot < window.start || slot >= window.end) return failure('The available slot is outside your requested time window.', ['schedule']);
    return { ok: true, slot };
  }
  if (!canonical(quote.schedule_label) || canonical(quote.schedule_label) !== canonical(job.schedule_label)) {
    return failure('The available time is not confirmed against your requested schedule.', ['schedule']);
  }
  return { ok: true, slot: null };
}

/** Only explicit required-scope prices are eligible. This function does not validate message ownership. */
export function quoteEligibility(job, quote, { allowOverBudget = false } = {}) {
  if (!quote || typeof quote !== 'object') return failure('No quoted scope is available.', ['base_price']);
  if (quote.request_id != null && quote.request_id !== job.id) return failure('This quote belongs to a different request.', ['scope']);
  if (quote.category !== job.category || quote.scope !== job.scope || quote.units !== job.units) {
    return failure('This quote covers a different service scope or quantity.', ['scope']);
  }
  if (quote.location_label != null && canonical(quote.location_label) !== canonical(job.location_label)) {
    return failure('This quote covers a different service location.', ['scope']);
  }
  if (!['ready', ...(allowOverBudget ? ['over_budget'] : [])].includes(quote.status)) {
    return failure(quote.status === 'over_budget' ? 'The quoted scope exceeds your maximum budget.' : 'The quoted scope still needs detail.', quote.unresolved ?? []);
  }
  if (quote.unresolved?.length) return failure('The quoted scope still needs detail.', quote.unresolved);
  if (!Array.isArray(quote.lines)) return failure('Quoted cost lines are missing.', ['scope']);

  const seen = new Set();
  let total = 0;
  for (const line of quote.lines) {
    if (!line || typeof line.item_code !== 'string' || typeof line.unit !== 'string' || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20) {
      return failure('An item quantity or unit needs clarification.', ['unit_quantity']);
    }
    const units = supportedUnits(job.category, line.item_code);
    if (units.length && !units.includes(line.unit)) return failure('The quoted item unit is not supported for this scope.', ['unit_quantity']);
    const pair = line.item_code + ':' + line.unit;
    if (seen.has(pair)) return failure('A quoted item is duplicated.', ['scope']);
    seen.add(pair);
    if (!line.source || typeof line.source.message_id !== 'string' || !canonical(line.source.snippet)) {
      return failure('A quoted item is missing its provider source.', ['scope']);
    }
    if (line.kind === 'unknown') {
      if (line.unit_price !== null) return failure('An unknown price must remain unknown.', ['scope']);
    } else if (!['fixed', 'included', 'optional'].includes(line.kind) || !isMoney(line.unit_price)) {
      return failure('An item price needs clarification.', ['scope']);
    }
    if (line.kind === 'included' && line.unit_price !== 0) return failure('An included item cannot carry an extra charge.', ['scope']);
    if (line.kind === 'fixed') {
      total += line.quantity * line.unit_price;
      if (!isMoney(total)) return failure('The quoted total is invalid.', ['scope']);
    }
  }
  for (const code of requiredItems(job)) {
    const matches = quote.lines.filter((line) => line.item_code === code && ['fixed', 'included'].includes(line.kind));
    if (matches.length !== 1) return failure('A required service cost or included item is missing.', [code === 'transport' ? 'transport' : 'scope']);
    const line = matches[0];
    const definition = catalog(job.category);
    const base = definition?.baseItem ?? definition?.base_item;
    if (code === base && line.quantity !== job.units) return failure('The quoted base quantity does not match your request.', ['unit_quantity']);
  }
  if (!isMoney(quote.fixed_total) || quote.fixed_total !== total) return failure('The quoted total does not match the cost lines.', ['scope']);
  const timing = scheduleMatch(job, quote);
  if (!timing.ok) return timing;
  if (!allowOverBudget && (!isMoney(job.max_budget) || total > job.max_budget)) {
    return failure('The quoted scope exceeds your maximum budget.');
  }
  const window = parseWindow(job);
  const scopeKey = JSON.stringify({
    category: job.category, scope: job.scope, units: job.units,
    items: requiredItems(job).map((code) => { const line = quote.lines.find((entry) => entry.item_code === code); return [code, line.unit, line.quantity]; }),
    location: canonical(job.location_label), window: window ? [window.start, window.end] : canonical(job.schedule_label),
  });
  return { ok: true, total, slot: timing.slot, window, scopeKey, unresolved: [] };
}

/** Discard stale versions per branch before considering any quote for ranking or citation. */
export function currentQuotes(quotes = []) {
  const latest = new Map();
  for (const quote of quotes) {
    if (!quote?.branch_id || !quote.id) continue;
    const previous = latest.get(quote.branch_id);
    const revision = Number.isInteger(quote.revision) ? quote.revision : -1;
    const previousRevision = Number.isInteger(previous?.revision) ? previous.revision : -1;
    if (!previous || revision > previousRevision ||
        (revision === previousRevision && Number(quote.updated_at ?? 0) > Number(previous.updated_at ?? 0)) ||
        (revision === previousRevision && Number(quote.updated_at ?? 0) === Number(previous.updated_at ?? 0) && quote.id.localeCompare(previous.id) > 0)) {
      latest.set(quote.branch_id, quote);
    }
  }
  return [...latest.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function normalizedWeights(input) {
  const weights = input ?? { price: 50, slot: 25, trust: 25 };
  if (!['price', 'slot', 'trust'].every((key) => Number.isInteger(weights[key]) && weights[key] >= 0 && weights[key] <= 100) ||
      weights.price + weights.slot + weights.trust !== 100) {
    throw new TypeError('Preference weights must be integers totaling 100.');
  }
  return weights;
}

function trustPart(provider) {
  if (Number.isFinite(provider?.trust_score)) return clamp(provider.trust_score);
  if (Number.isFinite(provider?.rating) && provider.rating >= 0 && provider.rating <= 5) return provider.rating * 20;
  return 50;
}

/**
 * Price = clamp(100 * (1 - quoted_total / max_budget)); free scope at zero budget scores 100.
 * Slot = clamp(100 * (1 - (slot - window_start) / window_duration)) for an explicit validated slot,
 * otherwise 50 for an exactly confirmed canonical label. Trust uses explicit trust_score/rating, else 50.
 * Score is the weighted sum / 100. Ties use lower quoted total and then quote ID.
 */
export function compareQuotes({ job, quotes = [], providers = {}, weights = job?.weights } = {}) {
  if (!job) throw new TypeError('A job is required to compare quotes.');
  const preference = normalizedWeights(weights);
  const current = currentQuotes(quotes);
  const currentIds = new Set(current.map((quote) => quote.id));
  const excluded = quotes.filter((quote) => quote?.id && !currentIds.has(quote.id)).map((quote) => ({
    quote_id: quote.id, reason: 'A newer quote revision is available from this provider.',
  }));
  const groups = new Map();
  const cards = [];
  for (const quote of current) {
    const eligible = quoteEligibility(job, quote);
    if (!eligible.ok) {
      excluded.push({ quote_id: quote.id, reason: eligible.reason });
      continue;
    }
    const groupId = 'group_' + createHash('sha256').update(eligible.scopeKey).digest('hex').slice(0, 16);
    if (!groups.has(groupId)) groups.set(groupId, { id: groupId, scope_key: eligible.scopeKey, quote_ids: [] });
    groups.get(groupId).quote_ids.push(quote.id);
    const provider = providers[quote.branch_id] ?? providers[quote.provider_id] ?? {};
    const parts = {
      price: job.max_budget === 0 ? 100 : clamp(100 * (1 - eligible.total / job.max_budget)),
      slot: eligible.slot == null ? 50 : clamp(100 * (1 - (eligible.slot - eligible.window.start) / (eligible.window.end - eligible.window.start))),
      trust: trustPart(provider),
    };
    const score = (parts.price * preference.price + parts.slot * preference.slot + parts.trust * preference.trust) / 100;
    cards.push({
      quote_id: quote.id, group_id: groupId, rank: 0, quoted_total: eligible.total,
      score: Math.round(score * 1000) / 1000,
      parts: Object.fromEntries(Object.entries(parts).map(([key, value]) => [key, Math.round(value * 1000) / 1000])),
      reason: 'Complete quoted costs for the same scope; ordered by your price, schedule and trust priorities.' +
        (provider.rating == null && provider.trust_score == null ? ' Trust data is unavailable, so its score is neutral.' : ''),
    });
  }
  cards.sort((a, b) => a.group_id.localeCompare(b.group_id) || b.score - a.score || a.quoted_total - b.quoted_total || a.quote_id.localeCompare(b.quote_id));
  const ranks = new Map();
  for (const card of cards) {
    const rank = (ranks.get(card.group_id) ?? 0) + 1;
    ranks.set(card.group_id, rank);
    card.rank = rank;
  }
  excluded.sort((a, b) => a.quote_id.localeCompare(b.quote_id));
  return { comparison: { groups: [...groups.values()], excluded }, cards };
}

import { createHash } from 'node:crypto';
import { stableJson } from '../shared/canonical.mjs';

// Explicit allowlist: consumer spending limits never enter the provider digest or payload.
export function publicTerms(terms) {
  return Object.fromEntries(['scope', 'units', 'location_label', 'schedule_label', 'lines', 'committed_total', 'change_reason'].map((key) => [key, terms[key]]));
}
export function termsDigest(terms) {
  return createHash('sha256').update(stableJson(publicTerms(terms)), 'utf8').digest('hex');
}
export function committedTotal(lines) {
  return lines.filter((line) => line.kind === 'committed').reduce((total, line) => {
    if (!Number.isSafeInteger(line.unit_price) || line.unit_price < 0 || !Number.isInteger(line.quantity) || line.quantity < 1) throw new Error('Committed costs must have an explicit integer price and quantity.');
    const next = total + line.quantity * line.unit_price;
    if (!Number.isSafeInteger(next) || next > 100_000_000) throw new Error('The committed total is too large.');
    return next;
  }, 0);
}

import { HttpError } from './errors.mjs';

const fail = (message) => new HttpError(400, 'invalid_payload', message);
const keyOf = (line) => line.item_code + ':' + line.unit;

export function checkBillLines({ terms, lines, knownItems = terms.lines.map((line) => line.item_code) }) {
  if (!Array.isArray(lines) || !lines.length || lines.length > 16) throw fail('Provide between one and sixteen bill lines.');
  const ids = new Set();
  const quantities = new Map();
  let submitted_total = 0;
  for (const line of lines) {
    if (!line || typeof line.id !== 'string' || ids.has(line.id) || typeof line.item_code !== 'string' || typeof line.unit !== 'string') throw fail('Each bill line needs a unique ID, item and unit.');
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20 || !Number.isSafeInteger(line.unit_price) || line.unit_price < 0 || line.unit_price > 100_000_000) throw fail('Bill prices and quantities must be valid integers.');
    ids.add(line.id);
    const key = keyOf(line);
    quantities.set(key, (quantities.get(key) ?? 0) + line.quantity);
    submitted_total += line.quantity * line.unit_price;
    if (!Number.isSafeInteger(submitted_total) || submitted_total > 100_000_000) throw fail('The submitted bill total is too large.');
  }
  const known = new Set(knownItems);
  const results = lines.map((line) => {
    const agreement = terms.lines.find((candidate) => keyOf(candidate) === keyOf(line));
    const sameItem = terms.lines.some((candidate) => candidate.item_code === line.item_code);
    const result = (status, reason) => ({
      bill_line_id: line.id, status, agreement_line_id: agreement?.id ?? null,
      reason, source_message_id: agreement?.source_message_id ?? null,
    });
    if (line.item_code === 'other' || (!known.has(line.item_code) && !sameItem)) return result('needs_clarification', 'The item needs a clear scope and provider explanation.');
    if (!agreement && sameItem) return result('needs_clarification', 'The unit differs from the agreed item and cannot be treated as equivalent.');
    if (agreement && quantities.get(keyOf(line)) > agreement.quantity) return result('needs_clarification', 'The combined quantity exceeds the quantity in the active agreement.');
    if (agreement?.kind === 'included') return line.unit_price === 0
      ? result('matches', 'This item is included at no additional charge.')
      : result('already_included', 'This item is already included in the active agreement and must not be charged again.');
    if (agreement?.kind === 'committed') return line.unit_price <= agreement.unit_price
      ? result('matches', 'The item, unit, quantity and price match the active agreement.')
      : result('price_changed', 'The proposed unit price is higher than the price in the active agreement.');
    if (!agreement && ['transport', 'cuci_ac', 'servis_mesin_cuci', 'perbaikan_pipa', 'servis_listrik', 'bersih_rumah'].includes(line.item_code)) return result('needs_clarification', 'The basic service or transport does not match the active agreement.');
    return result('new_work', 'This work has not been committed and needs an explicit change proposal and both parties\' approval.');
  });
  return { results, submitted_total };
}
export const checkBillAgainstAgreement = checkBillLines;

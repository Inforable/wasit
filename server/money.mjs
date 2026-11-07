const LIMIT = 100_000_000;
const SLANG = { cepek: 100000, gocap: 50000, goceng: 5000, ceban: 10000, goban: 50000, gopek: 500, seceng: 1000 };
const WORDS = { nol: 0, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10, sebelas: 11 };
const WORD = 'nol|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|belas|puluh|ratus|ribu|juta|seratus|seribu|sejuta';
function wordValue(text) {
  const tokens = text.toLowerCase().replace(/seratus/g, 'satu ratus').replace(/seribu/g, 'satu ribu').replace(/sejuta/g, 'satu juta').split(/\s+/);
  let total = 0, group = 0, current = 0;
  for (const token of tokens) {
    if (token in WORDS) current = WORDS[token];
    else if (token === 'belas') { group += current + 10; current = 0; }
    else if (token === 'puluh') { group += current * 10; current = 0; }
    else if (token === 'ratus') { group += (current || 1) * 100; current = 0; }
    else if (token === 'ribu' || token === 'juta') {
      total += (group + current || 1) * (token === 'juta' ? 1_000_000 : 1000);
      group = 0; current = 0;
    }
  }
  return total + group + current;
}
function numericValue(number, multiplier) {
  let normalized = number;
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(number)) normalized = number.replace(/[.,]/g, '');
  else if (multiplier > 1 && /^\d+[.,]\d{1,2}$/.test(number)) normalized = number.replace(',', '.');
  else if (/[.,]/.test(number)) return null;
  const value = Number(normalized) * multiplier;
  return Number.isSafeInteger(value) && value >= 0 && value <= LIMIT ? value : null;
}
/** Read monetary amounts without treating hours, warranty days or unit counts as prices. */
export function parseAmounts(text = '') {
  const body = String(text), matches = [];
  const add = (value, index, length) => {
    if (value == null || matches.some((m) => index < m.index + m.length && index + length > m.index)) return;
    matches.push({ value, index, length });
  };
  const numeric = /(?<![\p{L}\d])(?:(rp)\.?\s*)?(\d+(?:[.,]\d+)*)(?:\s*(ribu|juta|million|rb|jt|k|m))?(?![\p{L}\d])/giu;
  for (const match of body.matchAll(numeric)) {
    const [, prefix, number, suffix] = match;
    if (/(?:^|[\s(:=]|\brp\s*)[-?]\s*$/i.test(body.slice(0, match.index))) continue;
    const monetaryHint = /\b(?:budget|anggaran|maksimal|maks|maximum|max|harga|biaya|jasa|price|cost|fee|total|transport|ongkos)\s*[:=]?\s*$/i.test(body.slice(0, match.index));
    if (!prefix && !suffix && !/^\d{1,3}(?:[.,]\d{3})+$/.test(number) && !/^\d{5,}$/.test(number) && !(monetaryHint && /^\d{4}$/.test(number))) continue;
    const multiplier = suffix ? (/^(juta|million|jt|m)$/i.test(suffix) ? 1_000_000 : 1000) : 1;
    add(numericValue(number, multiplier), match.index, match[0].length);
  }
  const words = new RegExp('\\b(?:' + WORD + ')(?:\\s+(?:' + WORD + '))*\\b', 'gi');
  for (const match of body.matchAll(words)) {
    if (!/ribu|juta/i.test(match[0])) continue;
    const value = wordValue(match[0]);
    if (Number.isSafeInteger(value) && value <= LIMIT) add(value, match.index, match[0].length);
  }
  for (const match of body.matchAll(/\b(cepek|gocap|goceng|ceban|goban|gopek|seceng)\b/gi)) add(SLANG[match[1].toLowerCase()], match.index, match[0].length);
  return matches.sort((a, b) => a.index - b.index).map(({ value, index }) => ({ value, index }));
}
export const formatRp = (value) => value == null ? '—' : 'Rp' + Math.round(value).toLocaleString('id-ID');
export const roundTo1000 = (value) => Math.round(value / 1000) * 1000;

import { randomUUID } from 'node:crypto';
import { HttpError } from './errors.mjs';
import { CATEGORIES, catalog, detectCategory, scopeFor } from './catalog.mjs';
import { parseAmounts, formatRp } from './money.mjs';
import { parseSchedule } from './time.mjs';

const DEFAULT_WEIGHTS = { price: 50, slot: 25, trust: 25 };
const LOCATIONS = [
  'Kelapa Gading', 'Tebet', 'Menteng', 'Cempaka Putih', 'Gambir', 'Johar Baru', 'Kemayoran', 'Sawah Besar', 'Senen', 'Tanah Abang',
  'Cilincing', 'Koja', 'Pademangan', 'Penjaringan', 'Tanjung Priok', 'Cengkareng', 'Grogol Petamburan', 'Kalideres', 'Kebon Jeruk',
  'Kembangan', 'Palmerah', 'Taman Sari', 'Tambora', 'Cakung', 'Cipayung', 'Ciracas', 'Duren Sawit', 'Jatinegara', 'Kramat Jati',
  'Makasar', 'Matraman', 'Pasar Rebo', 'Pulo Gadung', 'Cilandak', 'Jagakarsa', 'Kebayoran Baru', 'Kebayoran Lama', 'Mampang Prapatan',
  'Pancoran', 'Pasar Minggu', 'Pesanggrahan', 'Setiabudi',
];
const invalid = (message) => new HttpError(400, 'invalid_payload', message);
const valueOf = (value) => value && typeof value === 'object' ? value.value : value;
function nonempty(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text.length <= 1000 ? text : null;
}
function explicitMoney(value, label) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000) return value;
    throw invalid(label + ' must be an integer Rupiah amount from 0 to 100,000,000.');
  }
  const text = String(value).trim();
  if (/^\d+$/.test(text)) return explicitMoney(Number(text), label);
  const amounts = parseAmounts(text);
  if (amounts.length !== 1 || /\b(around|about|sekitar|kira.kira|kisaran)\b/i.test(text)) throw invalid(label + ' must be one explicit Rupiah amount.');
  return amounts[0].value;
}
function budgetFromText(text) {
  const amounts = parseAmounts(text);
  const caps = [], targets = [], unclassified = [];
  for (const amount of amounts) {
    const before = text.slice(Math.max(0, amount.index - 90), amount.index).toLowerCase();
    if (/\b(?:bukan|not|jangan)\b[^,.!?;]{0,35}$/.test(before)) continue;
    const approximate = /\b(?:sekitar|kira.kira|kisaran|kurang lebih|target|around|about|roughly)\s*[:=]?\s*$/.test(before);
    const cap = /\b(?:budget|anggaran|maksimal|maks|max|maximum|at most|up to|under|di bawah|paling mahal|tidak lebih(?: dari)?)(?:\s+(?:maksimal|maximum|max|total|saya|my|is|sebesar)){0,3}\s*[:=]?\s*$/.test(before);
    if (approximate) targets.push(amount.value);
    else if (cap) caps.push(amount.value);
    else unclassified.push(amount.value);
  }
  return {
    max: new Set(caps).size === 1 ? caps[0] : null,
    target: new Set(targets).size === 1 ? targets[0] : targets.length === 0 && unclassified.length === 1 ? unclassified[0] : null,
  };
}
function categoryOf(value, text) {
  const normalized = nonempty(value)?.toLowerCase();
  if (normalized) {
    const exact = CATEGORIES.find((entry) => entry.id === normalized || entry.label.toLowerCase() === normalized);
    return exact?.id ?? detectCategory(normalized);
  }
  return detectCategory(text);
}
function detectLocation(text) {
  return LOCATIONS.slice().sort((a, b) => b.length - a.length).find((name) => new RegExp('\\b' + name.replace(/ /g, '\\s+') + '\\b', 'i').test(text)) ?? null;
}
function weightsOf(value) {
  if (value == null) return { ...DEFAULT_WEIGHTS };
  const keys = ['price', 'slot', 'trust'];
  if (!value || typeof value !== 'object' || Object.keys(value).some((key) => !keys.includes(key))
      || keys.some((key) => !Number.isInteger(value[key]) || value[key] < 0 || value[key] > 100)
      || keys.reduce((sum, key) => sum + value[key], 0) !== 100) throw invalid('Priority weights must be integers adding up to 100.');
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}
function unitCount(text, supplied) {
  if (supplied != null) {
    const number = Number(supplied);
    if (!Number.isInteger(number) || number < 1 || number > 20) throw invalid('The number of units must be from 1 to 20.');
    return number;
  }
  if (/\b\d+\s*[?-]\s*\d+\s*(?:units?|buah|titik)\b/i.test(text)) throw invalid('Confirm one exact number of units before requesting quotes.');
  const match = /\b(\d+)\s*(?:units?|buah|titik)\b/i.exec(text);
  if (match) return unitCount('', Number(match[1]));
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5 };
  const spoken = /\b(one|two|three|four|five|satu|dua|tiga|empat|lima)\s*(?:units?|buah|titik)\b/i.exec(text);
  return spoken ? words[spoken[1].toLowerCase()] : 1;
}
function questionsFor(parts) {
  const questions = [];
  if (!parts.category) questions.push({ id: 'category', label: 'Which service do you need?', options: CATEGORIES.map((entry) => entry.label) });
  if (!parts.schedule) questions.push({ id: 'time_window', label: 'When should the provider visit?', options: ['Today afternoon', 'Tomorrow morning', 'Tomorrow afternoon', 'Other'] });
  if (parts.max_budget == null) {
    const target = parts.target_price;
    const budgets = target != null ? [target, target + 50000, target + 100000].filter((n) => n <= 100_000_000) : [250000, 300000, 400000];
    questions.push({ id: 'max_budget', label: 'What is your maximum total budget?' + (target != null ? ' ' + formatRp(target) + ' is a target, not a limit.' : ''), options: [...new Set(budgets)].map(formatRp).concat('Other') });
  }
  if (!parts.location_label) questions.push({ id: 'location', label: 'Which area should the provider visit?', options: ['Kelapa Gading', 'Tebet', 'Menteng', 'Other'] });
  return questions.slice(0, 3);
}
/** Turn explicit request facts and canonical chip answers into a validated job shape. */
export function formatRequest(input, { now = Date.now(), id, profileLocation } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Send a service request object.');
  const text = nonempty(input.request_text);
  if (!text) throw invalid('Describe your service request using 1 to 1,000 characters.');
  const timestamp = typeof now === 'function' ? now() : now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(timestamp) || timestamp < 0) throw invalid('The request time is invalid.');
  const answers = input.answers && typeof input.answers === 'object' && !Array.isArray(input.answers) ? input.answers : {};
  const read = (name, ...aliases) => {
    for (const key of [name, ...aliases]) if (answers[key] != null && answers[key] !== '') return valueOf(answers[key]);
    return valueOf(input[name]);
  };
  const detected = budgetFromText(text);
  const explicitBudget = read('max_budget');
  const explicitTarget = read('target_price');
  const max = explicitBudget != null && explicitBudget !== '' ? explicitMoney(explicitBudget, 'Maximum budget') : detected.max;
  const target = explicitTarget != null && explicitTarget !== '' ? explicitMoney(explicitTarget, 'Target price') : detected.target;
  const scheduleInput = nonempty(read('schedule_label', 'time_window'));
  const schedule = parseSchedule(scheduleInput ?? text, timestamp);
  const location = nonempty(read('location_label', 'location')) ?? detectLocation(text)
    ?? nonempty(typeof profileLocation === 'object' ? profileLocation?.kecamatan ?? profileLocation?.label : profileLocation);
  const parts = { category: categoryOf(read('category'), text), schedule, max_budget: max, target_price: target, location_label: location };
  const questions = questionsFor(parts);
  if (questions.length) return { status: 'needs_clarification', questions };
  const jobId = id ?? 'request_' + randomUUID().replaceAll('-', '').slice(0, 20);
  if (typeof jobId !== 'string' || !/^[a-z]+_[a-zA-Z0-9_-]{6,64}$/.test(jobId)) throw invalid('The request identifier is invalid.');
  const job = {
    id: jobId, category: parts.category, units: unitCount(text, input.units), scope: scopeFor(parts.category), request_text: text,
    location_label: location, schedule_label: schedule.label, time_window: schedule.time_window,
    max_budget: max, target_price: target, target_authorized: input.target_authorized === true,
    weights: weightsOf(input.weights), created_at: Math.trunc(timestamp),
  };
  return { status: 'ready', job };
}
export const formatRules = formatRequest;

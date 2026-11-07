import { randomBytes } from 'node:crypto';
import { catalog, normalizeItem, supportedUnits } from './catalog.mjs';
import { parseAmounts } from './money.mjs';
import { formatRequest } from './formatter.mjs';
import { HttpError } from './errors.mjs';
import { assertTaskGeneration } from './task-guard.mjs';

const id = (prefix) => prefix + '_' + randomBytes(10).toString('hex');
const money = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000;
const injection = (text) => /ignore(?:\s+(?:all|previous|prior))*\s+instructions|abaikan (?:semua )?instruksi|system prompt|sistem ai:|you are an ai/i.test(text);
const clean = (text) => String(text).trim().replace(/\s+/g, ' ');
const escape = (text) => text.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&');

const inclusionWords = /\b(?:included|including|free|termasuk|gratis|no\s+(?:extra\s+|additional\s+)?charge|tanpa\s+biaya)\b/i;
export function hasDeniedInclusion(text) {
  const statement=String(text).toLowerCase().replace(/[\u2018\u2019]/g,"'").replace(/\bnot\s+only\b/g,'also').replace(/\bno\s+(?:extra\s+|additional\s+)?charge\b/g,'free').replace(/\btanpa\s+biaya(?:\s+tambahan)?\b/g,'free');
  return /\b(?:not|never|no longer|isn't|isnt|aren't|arent|wasn't|wasnt|won't|wont|cannot|can't|cant|tidak|tak|bukan|belum|nggak|enggak|gak|ga|tdk|blm)(?:\s+[\w'-]+){0,5}\s+(?:included|including|free|termasuk|gratis)\b/i.test(statement)||/\b(?:excluded|excluding|excludes|exclude|charged separately|separate charge|additional charge|extra charge|biaya tambahan|bayar terpisah|dikenakan biaya|di luar|diluar)\b/i.test(statement);
}
export function isExplicitlyIncluded(text) {
  return inclusionWords.test(String(text))&&!hasDeniedInclusion(text)&&!/\b(?:if|unless|jika|kalau|apabila|conditional)\b/i.test(String(text));
}
function quotedAmount(text) {
  const amounts=parseAmounts(text);
  if(amounts.length!==1)return null;
  if(/\b(?:not|bukan|tidak|belum)\s*(?:rp\.?\s*)?$/i.test(String(text).slice(0,amounts[0].index)))return null;
  if(hasDeniedInclusion(text)&&(amounts[0].value===0||/\b(?:in|dalam|dari|of)\s*(?:the\s+(?:price|total)\s*)?$/i.test(String(text).slice(0,amounts[0].index))))return null;
  return amounts[0].value;
}

export function atomicStatements(text, category) {
  const result = [];
  for (const clause of String(text).split(/\n|[;!?]|\.\s+/)) {
    const matches = [];
    for (const item of catalog(category).items) {
      for (const keyword of new Set([...item.keywords, item.label, item.id,...(item.kind==='included'&&item.id!=='alat_bahan'?['inspection','pemeriksaan']:[])])) {
        const pattern = new RegExp('\\b' + escape(keyword) + '\\b', 'gi');
        for (const match of clause.matchAll(pattern)) matches.push({ start: match.index, end: match.index + match[0].length, item });
      }
    }
    matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    const picked = [];
    for (const match of matches) if (!picked.some((old) => match.start < old.end && match.end > old.start)) picked.push(match);
    for (let i = 0; i < picked.length; i++) {
      const text = clause.slice(i === 0 ? 0 : picked[i].start, picked[i + 1]?.start).trim();
      if (text) result.push({ item: picked[i].item, text });
    }
  }
  return result;
}

function quantityAndUnit(statement, item, job) {
  const match = statement.match(/\b(\d+)\s*(pcs|buah|unit|job|service|hour|jam|m2)\b/i);
  if (match) return { quantity: Number(match[1]), unit: ({ buah: 'pcs', jam: 'hour' })[match[2].toLowerCase()] ?? match[2].toLowerCase() };
  if (item.units.length !== 1 || (item.kind === 'base' && job.units !== 1)) return null;
  return { quantity: 1, unit: item.units[0] };
}

function scheduleUncertain(text) {
  return String(text).split(/[;!?]|\.\s+|\n/).some(clause => mentionsSchedule(clause) && /\b(?:cannot|can't|unavailable|not available|unable|reschedule|instead|only|tidak bisa|tak bisa|ganti jadwal|hanya)\b/i.test(clause));
}
function mentionsSchedule(text) {
  return /\b(?:schedule|available|availability|slot|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jadwal|besok|hari ini|senin|selasa|rabu|kamis|jumat|sabtu|minggu|\d{1,2}[:.]\d{2}|wib)\b/i.test(text);
}

export function extractQuotedFacts({ message, job }) {
  const lines = [];
  for (const { item, text } of atomicStatements(message.text, job.category)) {
    if (injection(text)) continue;
    const amounts = parseAmounts(text).map((a) => a.value);
    const included = isExplicitlyIncluded(text);
    const terms = quantityAndUnit(text, item, job);
    let kind = item.kind === 'addon' ? 'optional' : 'fixed';
    let price = quotedAmount(text);
    if (included && (amounts.length === 0 || amounts.every((amount) => amount === 0))) { kind = 'included'; price = 0; }
    if (price == null || !terms) { kind = 'unknown'; price = null; }
    lines.push({
      id: 'line_pending01', item_code: item.id, label: item.label, kind,
      unit: terms?.unit ?? item.units[0], quantity: terms?.quantity ?? 1, unit_price: price,
      condition: kind === 'optional' ? 'Only if needed and approved.' : terms ? null : 'Confirm the item quantity and unit.',
      source: { message_id: message.id, snippet: text },
    });
  }
  let schedule = null, scheduleSource = null;
  if (!scheduleUncertain(message.text) && clean(message.text).toLowerCase().includes(clean(job.schedule_label).toLowerCase())) {
    schedule = job.schedule_label; scheduleSource = { message_id: message.id, snippet: job.schedule_label };
  } else {
    try {
      const parsed = formatRequest({ request_text: message.text, category: job.category, location_label: job.location_label, max_budget: job.max_budget }, { now: job.created_at, id: job.id });
      if (!scheduleUncertain(message.text) && parsed.status === 'ready' && parsed.job.schedule_label === job.schedule_label) {
        schedule = job.schedule_label; scheduleSource = { message_id: message.id, snippet: message.text };
      }
    } catch {}
  }
  return { schedule_label: schedule, schedule_source: scheduleSource, lines };
}

function sourceMatches(line, message, job) {
  if (injection(message.text)) return false;
  if (line.source?.message_id !== message.id || typeof line.source.snippet !== 'string' || !message.text.includes(line.source.snippet)) return false;
  const parts = atomicStatements(message.text, job.category).filter((part) => part.item.id === line.item_code && !injection(part.text) && (part.text.includes(line.source.snippet)||line.source.snippet.includes(part.text)));
  return parts.some(({ item, text }) => {
    const terms = quantityAndUnit(text, item, job);
    if (!terms || terms.quantity !== line.quantity || terms.unit !== line.unit) return false;
    const amounts = parseAmounts(text).map((amount) => amount.value);
    if (line.kind === 'unknown') return line.unit_price === null;
    if (line.kind === 'included') return line.unit_price === 0 && isExplicitlyIncluded(text) && amounts.every((value) => value === 0);
    return quotedAmount(text) !== null && quotedAmount(text) === line.unit_price;
  });
}

export function validateQuotedFacts({ extraction, message, job }) {
  const accepted = [], rejected = [];
  for (const raw of extraction?.lines ?? []) {
    const item = catalog(job.category).items.find((entry) => entry.id === raw?.item_code);
    const known = ['fixed','included','optional','unknown'].includes(raw?.kind);
    const price = raw?.kind === 'unknown' ? raw.unit_price === null : money(raw?.unit_price);
    if (!item || !known || !price || !Number.isInteger(raw.quantity) || raw.quantity < 1 || raw.quantity > 20 ||
      !supportedUnits(job.category, raw.item_code).includes(raw.unit) || !sourceMatches(raw, message, job) ||
      (item.kind === 'addon' && raw.kind === 'fixed')) {
      rejected.push('An item, price, quantity or source could not be verified.'); continue;
    }
    accepted.push({ id: raw.id ?? 'line_pending01', item_code: item.id, label: item.label, kind: raw.kind,
      unit: raw.unit, quantity: raw.quantity, unit_price: raw.unit_price,
      condition: typeof raw.condition === 'string' ? raw.condition.slice(0,1000) : null,
      source: {message_id: raw.source.message_id, snippet: raw.source.snippet} });
  }
  for (const factual of extractQuotedFacts({message,job}).lines) {
    if (!supportedUnits(job.category,factual.item_code).includes(factual.unit) || !sourceMatches(factual,message,job)) continue;
    const candidate=accepted.find(line=>line.item_code===factual.item_code);
    if (!candidate) rejected.push('An explicit source-verified cost detail was omitted.');
    else if (factual.kind!=='unknown' && candidate.kind==='unknown') rejected.push('An explicit source-verified price was downgraded to unknown.');
  }
  const schedule = extraction?.schedule_label;
  const proof = extraction?.schedule_source;
  const scheduleValid = !injection(message.text) && !scheduleUncertain(message.text) && typeof schedule === 'string' && schedule === job.schedule_label &&
    proof?.message_id === message.id && typeof proof.snippet === 'string' && message.text.includes(proof.snippet) && !injection(proof.snippet) &&
    (clean(proof.snippet).toLowerCase().includes(clean(job.schedule_label).toLowerCase()) ||
      extractQuotedFacts({ message: { ...message, text: proof.snippet }, job }).schedule_label === job.schedule_label);
  return { lines: accepted, schedule_label: scheduleValid ? schedule : null, rejected };
}

export function createQuoteService({ store, now = Date.now, newId = id, extractor = null } = {}) {
  const first = async (db, text, params) => (await db.query(text, params)).rows[0] ?? null;
  async function current(branchId, db = store) {
    const row = await first(db, 'SELECT data_json FROM quotes WHERE branch_id=$1 ORDER BY version DESC LIMIT 1', [branchId]);
    if(!row)return null;
    const quote=JSON.parse(row.data_json),branch=await first(db,'SELECT pending_question FROM branches WHERE id=$1',[branchId]);
    const zeros=(quote.lines??[]).filter(line=>line.unit_price===0);
    if(zeros.length){
      const sources=(await db.query("SELECT id,text FROM messages WHERE branch_id=$1 AND sender='provider'",[branchId])).rows;
      const invalid=new Set(zeros.filter(line=>{const message=sources.find(value=>value.id===line.source?.message_id);return !message||!sourceMatches(line,message,quote);}).map(line=>line.id));
      if(invalid.size){
        quote.lines=quote.lines.map(line=>invalid.has(line.id)?{...line,kind:'unknown',unit_price:null,condition:'Confirm this cost with the provider.'}:line);
        quote.status='needs_detail';quote.fixed_total=null;quote.unresolved=[...new Set([...(quote.unresolved??[]),...quote.lines.filter(line=>invalid.has(line.id)).map(line=>line.item_code==='transport'?'transport':line.item_code===catalog(quote.category).baseItem?'base_price':'scope')])];
      }
    }
    if(branch?.pending_question){quote.status='needs_detail';quote.fixed_total=null;quote.unresolved=[...new Set([...(quote.unresolved??[]),'scope'])];}
    return quote;
  }
  async function processMessage({ branchId, messageId, expectedGeneration, taskId, leaseToken }) {
    const context = await first(store, 'SELECT b.request_id,r.job_json FROM branches b JOIN requests r ON r.id=b.request_id WHERE b.id=$1', [branchId]);
    const message = await first(store, 'SELECT * FROM messages WHERE id=$1 AND branch_id=$2', [messageId, branchId]);
    if (!context?.job_json || !message || message.sender !== 'provider') throw new HttpError(422, 'invalid_source', 'A provider message from this branch is required.');
    const job = JSON.parse(context.job_json), previous = await current(branchId);
    let raw, engine = 'rules', rejected = [];
    if (extractor) {
      try {
        raw = await extractor({ request_id: context.request_id, message: { id: message.id, text: message.text }, job_public: {
          category: job.category, scope: job.scope, units: job.units, location_label: job.location_label, schedule_label: job.schedule_label,
        }, previous_quote: previous });
        engine = 'model';
      } catch { rejected.push('The extraction adapter failed; rules were used.'); }
    }
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.lines)) { raw = extractQuotedFacts({ message, job }); engine = 'rules'; }
    let checked = validateQuotedFacts({ extraction: raw, message, job });
    if (engine === 'model' && checked.rejected.length) {
      rejected.push(...checked.rejected); checked = validateQuotedFacts({ extraction: extractQuotedFacts({ message, job }), message, job }); engine = 'rules';
    }
    rejected.push(...checked.rejected);
    return store.transaction(async (tx) => {
      await tx.query('UPDATE requests SET status=status WHERE id=$1', [context.request_id]);
      await assertTaskGeneration(tx, { requestId: context.request_id, branchId, expectedGeneration, taskId, leaseToken, now: now() });
      const replay = await first(tx, 'SELECT data_json FROM quotes WHERE branch_id=$1 AND source_message_id=$2', [branchId,messageId]);
      if (replay) return {quote:JSON.parse(replay.data_json),engine,rejected,replayed:true};
      const latest = await current(branchId, tx);
      if ((latest?.revision ?? 0) !== (previous?.revision ?? 0)) throw new HttpError(409, 'stale_quote', 'A newer message changed this quote. Process it again.');
      const mentioned = new Set(atomicStatements(message.text,job.category).map(({item})=>item.id));
      const retained = injection(message.text) ? [] : (previous?.lines ?? []).filter(line=>!mentioned.has(line.item_code));
      const merged = new Map(retained.map((line) => [line.item_code + ':' + line.unit, line]));
      const seen = new Map();
      for (const candidate of checked.lines) {
        const key = candidate.item_code + ':' + candidate.unit;
        if (seen.has(key) && seen.get(key).unit_price !== candidate.unit_price) {
          merged.set(key, { ...candidate, id: newId('line'), kind: 'unknown', unit_price: null, condition: 'Conflicting prices need clarification.' });
        } else { seen.set(key, candidate); merged.set(key, { ...candidate, id: merged.get(key)?.id ?? newId('line') }); }
      }
      const lines = [...merged.values()], unresolved = [];
      for (const required of catalog(job.category).requiredItems) {
        const matches = lines.filter((line) => line.item_code === required);
        if (matches.length !== 1 || !['fixed','included'].includes(matches[0].kind)) unresolved.push(required === 'transport' ? 'transport' : required === catalog(job.category).baseItem ? 'base_price' : 'scope');
        if (matches.length > 1 || matches.some((line) => line.condition === 'Confirm the item quantity and unit.')) unresolved.push('unit_quantity');
        if (required===catalog(job.category).baseItem && matches.some(line=>line.quantity!==job.units)) unresolved.push('unit_quantity');
      }
      const schedule = checked.schedule_label ?? (injection(message.text) || mentionsSchedule(message.text) ? null : previous?.schedule_label ?? null);
      if (!schedule) unresolved.push('schedule');
      const branchQuestion=await first(tx,'SELECT pending_question FROM branches WHERE id=$1',[branchId]);
      if(branchQuestion?.pending_question)unresolved.push('scope');
      const required = [...new Set(unresolved)];
      const fixed = required.length ? null : lines.filter((line) => line.kind === 'fixed').reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
      if (fixed != null && !money(fixed)) throw new HttpError(422, 'invalid_price', 'The quoted total exceeds the supported range.');
      const quote = { id: newId('quote'), branch_id: branchId, revision: (latest?.revision ?? 0) + 1,
        category: job.category, scope: job.scope, units: job.units, schedule_label: schedule,
        lines, status: required.length ? 'needs_detail' : fixed > job.max_budget ? 'over_budget' : 'ready',
        fixed_total: fixed, unresolved: required, updated_at: now() };
      await tx.query('INSERT INTO quotes(id,branch_id,request_id,version,data_json,status,created_at,source_message_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [quote.id,branchId,context.request_id,quote.revision,JSON.stringify(quote),quote.status,now(),messageId]);
      if (injection(message.text)) await tx.query('UPDATE branches SET suspicious=$1 WHERE id=$2', [1, branchId]);
      await tx.query('INSERT INTO events(id,request_id,branch_id,t_ms,actor,kind,engine,title,data_json,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [newId('event'),context.request_id,branchId,0,'extractor','quote_updated',engine,
          rejected.length ? 'Unverified extraction was rejected; verified facts were retained.' : 'Provider costs were checked against their source.',
          JSON.stringify({ source_message_ids:[message.id],rejected }),now()]);
      return { quote, engine, rejected };
    });
  }
  return { current, processMessage };
}

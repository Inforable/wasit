const mentionsWarranty = /\b(?:warranty|garansi)\b/i;
const untrustedInstruction = /ignore(?:\s+(?:all|previous|prior))*\s+instructions|abaikan (?:semua )?instruksi|system prompt|you are an ai/i;
const uncertain = /\b(?:if|unless|conditional|could|would|might|maybe|possibly|subject to|provided that|depending|depends|up to|at most|at least|between|or|jika|kalau|apabila|bila|mungkin|tergantung|hingga|sampai|atau|business days|working days|hari kerja)\b/i;
const none = /\b(?:no|without|zero)\s+(?:service\s+)?(?:warranty|garansi)\b|\b(?:warranty|garansi)\s*(?:is\s*)?(?:not\s+(?:offered|provided|included|available|covered)|does\s+not\s+apply|none|nil|nihil|tidak\s+(?:ada|tersedia|ditanggung|berlaku))\b|\b(?:tidak\s+ada|tanpa)\s+garansi\b|\bnot\s+covered\s+by\s+(?:the\s+|a\s+)?warranty\b/i;
const deniedDuration = /\b(?:not|never|isn't|isnt|bukan|tidak|tak|belum)\b(?:\s+[\w'-]+){0,4}\s+\d{1,4}\s*-?\s*(?:days?|hari)\b/i;
const unknown = mentioned => ({ mentioned, warranty_days: null, warranty_source: null });

/** Preserve an exact provider statement; uncertain duration or coverage never becomes a benefit. */
export function extractWarrantyFact(message) {
  const text = typeof message?.text === 'string' ? message.text : '', mentioned = mentionsWarranty.test(text);
  if (!mentioned) return unknown(false);
  if (!text.trim() || text.length > 1000 || typeof message?.id !== 'string' || untrustedInstruction.test(text)) return unknown(true);
  const clauses = text.split(/\n|[;!?]|\.\s+/), values = [];
  for (let index = 0; index < clauses.length; index++) {
    const clause = clauses[index]; if (!mentionsWarranty.test(clause)) continue;
    if (uncertain.test(clause) || deniedDuration.test(clause) || /^(?:\s*only\s+)?\s*(?:if|unless|provided|jika|kalau|apabila)\b/i.test(clauses[index + 1] ?? '') || /\bno\s+warranty\s+(?:extension|extensions|upgrade)\b/i.test(clause)) return unknown(true);
    const durations = [...clause.matchAll(/(?<![\d.,-])\b(\d{1,4})\s*-?\s*(?:days?|hari)\b/gi)].map(match => Number(match[1]));
    if (none.test(clause)) { if (durations.some(days => days !== 0)) return unknown(true); values.push(0); }
    else { if (!durations.length) return unknown(true); values.push(...durations); }
  }
  if (!values.length || new Set(values).size !== 1 || !Number.isInteger(values[0]) || values[0] < 0 || values[0] > 365) return unknown(true);
  return { mentioned: true, warranty_days: values[0], warranty_source: { message_id: message.id, snippet: text } };
}

export function validateWarrantyFact({ days, source, message }) {
  if (!Number.isInteger(days) || days < 0 || days > 365 || !source || source.message_id !== message?.id || typeof source.snippet !== 'string') return false;
  const fact = extractWarrantyFact(message);
  return fact.warranty_days === days && fact.warranty_source?.snippet === source.snippet;
}

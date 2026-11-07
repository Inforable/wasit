// An "included" or "free" cost must be stated positively. Negated wording such as
// "not included", "isn't free", "excluding", "tidak termasuk", "belum termasuk" or
// "ga gratis" is not a free item: the cost stays unknown and the agent asks for it.
const POSITIVE = /\b(?:included|including|free|termasuk|gratis)\b/i;
const NEGATED = /(?:\b(?:not|no|never|without|tidak|tak|tdk|belum|blm|bukan|nggak|ngga|gak|ga|enggak|engga)|n't)\s+(?:[a-z0-9]+\s+){0,2}?(?:included|including|free|termasuk|gratis)\b|\b(?:excluded|excluding|exclude|excludes)\b/i;

export function statesIncluded(text) {
  const value = String(text ?? '');
  return POSITIVE.test(value) && !NEGATED.test(value);
}

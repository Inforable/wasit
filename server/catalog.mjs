const item = (id, label, kind, units, keywords) => Object.freeze({ id, label, kind, units: Object.freeze(units), keywords: Object.freeze(keywords) });
const fee = item('transport', 'Transport', 'fee', ['job'], ['transport', 'ongkos', 'ongkir', 'kunjungan', 'travel fee', 'callout fee']);
const definitions = [
  { id: 'ac_service', label: 'AC service', scope: 'ac_cleaning_inspection', detect: /\bac\b|air[ -]?condition/i, items: [
    item('cuci_ac', 'AC cleaning', 'base', ['unit'], ['cuci ac', 'clean ac', 'ac cleaning', 'cleaning ac', 'jasa ac', 'servis ac', 'service ac', 'cuci']),
    item('cek_freon', 'Refrigerant check', 'included', ['service'], ['cek freon', 'check freon', 'refrigerant check', 'pemeriksaan freon']),
    item('isi_freon', 'Refrigerant refill', 'addon', ['service'], ['isi freon', 'tambah freon', 'refrigerant refill', 'freon refill']),
    item('ganti_kapasitor', 'Capacitor replacement', 'addon', ['pcs'], ['ganti kapasitor', 'kapasitor', 'capacitor']),
  ] },
  { id: 'washer', label: 'Washing machine service', scope: 'washer_service_inspection', detect: /mesin cuci|washing machine|\bwasher\b/i, items: [
    item('servis_mesin_cuci', 'Washing machine service', 'base', ['unit'], ['servis mesin cuci', 'service mesin cuci', 'washing machine service', 'washer service', 'jasa mesin cuci']),
    item('cek_mesin_cuci', 'Washing machine inspection', 'included', ['service'], ['cek mesin cuci', 'washer inspection', 'washing machine inspection', 'pemeriksaan mesin cuci']),
    item('ganti_dinamo', 'Motor replacement', 'addon', ['pcs'], ['ganti dinamo', 'dinamo', 'motor replacement']),
    item('ganti_belt', 'Belt replacement', 'addon', ['pcs'], ['ganti belt', 'belt', 'sabuk']),
  ] },
  { id: 'plumbing', label: 'Plumbing service', scope: 'plumbing_repair_inspection', detect: /\bpipa\b|\bkran\b|\bkeran\b|plumb|ledeng|wastafel|toilet/i, items: [
    item('perbaikan_pipa', 'Plumbing repair', 'base', ['job'], ['perbaikan pipa', 'servis pipa', 'jasa pipa', 'plumbing repair', 'plumbing service']),
    item('cek_kebocoran', 'Leak inspection', 'included', ['service'], ['cek kebocoran', 'pemeriksaan kebocoran', 'leak inspection', 'leak check']),
    item('ganti_pipa', 'Pipe replacement', 'addon', ['pcs'], ['ganti pipa', 'pipe replacement', 'pipa baru']),
    item('ganti_kran', 'Tap replacement', 'addon', ['pcs'], ['ganti kran', 'ganti keran', 'tap replacement', 'faucet']),
  ] },
  { id: 'electrical', label: 'Electrical service', scope: 'electrical_service_inspection', detect: /listrik|electrical|electrician|\bmcb\b|korslet|jeglek/i, items: [
    item('servis_listrik', 'Electrical service', 'base', ['job'], ['servis listrik', 'jasa listrik', 'electrical service', 'electrical repair']),
    item('cek_instalasi', 'Installation inspection', 'included', ['service'], ['cek instalasi', 'installation inspection', 'pemeriksaan instalasi']),
    item('ganti_mcb', 'Circuit breaker replacement', 'addon', ['pcs'], ['ganti mcb', 'mcb', 'circuit breaker']),
    item('ganti_kabel', 'Cable replacement', 'addon', ['pcs'], ['ganti kabel', 'cable replacement', 'kabel']),
  ] },
  { id: 'cleaning', label: 'Home cleaning', scope: 'home_cleaning', detect: /bersih rumah|bersih-bersih|home cleaning|house cleaning|cleaning|\bdebu\b|\bkotor\b/i, items: [
    item('bersih_rumah', 'Home cleaning', 'base', ['job', 'hour', 'm2'], ['bersih rumah', 'home cleaning', 'house cleaning', 'jasa bersih']),
    item('alat_bahan', 'Tools and cleaning supplies', 'included', ['job'], ['alat dan bahan', 'alat bahan', 'tools and supplies', 'cleaning supplies', 'peralatan']),
    item('cuci_sofa', 'Sofa cleaning', 'addon', ['unit'], ['cuci sofa', 'sofa cleaning', 'sofa']),
    item('cuci_kasur', 'Mattress cleaning', 'addon', ['unit'], ['cuci kasur', 'mattress cleaning', 'kasur', 'mattress']),
  ] },
];
const BOOK = new Map(definitions.map((entry) => {
  const items = Object.freeze([...entry.items, fee]);
  const base = items.find((i) => i.kind === 'base').id;
  const included = items.find((i) => i.kind === 'included').id;
  const required = Object.freeze([base, 'transport', included]);
  return [entry.id, Object.freeze({ ...entry, items, baseItem: base, base_item: base, includedItem: included, included_item: included, requiredItems: required, required_items: required })];
}));
export const CATEGORIES = Object.freeze(definitions.map(({ id, label, scope }) => Object.freeze({ id, label, scope })));
export function catalog(category) {
  const result = BOOK.get(category);
  if (!result) throw new RangeError('Unsupported service category.');
  return result;
}
export const baseItem = (category) => catalog(category).baseItem;
export const scopeFor = (category) => catalog(category).scope;
export function detectCategory(text = '') {
  return definitions.find((entry) => entry.detect.test(String(text)))?.id ?? null;
}
export function normalizeItem(category, text = '') {
  const normalized = String(text).toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const items = catalog(category).items;
  const exact = items.find((i) => i.id === text || i.label.toLowerCase() === normalized);
  if (exact) return exact.id;
  const matches = items.flatMap((entry) => entry.keywords.filter((word) => normalized.includes(word)).map((word) => ({ id: entry.id, length: word.length })));
  return matches.sort((a, b) => b.length - a.length)[0]?.id ?? 'other';
}
export function supportedUnits(category, itemCode) {
  return [...(catalog(category).items.find((entry) => entry.id === itemCode)?.units ?? [])];
}

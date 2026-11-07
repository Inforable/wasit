import { CATEGORIES, catalog } from './catalog.mjs';
import { formatRp } from './money.mjs';

export const CONSENT_TEXT = 'This demo provider agrees to receive service requests from Wasit.';
export const PRICE_SEED = 'wasit-demo-v1';
const NAMES = {
  ac_service: ['Dingin Jaya Teknik', 'Sejuk Prima Service', 'Rapi AC Care'],
  washer: ['Putar Jaya Elektronik', 'Bersih Putar Service', 'Rapi Washer Care'],
  plumbing: ['Tirta Ledeng', 'Pipa Prima Service', 'Rapi Plumbing Care'],
  electrical: ['Terang Listrik', 'Arus Prima Service', 'Rapi Electrical Care'],
  cleaning: ['Kinclong Home Care', 'Bersih Prima Home', 'Rapi Home Care'],
};
const BASE = { ac_service: 90000, washer: 150000, plumbing: 120000, electrical: 130000, cleaning: 200000 };
const EXTRA = { ac_service: [220000, 150000], washer: [300000, 120000], plumbing: [100000, 150000], electrical: [160000, 180000], cleaning: [200000, 180000] };
export const PROVIDERS = Object.freeze(CATEGORIES.flatMap(({ id: category }) => ['human', 'script_clear', 'script_detail'].map((persona, index) => Object.freeze({
  id: 'provider_' + category + '_' + persona,
  name: NAMES[category][index], category, channel: 'sim_chat', rating: [4.6, 4.5, 4.4][index],
  jobs_done: [120, 95, 70][index], persona, delay: 0, consent: true,
  pool: 'demo', base_kecamatan: 'Kelapa Gading', radius_km: 40,
  avail: { days: [0, 1, 2, 3, 4, 5, 6], start: 7, end: 21 }, synthetic: true,
}))));
export function seedPrices(provider) {
  const index = ['human', 'script_clear', 'script_detail'].indexOf(provider.persona);
  const base = BASE[provider.category] + [0, 10000, 5000][Math.max(0, index)];
  const addons = Object.fromEntries(catalog(provider.category).items.filter((item) => item.kind === 'addon').map((item, i) => [item.id, EXTRA[provider.category][i]]));
  return { base, floor: base - 5000, transport: provider.persona === 'script_detail' ? null : 20000, addons, warranty_days: 30, includes_item: true, seed_version: PRICE_SEED };
}
/** Demo fixtures only: no claim of verified market supply, ratings or prices. */
export async function seedProviders(store, { now = Date.now } = {}) {
  const timestamp = typeof now === 'function' ? now() : now;
  await store.transaction(async (tx) => {
    for (const p of PROVIDERS) {
      await tx.query('INSERT INTO providers (id,name,category,channel,rating,jobs_done,persona,delay,consent,consent_at,consent_text,pool,base_kecamatan,radius_km,avail_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(id) DO NOTHING',
        [p.id,p.name,p.category,p.channel,p.rating,p.jobs_done,p.persona,p.delay,1,timestamp,CONSENT_TEXT,p.pool,p.base_kecamatan,p.radius_km,JSON.stringify(p.avail)]);
      const prices = seedPrices(p);
      await tx.query('INSERT INTO provider_prices (provider_id,base,floor,transport,addons_json,warranty_days,includes_item,seed_version,updated_by,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(provider_id) DO NOTHING',
        [p.id,prices.base,prices.floor,prices.transport,JSON.stringify(prices.addons),prices.warranty_days,1,PRICE_SEED,'seed',timestamp]);
    }
  });
  return PROVIDERS.length;
}
export function scriptedReply(input, intent, job, prices, options = {}) {
  const provider = input?.provider ?? input;
  const detailKey = input?.provider ? input.detailKey : options.detailKey;
  if (input?.provider) ({ intent, job, prices } = input);
  prices ??= seedPrices(provider);
  if (provider.persona === 'human') return null;
  const book = catalog(job.category);
  const baseLabel = book.items.find((item) => item.id === book.baseItem).label;
  const includedLabel = book.items.find((item) => item.id === book.includedItem).label;
  const unit = book.items.find((item) => item.id === book.baseItem).units[0];
  if (intent === 'counter') return `${baseLabel}: ${job.units} ${unit} at ${formatRp(prices.floor)} per ${unit}. This is my final service price. Transport ${prices.transport == null ? 'has not been quoted' : formatRp(prices.transport) + ' per job'}.`;
  if (intent === 'counter_terms') return 'I can extend the service warranty to 60 days. Please confirm the complete terms before booking.';
  if (intent === 'booking') return 'Thank you. I will review and accept the agreement before the work starts.';
  if (detailKey === 'transport' && prices.transport == null) return 'I need the exact service area before quoting transport. Transport is not free unless I confirm it.';
  const extras = Object.entries(prices.addons ?? {}).map(([id, amount]) => {
    const item = book.items.find((entry) => entry.id === id);
    return amount == null ? item.label + ': price not yet quoted' : item.label + ': 1 ' + item.units[0] + ' at ' + formatRp(amount) + ' per ' + item.units[0] + ', only if needed and approved';
  }).join('. ');
  return `${baseLabel}: ${job.units} ${unit} at ${formatRp(prices.base)} per ${unit}. ${prices.includes_item ? includedLabel + ': 1 ' + book.items.find((item) => item.id === book.includedItem).units[0] + ' included' : includedLabel + ' has not been quoted'}. Transport ${prices.transport == null ? 'depends on the location and has not been quoted' : formatRp(prices.transport) + ' per job'}. Available: ${job.schedule_label}. ${extras}.`;
}

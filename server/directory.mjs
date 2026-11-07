import { HttpError } from './errors.mjs';
import { catalog } from './catalog.mjs';
import { wibParts, wibDate } from './time.mjs';
import { seedProviders, CONSENT_TEXT } from './providers.mjs';

// Approximate demo coordinates [A]; they are not a geocoding or coverage guarantee.
export const AREA_COORDINATES = Object.freeze({
  'Kelapa Gading': [-6.162,106.906], Tebet: [-6.228,106.852], Menteng: [-6.195,106.833],
  'Cempaka Putih': [-6.181,106.868], Gambir: [-6.171,106.816], 'Johar Baru': [-6.183,106.855],
  Kemayoran: [-6.158,106.854], 'Sawah Besar': [-6.155,106.831], Senen: [-6.186,106.844],
  'Tanah Abang': [-6.201,106.811], Cilincing: [-6.129,106.944], Koja: [-6.118,106.906],
  Pademangan: [-6.139,106.848], Penjaringan: [-6.122,106.784], 'Tanjung Priok': [-6.135,106.878],
  Cengkareng: [-6.148,106.727], 'Grogol Petamburan': [-6.165,106.788], Kalideres: [-6.139,106.704],
  'Kebon Jeruk': [-6.195,106.769], Kembangan: [-6.189,106.739], Palmerah: [-6.207,106.795],
  'Taman Sari': [-6.145,106.816], Tambora: [-6.144,106.800], Cakung: [-6.182,106.945],
  Cipayung: [-6.328,106.902], Ciracas: [-6.330,106.872], 'Duren Sawit': [-6.235,106.919],
  Jatinegara: [-6.218,106.877], 'Kramat Jati': [-6.274,106.870], Makasar: [-6.270,106.894],
  Matraman: [-6.203,106.864], 'Pasar Rebo': [-6.325,106.854], 'Pulo Gadung': [-6.185,106.902],
  Cilandak: [-6.293,106.798], Jagakarsa: [-6.334,106.822], 'Kebayoran Baru': [-6.244,106.801],
  'Kebayoran Lama': [-6.249,106.779], 'Mampang Prapatan': [-6.250,106.824], Pancoran: [-6.258,106.843],
  'Pasar Minggu': [-6.291,106.839], Pesanggrahan: [-6.259,106.756], Setiabudi: [-6.218,106.829],
});
const invalid = (message) => new HttpError(400, 'invalid_payload', message);
const parse = (value, fallback) => { try { return typeof value === 'string' ? JSON.parse(value) : value ?? fallback; } catch { return fallback; } };
const time = (now) => typeof now === 'function' ? now() : now;
const money = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000;
function areaName(text) {
  const name = String(text ?? '').trim();
  return Object.keys(AREA_COORDINATES).sort((a,b) => b.length-a.length).find((key) => key.toLowerCase() === name.toLowerCase() || name.toLowerCase().includes(key.toLowerCase())) ?? null;
}
export function distanceKm(from, to) {
  const a = Array.isArray(from) ? from : AREA_COORDINATES[areaName(from)];
  const b = Array.isArray(to) ? to : AREA_COORDINATES[areaName(to)];
  if (!a || !b) return null;
  const rad = (n) => n * Math.PI / 180, dLat = rad(b[0]-a[0]), dLon = rad(b[1]-a[1]);
  const h = Math.sin(dLat/2)**2 + Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dLon/2)**2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0,1-h)));
}
export function validateAvailability(value) {
  if (!value || !Array.isArray(value.days) || !value.days.length || value.days.length > 7 || new Set(value.days).size !== value.days.length
    || value.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
    || !Number.isInteger(value.start) || !Number.isInteger(value.end) || value.start < 0 || value.start > 23 || value.end < 1 || value.end > 24 || value.start >= value.end) throw invalid('Choose valid opening days and hours.');
  return { days: [...value.days].sort(), start: value.start, end: value.end };
}
export function availableFor(avail, window) {
  if (!window || !avail) return false;
  const start = Date.parse(window.start), end = Date.parse(window.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end-start > 8*86400000) return false;
  const first = wibParts(start);
  const midnight = wibDate(first.year,first.month,first.day).getTime();
  for (let day = midnight; day < end; day += 86400000) {
    const p = wibParts(day);
    if (!avail.days.includes(p.weekday)) continue;
    const open = wibDate(p.year,p.month,p.day,avail.start).getTime();
    const close = wibDate(p.year,p.month,p.day,avail.end).getTime();
    if (Math.min(end,close)-Math.max(start,open) >= 3600000) return true;
  }
  return false;
}
export function providerRow(row) {
  if (!row) return null;
  return { ...row, consent: Boolean(row.consent), avail: parse(row.avail_json,{days:[],start:0,end:0}), mode: row.persona === 'human' ? 'human' : 'script', synthetic: row.pool === 'demo' };
}
export function eligibility(provider, job, { scripted = false } = {}) {
  const reasons = [];
  if (!provider.consent) reasons.push('The provider has not agreed to receive requests.');
  if (provider.category !== job.category) reasons.push('This provider does not offer the requested service.');
  const km = distanceKm(provider.base_kecamatan,job.location_label);
  if (!scripted) {
    if (km == null) reasons.push('The service area could not be confirmed.');
    else if (km > Number(provider.radius_km)) reasons.push('The requested area is outside the provider service radius.');
    if (!availableFor(provider.avail,job.time_window)) reasons.push('Opening hours do not overlap the requested time by at least one hour.');
  }
  return { eligible: reasons.length === 0, reasons, km };
}
export async function discover(store, job, { limit = 5, scripted = false } = {}) {
  catalog(job.category);
  if (!Number.isInteger(limit) || limit < 1 || limit > 5) throw invalid('Discovery supports one to five providers.');
  const rows = (await store.query('SELECT * FROM providers WHERE category=$1 ORDER BY rating DESC,id', [job.category])).rows.map(providerRow);
  const providers = [], skipped = [];
  for (const provider of rows) {
    const result = eligibility(provider,job,{scripted});
    if (!result.eligible) skipped.push({ id:provider.id,name:provider.name,reasons:result.reasons });
    else if (providers.length < limit) providers.push({ ...provider, km:result.km });
    else skipped.push({ id:provider.id,name:provider.name,reasons:['The maximum number of providers has already been selected.'] });
  }
  return { providers, skipped };
}
function ownProvider(actor, providerId) {
  if (!actor?.actor_id) throw new HttpError(401,'session_required','Sign in to continue.');
  if (actor.role !== 'provider') throw new HttpError(403,'wrong_role','This action is available to the provider only.');
  if (actor.provider_id !== providerId) throw new HttpError(404,'not_found','The provider profile was not found.');
}
export function createDirectory({ store, now = Date.now } = {}) {
  const getProvider = async (id) => providerRow((await store.query('SELECT * FROM providers WHERE id=$1',[id])).rows[0]);
  async function pricesOf(id) {
    const row = (await store.query('SELECT * FROM provider_prices WHERE provider_id=$1',[id])).rows[0];
    return row ? { ...row, base:Number(row.base),floor:Number(row.floor),transport:row.transport == null?null:Number(row.transport), addons:parse(row.addons_json,{}),warranty_days:Number(row.warranty_days),includes_item:Boolean(row.includes_item),updated_at:Number(row.updated_at) } : null;
  }
  async function updateProfile(providerId,input,actor) {
    ownProvider(actor,providerId);
    const previous = await getProvider(providerId);
    if (!previous) throw new HttpError(404,'not_found','The provider profile was not found.');
    const allowed = new Set(['consent','base_kecamatan','radius_km','avail']);
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !allowed.has(key))) throw invalid('Send only editable business profile fields.');
    if ('consent' in input && typeof input.consent !== 'boolean') throw invalid('Consent must be enabled or disabled explicitly.');
    const base = 'base_kecamatan' in input ? areaName(input.base_kecamatan) : previous.base_kecamatan;
    if (!base) throw invalid('Choose a supported demo service area.');
    const radius = input.radius_km ?? Number(previous.radius_km);
    if (typeof radius !== 'number' || !Number.isFinite(radius) || radius < 1 || radius > 40) throw invalid('The service radius must be from 1 to 40 kilometres.');
    const avail = 'avail' in input ? validateAvailability(input.avail) : previous.avail;
    const consent = 'consent' in input ? input.consent : previous.consent;
    const at = 'consent' in input ? time(now) : previous.consent_at;
    await store.query('UPDATE providers SET consent=$1,consent_at=$2,consent_text=$3,base_kecamatan=$4,radius_km=$5,avail_json=$6 WHERE id=$7',[consent?1:0,at,previous.consent_text??CONSENT_TEXT,base,radius,JSON.stringify(avail),providerId]);
    return getProvider(providerId);
  }
  async function priceList(providerId,actor) {
    ownProvider(actor,providerId);
    const row = await pricesOf(providerId);
    if (!row) throw new HttpError(404,'not_found','The provider price list was not found.');
    const provider = await getProvider(providerId);
    return { ...row, category:provider.category, items:catalog(provider.category).items.map(({id,label,kind,units}) => ({id,label,kind,units})) };
  }
  async function updatePriceList(providerId,input,actor) {
    ownProvider(actor,providerId);
    const provider = await getProvider(providerId), previous = await pricesOf(providerId);
    if (!provider || !previous) throw new HttpError(404,'not_found','The provider price list was not found.');
    const allowed = new Set(['base','floor','transport','addons','warranty_days','includes_item']);
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !allowed.has(key))) throw invalid('Send only editable price-list fields.');
    const next = { ...previous,...input };
    if (!money(next.base) || !money(next.floor) || next.floor > next.base) throw invalid('Service and floor prices must be integer Rupiah, with floor no higher than service price.');
    if (next.transport !== null && !money(next.transport)) throw invalid('Transport must be integer Rupiah or unknown.');
    if (!Number.isInteger(next.warranty_days) || next.warranty_days < 0 || next.warranty_days > 365 || typeof next.includes_item !== 'boolean') throw invalid('Warranty and included-work settings are invalid.');
    const ids = catalog(provider.category).items.filter((entry) => entry.kind === 'addon').map((entry) => entry.id);
    const addons = next.addons;
    if (!addons || typeof addons !== 'object' || Array.isArray(addons) || Object.keys(addons).some((id) => !ids.includes(id))
      || Object.values(addons).some((price) => price !== null && !money(price))) throw invalid('Additional work needs a supported item and an explicit price or unknown value.');
    const values = Object.fromEntries(ids.map((id) => [id,addons[id]??null]));
    await store.query('UPDATE provider_prices SET base=$1,floor=$2,transport=$3,addons_json=$4,warranty_days=$5,includes_item=$6,updated_by=$7,updated_at=$8 WHERE provider_id=$9',[next.base,next.floor,next.transport,JSON.stringify(values),next.warranty_days,next.includes_item?1:0,'provider',time(now),providerId]);
    return priceList(providerId,actor);
  }
  async function readRatings(providerId,actor) {
    ownProvider(actor,providerId);
    if (!await getProvider(providerId)) throw new HttpError(404,'not_found','The provider profile was not found.');
    const rows = (await store.query('SELECT * FROM ratings WHERE provider_id=$1 ORDER BY created_at DESC,deal_id',[providerId])).rows;
    return {
      summary:{count:rows.length,average:rows.length?rows.reduce((sum,row)=>sum+Number(row.stars),0)/rows.length:null},
      reviews:rows.map((row)=>({deal_id:row.deal_id,stars:Number(row.stars),tags:parse(row.tags_json,[]),comment:row.comment??'',reply:row.reply??null,reply_at:row.reply_at==null?null:Number(row.reply_at),created_at:Number(row.created_at)})),
    };
  }
  async function businessFeedback(providerId,actor) {
    ownProvider(actor,providerId);
    const provider=await getProvider(providerId);
    if (!provider) throw new HttpError(404,'not_found','The provider profile was not found.');
    const rows=(await store.query('SELECT q.branch_id,q.version,q.data_json FROM quotes q JOIN branches b ON b.id=q.branch_id WHERE b.provider_id=$1 ORDER BY q.version DESC,q.created_at DESC',[providerId])).rows;
    const seen=new Set(), feedback=[];
    for (const row of rows) {
      if(seen.has(row.branch_id)) continue;
      seen.add(row.branch_id);
      const quote=parse(row.data_json,{}),book=catalog(provider.category),issues=[];
      for(const code of book.requiredItems) {
        const lines=(quote.lines??[]).filter((line)=>line.item_code===code);
        if(lines.length!==1 || !['fixed','included'].includes(lines[0].kind) || !Number.isSafeInteger(lines[0].unit_price)) issues.push({code:'cost_detail',item_code:code,message:'Confirm the item quantity, unit, price and what is included.'});
        else if(!lines[0].source?.message_id || !lines[0].source?.snippet) issues.push({code:'source',item_code:code,message:'State this cost explicitly in your own message.'});
      }
      if(!quote.schedule_label) issues.push({code:'schedule',message:'Confirm the requested appointment slot.'});
      feedback.push({branch_id:row.branch_id,revision:Number(row.version),category:provider.category,scope:book.scope,complete:issues.length===0,issues});
    }
    return {provider_id:providerId,synthetic:provider.synthetic,quotes:feedback,summary:{quoted_branches:feedback.length,complete_quotes:feedback.filter((entry)=>entry.complete).length},guidance:'Clear item prices, transport, included work and a confirmed slot make an offer easier to compare. Optional work requires prior approval.'};
  }
  async function list({ category, fromLocation } = {}) {
    if (category) catalog(category);
    const rows = (await store.query('SELECT * FROM providers'+(category?' WHERE category=$1':'')+' ORDER BY rating DESC,id',category?[category]:[])).rows.map(providerRow);
    return { providers:rows.filter((p) => p.consent).map((p) => ({id:p.id,name:p.name,category:p.category,rating:Number(p.rating),jobs_done:Number(p.jobs_done),mode:p.mode,synthetic:p.synthetic,base_kecamatan:p.base_kecamatan,radius_km:Number(p.radius_km),avail:p.avail,consent_at:p.consent_at,km:distanceKm(p.base_kecamatan,fromLocation)})), hidden:rows.filter((p) => !p.consent).length };
  }
  return { seed:() => seedProviders(store,{now}), discover:(job,options) => discover(store,job,options), list, getProvider, pricesOf, updateProfile, priceList, updatePriceList, readRatings, businessFeedback };
}
export { seedProviders };

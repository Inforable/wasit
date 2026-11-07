import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { openStore } from './store.mjs';
import { createAppHandler, reply } from './http.mjs';
import { HttpError } from './errors.mjs';
import { createAuth } from './auth.mjs';
import { createAccounts } from './accounts.mjs';
import { createDirectory } from './directory.mjs';
import { createCommunications } from './communications.mjs';
import { createQuoteService } from './quote-service.mjs';
import { createAgreements } from './agreements.mjs';
import { createLifecycle } from './lifecycle.mjs';
import { createRequests } from './requests.mjs';
import { createValidator } from './contracts.mjs';
import { CATEGORIES, catalog } from './catalog.mjs';
import { demoScenarios, demoInput } from './demo.mjs';
import { planningScenarios, referenceFor } from './reference-prices.mjs';
import { createAgentRuntime } from './agents/index.mjs';
import { createBudgetedFetch } from './model-budget.mjs';

const fail = (status, code, message) => new HttpError(status, code, message);
const parse = value => value == null ? null : JSON.parse(value);
const health = () => {
  const models=Object.fromEntries(['buyer','extractor','provider','formatter','support'].map(role=>[role,process.env['OPENAI_MODEL_'+role.toUpperCase()]??process.env.OPENAI_MODEL??null]));
  const enabled=!!process.env.OPENAI_API_KEY&&Object.values(models).some(Boolean);
  return {ok:true,ai_mode:enabled?'AI available - rules fallback':'Offline - rules',models:enabled?models:null};
};

export async function createBackend(options = {}) {
  const store = options.store ?? await openStore({ sqliteFile: resolve(process.cwd(), process.env.WASIT_DB ?? 'data/wasit.sqlite') });
  const now = options.now ?? Date.now;
  const validate = await createValidator();
  const agents = options.agents ?? await createAgentRuntime({store,now,fetchImpl:createBudgetedFetch({store,now})});
  const body = (name, input) => validate('api.schema.json#/$defs/' + name, input);
  const auth = createAuth({ store, now, ...options.auth });
  const accounts = createAccounts({store,auth,now});
  const directory = createDirectory({ store, now });
  await directory.seed();
  const communications = createCommunications({ store, now, mintToken: auth.mintProviderGrant });
  const quotes = createQuoteService({ store, now, extractor: agents.extractor });
  const agreements = createAgreements({ store, now });
  const lifecycle = createLifecycle({ store, now });
  const requests = createRequests({ store, now, directory, communications, quotes, auth, agreements, lifecycle,
    ...(agents.formatter ? { formatter: agents.formatter } : {}),
    providerReply: agents.provider ?? null, llm: agents.buyer ?? null });
  const first = async (sql, params = []) => (await store.query(sql, params)).rows[0] ?? null;
  const referenceBook = JSON.parse(await readFile(new URL('../data/reference-price-book.json',import.meta.url),'utf-8'));
  const consumer = (req, mutation = false) => auth.requireConsumer(req, { mutation });
  const ownedRequest = (req, id, mutation = false) => auth.ownRequest(req, id, { mutation });
  const ownedDeal = (req, id, mutation = false) => auth.ownDeal(req, id, { mutation });
  async function dealView(id, actor) {
    const deal = await agreements.getDeal(id, actor);
    deal.lifecycle = await lifecycle.view(id, actor);
    const provider = await first('SELECT p.pool,b.mode FROM branches b JOIN providers p ON p.id=b.provider_id WHERE b.id=$1', [deal.branch_id]);
    deal.demo_provider = provider?.pool === 'demo' && provider.mode !== 'human';
    return deal;
  }
  async function snapshotView(value, actor) {
    if (value.deal) value.deal = await dealView(value.deal.id, actor);
    return value;
  }
  async function providerView(branchId, actor) {
    const value = await communications.providerSnapshot(branchId, actor);
    const deal = await first('SELECT id FROM deals WHERE branch_id=$1', [branchId]);
    value.lifecycle = deal ? await lifecycle.view(deal.id, actor) : null;
    return value;
  }
  async function providerContext(req, branchId) {
    const actor = await auth.requireProvider(req, branchId);
    const row = await first('SELECT id FROM deals WHERE branch_id=$1', [branchId]);
    if (!row) throw fail(409, 'agreement_required', 'Select and submit an agreement before continuing.');
    return { actor, dealId: row.id };
  }
  const routes = [...auth.routes,...accounts.routes];
  const add = (method, pattern, fn) => routes.push([method, pattern, fn]);
  add('GET', /^\/api\/catalog$/, () => ({ categories: CATEGORIES.map(entry => catalog(entry.id)) }));
  add('GET', /^\/api\/reference-prices$/, ({url}) => referenceFor(referenceBook,Object.fromEntries(['category','item_code','unit','scope'].map(key=>[key,url.searchParams.get(key)]))));
  add('GET', /^\/api\/providers$/, ({url}) => directory.list({ category:url.searchParams.get('category') || undefined, fromLocation:url.searchParams.get('location') }));
  add('GET', /^\/api\/requests$/, async ({req}) => {
    const actor = await consumer(req);
    return { requests:(await store.query('SELECT r.id,r.status,r.request_text,r.job_json,r.created_at,d.id AS deal_id,d.active_version_id,av.terms_json FROM requests r LEFT JOIN deals d ON d.request_id=r.id LEFT JOIN agreement_versions av ON av.id=d.active_version_id WHERE r.user_id=$1 AND r.archived_at IS NULL ORDER BY r.created_at DESC,r.id', [actor.actor_id])).rows.map(row=>{
      const job=parse(row.job_json),terms=parse(row.terms_json);
      return {id:row.id,status:row.active_version_id?'locked':row.status,request_text:row.request_text,created_at:Number(row.created_at),category:job?.category??null,location_label:job?.location_label??null,schedule_label:job?.schedule_label??null,deal_id:row.deal_id??null,active_version_id:row.active_version_id??null,committed_total:terms?.committed_total??null};
    }) };
  });
  add('POST', /^\/api\/requests$/, async ({req,body:input}) => {
    body('create_request',input); const actor = await consumer(req,true);
    return reply(201,await requests.create(input,actor));
  });
  add('GET', /^\/api\/requests\/([^/]+)$/, async ({req,params:[id]}) => {
    const actor = await ownedRequest(req,id); return snapshotView(await requests.snapshot(id,actor),actor);
  });
  for (const [action,selector,run] of [
    ['clarify','clarify',(id,input,actor)=>requests.clarify(id,input,actor)],
    ['process','process',(id,input,actor)=>requests.process(id,actor,{maxSteps:input.max_steps??2})],
    ['finish','empty',(id,input,actor)=>requests.finish(id,actor)],
  ]) add('POST',new RegExp('^/api/requests/([^/]+)/'+action+'$'),async ({req,params:[id],body:input}) => {
    body(selector,input);const actor=await ownedRequest(req,id,true);
    return snapshotView(await run(id,input,actor),actor);
  });
  for (const action of ['takeover','say']) add('POST',new RegExp('^/api/requests/([^/]+)/branches/([^/]+)/'+action+'$'),async ({req,params:[id,branch],body:input}) => {
    body(action,input); const actor=await ownedRequest(req,id,true);
    return snapshotView(await requests[action](id,branch,input,actor),actor);
  });
  add('POST', /^\/api\/requests\/([^/]+)\/deals$/,async ({req,params:[id],body:input}) => {
    body('create_deal',input);const actor=await ownedRequest(req,id,true);
    const deal=await agreements.createDeal({requestId:id,branchId:input.branch_id,quoteRevision:input.quote_revision,actor});
    return reply(201,await dealView(deal.id,actor));
  });
  add('GET', /^\/api\/deals\/([^/]+)$/,async ({req,params:[id]}) => dealView(id,await ownedDeal(req,id)));
  for (const [action,selector,method] of [
    ['submit','submit_version','submit'],['accept','accept_version','accept'],['reject','reject_version','reject'],['changes','propose_change','proposeChange'],
  ]) add('POST',new RegExp('^/api/deals/([^/]+)/'+action+'$'),async ({req,params:[id],body:input}) => {
    body(selector,input);const actor=await ownedDeal(req,id,true);
    await agreements[method](id,input,actor); return dealView(id,actor);
  });
  add('POST', /^\/api\/deals\/([^/]+)\/bill-checks$/,async ({req,params:[id],body:input}) => {
    body('check_bill',input);const actor=await ownedDeal(req,id,true);return reply(201,await agreements.checkBill(id,input,actor));
  });
  add('GET', /^\/api\/deals\/([^/]+)\/bill-checks$/,async ({req,params:[id]}) => {
    await ownedDeal(req,id);
    return { checks:(await store.query('SELECT * FROM bill_checks WHERE deal_id=$1 ORDER BY created_at DESC,id',[id])).rows.map(row=>({
      id:row.id,deal_id:id,version_id:row.version_id,lines:parse(row.lines_json),results:parse(row.results_json),submitted_total:Number(row.submitted_total),created_at:Number(row.created_at),
    })) };
  });
  add('POST', /^\/api\/deals\/([^/]+)\/bill-preview$/,async ({req,params:[id],body:input}) => {
    body('bill_preview',input);const actor=await ownedDeal(req,id,true);const deal=await dealView(id,actor);
    if(deal.active_version_id!==input.expected_active_version_id)throw fail(409,'stale_version','Reload the active agreement before reading a bill.');
    if(!agents.billPreview)throw fail(503,'bill_reader_unavailable','Image reading is unavailable. Enter the bill items manually and confirm each amount.');
    const request = await first('SELECT job_json FROM requests WHERE id=$1',[deal.request_id]);
    return agents.billPreview({...input,category:parse(request?.job_json)?.category,terms:deal.versions.find(version=>version.id===deal.active_version_id)?.terms});
  });
  add('GET', /^\/api\/requests\/([^/]+)\/planning$/,async ({req,params:[id]}) => {
    const actor=await ownedRequest(req,id),snapshot=await requests.snapshot(id,actor);
    return {scenarios:snapshot.branches.filter(branch=>branch.quote).map(branch=>planningScenarios(branch.quote))};
  });
  for (const [action,selector,method] of [
    ['pay','lifecycle_mutation','pay'],['confirm-done','lifecycle_mutation','confirmDone'],['disputes','open_dispute','openDispute'],
    ['evidence','evidence','addEvidence'],['reviews','review','rate'],
  ]) add('POST',new RegExp('^/api/deals/([^/]+)/'+action+'$'),async ({req,params:[id],body:input}) => {
    body(selector,input);const actor=await ownedDeal(req,id,true);await lifecycle[method](id,input,actor);return dealView(id,actor);
  });
  add('GET', /^\/api\/provider\/([^/]+)$/,async ({req,params:[branch]}) => providerView(branch,await auth.requireProvider(req,branch)));
  add('POST', /^\/api\/provider\/([^/]+)\/messages$/,async ({req,params:[branch],body:input}) => {
    body('provider_message',input);const actor=await auth.requireProvider(req,branch);
    await requests.receiveProviderMessage(branch,input,actor);return providerView(branch,actor);
  });
  for (const [action,selector,method,service] of [
    ['accept','accept_version','accept',agreements],['reject','reject_version','reject',agreements],
    ['done','lifecycle_mutation','markDone',lifecycle],['disputes/respond','respond_dispute','respondDispute',lifecycle],
    ['evidence','evidence','addEvidence',lifecycle],['reviews/reply','reply_review','replyReview',lifecycle],
  ]) add('POST',new RegExp('^/api/provider/([^/]+)/'+action+'$'),async ({req,params:[branch],body:input}) => {
    body(selector,input);const {actor,dealId}=await providerContext(req,branch);
    await service[method](dealId,input,actor);return providerView(branch,actor);
  });
  for (const section of ['profile','prices','ratings','feedback']) {
    add('GET',new RegExp('^/api/provider/([^/]+)/'+section+'$'),async ({req,params:[branch]}) => {
      const actor=await auth.requireProvider(req,branch);
      if(section==='profile')return directory.getProvider(actor.provider_id);
      return directory[section==='prices'?'priceList':section==='ratings'?'readRatings':'businessFeedback'](actor.provider_id,actor);
    });
    if(['profile','prices'].includes(section))add('PUT',new RegExp('^/api/provider/([^/]+)/'+section+'$'),async ({req,params:[branch],body:input}) => {
      body(section,input);const actor=await auth.requireProvider(req,branch);
      return directory[section==='profile'?'updateProfile':'updatePriceList'](actor.provider_id,input,actor);
    });
  }
  add('GET', /^\/api\/demo\/scenarios$/,()=>({scenarios:demoScenarios}));
  add('POST', /^\/api\/demo\/scenarios\/([^/]+)$/,async ({req,params:[key],body:input}) => {
    body('empty',input);const actor=await consumer(req,true);return reply(201,await requests.create(demoInput(key),actor));
  });
  add('POST', /^\/api\/demo\/reset$/,async ({req,body:input}) => {
    body('reset',input);return requests.reset(await consumer(req,true));
  });
  add('POST', /^\/api\/demo\/deals\/([^/]+)\/provider-action$/,async ({req,params:[id],body:input}) => {
    body('demo_provider_action',input);const owner=await ownedDeal(req,id,true);
    const branch=await first('SELECT b.*,p.pool FROM branches b JOIN providers p ON p.id=b.provider_id WHERE b.id=$1',[owner.deal.branch_id]);
    if(!branch || branch.pool!=='demo'||branch.mode==='human')throw fail(403,'wrong_role','Use the separate provider link for a human provider.');
    const actor={role:'provider',actor_id:branch.provider_id,provider_id:branch.provider_id,branch_id:branch.id,internal:true};
    const actions={accept:['accept_version',agreements,'accept'],reject:['reject_version',agreements,'reject'],done:['lifecycle_mutation',lifecycle,'markDone'],respond_dispute:['respond_dispute',lifecycle,'respondDispute'],reply_review:['reply_review',lifecycle,'replyReview']};
    const [selector,service,method]=actions[input.action];body(selector,input.payload);
    await service[method](id,input.payload,actor);return dealView(id,owner);
  });
  return {store,auth,accounts,directory,communications,quotes,agreements,lifecycle,requests,agents,routes,health,close:()=>store.close()};
}

// Business services are initialized only for recognized routes; health remains available during configuration.
export function createRuntimeHandler(options = {}) {
  let backendPromise;
  const backend = () => backendPromise ??= createBackend(options).catch(error => { backendPromise=undefined;throw error; });
  const authPaths = [
    ['POST',/^\/api\/demo\/session$/],['GET',/^\/api\/auth\/me$/],['POST',/^\/api\/auth\/logout$/],
    ['GET',/^\/api\/requests\/([^/]+)\/branches\/([^/]+)\/link$/],['POST',/^\/api\/requests\/([^/]+)\/branches\/([^/]+)\/link$/],
  ];
  const paths = [
    ...authPaths,['POST',/^\/api\/auth\/(register|login)$/],['GET',/^\/api\/profile$/],['PUT',/^\/api\/profile$/],['GET',/^\/api\/catalog$/],['GET',/^\/api\/reference-prices$/],['GET',/^\/api\/providers$/],['GET',/^\/api\/requests$/],['POST',/^\/api\/requests$/],
    ['GET',/^\/api\/requests\/([^/]+)$/],['POST',/^\/api\/requests\/([^/]+)\/(clarify|process|finish|deals)$/],
    ['POST',/^\/api\/requests\/([^/]+)\/branches\/([^/]+)\/(takeover|say)$/],
    ['GET',/^\/api\/requests\/([^/]+)\/planning$/],['GET',/^\/api\/deals\/([^/]+)$/],
    ['GET',/^\/api\/deals\/([^/]+)\/bill-checks$/],
    ['POST',/^\/api\/deals\/([^/]+)\/(submit|accept|reject|changes|bill-checks|bill-preview|pay|confirm-done|disputes|evidence|reviews)$/],
    ['GET',/^\/api\/provider\/([^/]+)(?:\/(profile|prices|ratings|feedback))?$/],
    ['POST',/^\/api\/provider\/([^/]+)\/(messages|accept|reject|done|disputes\/respond|evidence|reviews\/reply)$/],
    ['PUT',/^\/api\/provider\/([^/]+)\/(profile|prices)$/],['GET',/^\/api\/demo\/scenarios$/],
    ['POST',/^\/api\/demo\/scenarios\/([^/]+)$/],['POST',/^\/api\/demo\/reset$/],
    ['POST',/^\/api\/demo\/deals\/([^/]+)\/provider-action$/],
  ];
  return createAppHandler({distDir:options.distDir??resolve(process.cwd(),'dist'),health,routes:paths.map(([method,pattern])=>[method,pattern,async ctx=>{
    const app=await backend();
    const route=app.routes.find(([verb,re])=>verb===method&&re.test(ctx.url.pathname));
    if(!route)throw fail(404,'not_found','This API endpoint is not available.');
    return route[2]({...ctx,params:ctx.url.pathname.match(route[1]).slice(1)});
  }])});
}

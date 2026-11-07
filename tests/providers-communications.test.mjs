import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../server/store.mjs';
import { createDirectory, availableFor, distanceKm } from '../server/directory.mjs';
import { PROVIDERS, scriptedReply } from '../server/providers.mjs';
import { createCommunications, rfqText } from '../server/communications.mjs';
import { formatRequest } from '../server/formatter.mjs';
import { createContractValidator, readFixture } from '../scripts/contracts.mjs';

const NOW=Date.parse('2026-11-06T03:00:00Z');
const validate=await createContractValidator();
const owner={role:'consumer',actor_id:'consumer_owner01'};
const job=()=>formatRequest({request_text:'AC Sabtu pagi, maksimal Rp250rb',location_label:'Kelapa Gading'},{now:NOW,id:'request_contact01'}).job;
const actorFor=(id)=>({role:'provider',actor_id:'actor_'+id,provider_id:id});
async function setup(t) {
 const store=await openStore({sqliteFile:':memory:',production:false});
 t.after(()=>store.close());
 const directory=createDirectory({store,now:()=>NOW});
 await directory.seed();
 return {store,directory};
}
async function requestAndBranches(store,directory) {
 const request=job();
 await store.query('INSERT INTO requests (id,user_id,job_json,request_text,status,created_at) VALUES ($1,$2,$3,$4,$5,$6)',[request.id,owner.actor_id,JSON.stringify(request),request.request_text,'contacting',NOW]);
 let id=0;const communications=createCommunications({store,now:()=>NOW,newId:(prefix)=>prefix+'_'+String(++id).padStart(10,'0')});
 const discovery=await directory.discover(request);
 const branches=await communications.createBranches(request.id,request,discovery.providers);
 return {request,communications,branches};
}
test('synthetic seeds are idempotent and preserve provider-owned consent and prices',async(t)=>{
 const {store,directory}=await setup(t);
 assert.equal(PROVIDERS.length,15);
 assert.equal((await store.query('SELECT COUNT(*) AS n FROM providers')).rows[0].n,15);
 const provider=PROVIDERS[0],actor=actorFor(provider.id);
 await directory.updateProfile(provider.id,{consent:false,radius_km:12},actor);
 await directory.updatePriceList(provider.id,{base:88000,floor:80000,transport:null},actor);
 await directory.seed();
 const profile=await directory.getProvider(provider.id),prices=await directory.priceList(provider.id,actor);
 assert.equal(profile.consent,false);assert.equal(profile.radius_km,12);
 assert.equal(prices.base,88000);assert.equal(prices.floor,80000);assert.equal(prices.transport,null);
});
test('discovery checks consent, service radius and opening hours; scripted selection still honors consent',async(t)=>{
 const {directory}=await setup(t),request=job();
 const ac=PROVIDERS.filter(p=>p.category==='ac_service');
 await directory.updateProfile(ac[0].id,{consent:false},actorFor(ac[0].id));
 await directory.updateProfile(ac[1].id,{base_kecamatan:'Cengkareng',radius_km:1},actorFor(ac[1].id));
 await directory.updateProfile(ac[2].id,{avail:{days:[6],start:18,end:21}},actorFor(ac[2].id));
 const normal=await directory.discover(request);
 assert.equal(normal.providers.length,0);assert.equal(normal.skipped.length,3);
 assert.ok(normal.skipped.some(p=>p.reasons.some(r=>r.includes('agreed'))));
 assert.ok(normal.skipped.some(p=>p.reasons.some(r=>r.includes('radius'))));
 assert.ok(normal.skipped.some(p=>p.reasons.some(r=>r.includes('hours'))));
 const scripted=await directory.discover(request,{scripted:true});
 assert.equal(scripted.providers.length,2);
 assert.ok(!scripted.providers.some(p=>p.id===ac[0].id));
});
test('public directory exposes contact settings, never private floor prices or raw records',async(t)=>{
 const {directory}=await setup(t);
 const result=await directory.list({category:'ac_service',fromLocation:'Tebet'});
 assert.equal(result.providers.length,3);
 for(const p of result.providers){assert.equal(p.floor,undefined);assert.equal(p.addons_json,undefined);assert.equal(p.consent_text,undefined);assert.ok(p.synthetic);assert.equal(typeof p.km,'number');}
 assert.ok(distanceKm('Cengkareng','Kelapa Gading')>10);
 assert.equal(distanceKm('Unknown area','Tebet'),null);
 assert.equal(availableFor({days:[6],start:8,end:12},{start:'2026-11-06T16:00:00Z',end:'2026-11-07T03:00:00Z'}),true);
});
test('profile and price-list mutations enforce ownership and meaningful input validation',async(t)=>{
 const {directory}=await setup(t),p=PROVIDERS[0],actor=actorFor(p.id);
 await assert.rejects(directory.updateProfile(p.id,{consent:false},owner),e=>e.status===403);
 await assert.rejects(directory.updateProfile(p.id,{consent:false},actorFor(PROVIDERS[1].id)),e=>e.status===404);
 await assert.rejects(directory.updateProfile(p.id,{radius_km:41},actor),e=>e.status===400);
 await assert.rejects(directory.updateProfile(p.id,{avail:{days:[6,6],start:8,end:12}},actor),e=>e.status===400);
 await assert.rejects(directory.updatePriceList(p.id,{base:10,floor:20},actor),e=>e.status===400);
 await assert.rejects(directory.updatePriceList(p.id,{addons:{invented_item:1000}},actor),e=>e.status===400);
 await assert.rejects(directory.updatePriceList(p.id,{transport:-1},actor),e=>e.status===400);
 const changed=await directory.updatePriceList(p.id,{addons:{isi_freon:null,ganti_kapasitor:160000}},actor);
 assert.equal(changed.addons.isi_freon,null);assert.equal(changed.addons.ganti_kapasitor,160000);
});
test('branch creation is idempotent and rechecks revoked consent in a transaction',async(t)=>{
 const {store,directory}=await setup(t),{request,communications,branches}=await requestAndBranches(store,directory);
 assert.equal(branches.length,3);
 const providers=(await directory.discover(request)).providers;
 const replay=await communications.createBranches(request.id,request,providers);
 assert.deepEqual(replay.map(b=>b.id),branches.map(b=>b.id));
 assert.equal((await store.query('SELECT COUNT(*) AS n FROM branches')).rows[0].n,3);
 const selected=providers[0];
 await directory.updateProfile(selected.id,{consent:false},actorFor(selected.id));
 await assert.rejects(communications.createBranches(request.id,request,[selected]),e=>e.status===409);
});
test('provider messages are branch-bound, source-readable and idempotent with stable client IDs',async(t)=>{
 const {store,directory}=await setup(t),{communications,branches}=await requestAndBranches(store,directory);
 const human=branches.find(b=>b.mode==='human');
 const actor={role:'provider',actor_id:'provider_person01',branch_id:human.id,provider_id:human.provider_id};
 const input={branchId:human.id,actor,text:'Cuci AC Rp90.000, transport Rp20.000.',clientMessageId:'client_message01',engine:'model',intent:'customer'};
 const first=await communications.appendMessage(input);
 assert.equal(first.replayed,false);assert.equal(first.message.sender,'provider');assert.equal(first.message.engine,null);
 validate('common.schema.json#/$defs/message',first.message);
 const replay=await communications.appendMessage(input);
 assert.equal(replay.replayed,true);assert.equal(replay.message.id,first.message.id);
 await assert.rejects(communications.appendMessage({...input,text:'A different quote'}),e=>e.status===409);
 await assert.rejects(communications.appendMessage({...input,clientMessageId:'client_message02',actor:{...actor,branch_id:branches.find(b=>b.id!==human.id).id}}),e=>e.status===403);
 assert.equal((await communications.messages(human.id)).length,1);
 assert.deepEqual(await communications.sourceMessage(first.message.id),first.message);
 await store.query("UPDATE branches SET status='closed' WHERE id=$1",[human.id]);
 const late=await communications.appendMessage({...input,clientMessageId:'client_message03',text:'Capacitor replacement Rp150.000 per pcs, only if approved.'});
 assert.equal(late.replayed,false);
 assert.equal((await store.query('SELECT status FROM branches WHERE id=$1',[human.id])).rows[0].status,'processing');
 assert.ok(late.message.created_at>first.message.created_at);
});
test('customer takeover controls outgoing chat while human inbound remains available',async(t)=>{
 const {store,directory}=await setup(t),{communications,branches}=await requestAndBranches(store,directory);
 const branch=branches[0];
 const input={branchId:branch.id,actor:owner,text:'The AC brand is Example.',clientMessageId:'client_customer01'};
 await assert.rejects(communications.appendMessage(input),e=>e.status===409);
 await store.query("UPDATE branches SET wasit_mode='customer' WHERE id=$1",[branch.id]);
 const written=await communications.appendMessage(input);
 assert.equal(written.message.sender,'consumer');
 await assert.rejects(communications.appendAgentMessage({branchId:branch.id,text:'Automatic counter',intent:'counter'}),e=>e.status===409);
 await store.query("UPDATE branches SET wasit_mode='agent' WHERE id=$1",[branch.id]);
 assert.equal((await communications.appendMessage(input)).replayed,true);
 await assert.rejects(communications.providerSnapshot(branch.id,{role:'consumer',actor_id:'consumer_other01'}),e=>e.status===404);
});
test('provider snapshot deeply projects only its branch and public agreement versions',async(t)=>{
 const {store,directory}=await setup(t),{communications,branches}=await requestAndBranches(store,directory);
 const branch=branches[0],actor={role:'provider',actor_id:'actor_provider01',branch_id:branch.id,provider_id:branch.provider_id};
 const fixture=await readFixture('deal-locked.json');
 const privateDeal={...fixture,branch_id:branch.id};
 privateDeal.versions[0].terms.lines[0].spending_limit=12345;
 privateDeal.versions[0].terms.lines[0].actor_id='consumer_secret01';
 await store.query('INSERT INTO deals (id,request_id,branch_id) VALUES ($1,$2,$3)',[privateDeal.id,'request_contact01',branch.id]);
 const projected=createCommunications({store,getDeal:async()=>privateDeal});
 const snapshot=await projected.providerSnapshot(branch.id,actor);
 validate('common.schema.json#/$defs/provider_snapshot',snapshot);
 const forbidden=new Set(['spending_limit','max_budget','target_price','budget_ack_limit','actor_id','events','token','csrf_token']);
 function inspect(value){if(!value||typeof value!=='object')return;for(const [key,child] of Object.entries(value)){assert.ok(!forbidden.has(key),key);inspect(child);}}
 inspect(snapshot);
 assert.equal(snapshot.versions[0].consumer_accepted,true);
 assert.equal(snapshot.versions[0].provider_accepted,true);
 assert.equal(snapshot.job_public.request_text,undefined);
 assert.equal(snapshot.messages.length,0);
 await assert.rejects(communications.providerSnapshot(branch.id,{...actor,branch_id:'branch_other01'}),e=>e.status===403);
});
test('RFQ omits private request text/budget and scripted reply remains explicitly provider-priced',async(t)=>{
 const {directory}=await setup(t),request={...job(),request_text:'Customer Secret Name maximum 250000'};
 const text=rfqText(request);
 assert.ok(!text.includes('250000'));assert.ok(!text.includes('Secret Name'));
 assert.match(text,/Kelapa Gading/);
 const provider=await directory.getProvider('provider_ac_service_script_clear');
 const prices=await directory.pricesOf(provider.id);
 const reply=scriptedReply(provider,'rfq',request,prices);
 assert.match(reply,/Rp100\.000/);
 assert.match(reply,/optional|only if needed and approved/i);
 assert.equal(scriptedReply(await directory.getProvider('provider_ac_service_human'),'rfq',request),null);
});

test('all seeded scripted baseline replies retain source-verifiable quantities and prices',async(t)=>{
 const {directory}=await setup(t);
 const {extractQuotedFacts,validateQuotedFacts}=await import('../server/quote-service.mjs');
 const {CATEGORIES,catalog}=await import('../server/catalog.mjs');
 for(const {id:category,scope} of CATEGORIES){
  const request={...job(),category,scope,units:2};
  const provider=await directory.getProvider('provider_'+category+'_script_clear');
  const prices=await directory.pricesOf(provider.id);
  const text=scriptedReply({provider,job:request,intent:'rfq',prices});
  const message={id:'msg_scripted01',text};
  const facts=extractQuotedFacts({message,job:request});
  const checked=validateQuotedFacts({extraction:facts,message,job:request});
  assert.equal(checked.schedule_label,request.schedule_label);
  assert.equal(checked.rejected.length,0);
  for(const code of catalog(category).requiredItems){
   const line=checked.lines.find(line=>line.item_code===code);
   assert.ok(line,category+': '+code);
   assert.ok(['fixed','included'].includes(line.kind),category+': '+code+': '+line.kind);
  }
  assert.equal(checked.lines.find(line=>line.item_code===catalog(category).baseItem).quantity,2);
  const counter=scriptedReply({provider,job:request,intent:'counter',prices});
  const counterMessage={id:'msg_counter01',text:counter};
  const counterFacts=extractQuotedFacts({message:counterMessage,job:request});
  assert.equal(counterFacts.lines.find(line=>line.item_code===catalog(category).baseItem).unit_price,prices.floor);
 }
});

test('archived generations and expired or foreign task leases cannot append messages',async(t)=>{
 const {store,directory}=await setup(t),{communications,branches}=await requestAndBranches(store,directory);
 const branch=branches[0];
 const input={branchId:branch.id,text:'Service request details.',intent:'rfq',expectedGeneration:0};
 await store.query('INSERT INTO tasks (id,request_id,branch_id,kind,source_key,generation,status,lease_token,lease_until) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', ['task_delivery01',branch.request_id,branch.id,'message','initial',0,'processing','lease_active01',NOW+1000]);
 await assert.rejects(communications.appendAgentMessage({...input,taskId:'task_delivery01',leaseToken:'wrong'}),e=>e.code==='stale_task');
 const result=await communications.appendAgentMessage({...input,taskId:'task_delivery01',leaseToken:'lease_active01'});
 assert.equal(result.replayed,false);
 await store.query('UPDATE tasks SET lease_until=$1 WHERE id=$2',[NOW,'task_delivery01']);
 await assert.rejects(communications.appendAgentMessage({...input,taskId:'task_delivery01',leaseToken:'lease_active01'}),e=>e.code==='stale_task');
 await store.query('UPDATE requests SET generation=1 WHERE id=$1',[branch.request_id]);
 await assert.rejects(communications.appendAgentMessage(input),e=>e.code==='stale_task');
 await store.query('UPDATE requests SET archived_at=$1 WHERE id=$2',[NOW,branch.request_id]);
 await assert.rejects(communications.appendAgentMessage({...input,expectedGeneration:1}),e=>e.code==='stale_task');
 assert.equal((await communications.messages(branch.id)).length,1);
});

test('own ratings and business feedback omit consumer identity, budgets and competitor results',async(t)=>{
 const {store,directory}=await setup(t),{branches}=await requestAndBranches(store,directory);
 const branch=branches[0],actor=actorFor(branch.provider_id);
 await store.query('INSERT INTO ratings (deal_id,user_id,provider_id,stars,tags_json,comment,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',['deal_review001','consumer_secret01',branch.provider_id,5,'["On time"]','Clear service.',NOW]);
 await store.query('INSERT INTO ratings (deal_id,user_id,provider_id,stars,created_at) VALUES ($1,$2,$3,$4,$5)',['deal_other001','consumer_secret02',branches[1].provider_id,1,NOW]);
 const review=await directory.readRatings(branch.provider_id,actor);
 assert.equal(review.summary.count,1);assert.equal(review.summary.average,5);assert.equal(review.reviews[0].user_id,undefined);
 const quote={category:'ac_service',status:'over_budget',max_budget:80000,rank:3,lines:[],schedule_label:null};
 await store.query('INSERT INTO quotes (id,branch_id,request_id,version,data_json,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',['quote_feedback01',branch.id,branch.request_id,1,JSON.stringify(quote),'over_budget',NOW]);
 const feedback=await directory.businessFeedback(branch.provider_id,actor);
 assert.equal(feedback.summary.quoted_branches,1);assert.equal(feedback.quotes[0].complete,false);
 assert.equal(feedback.quotes[0].issues.length,4);
 const output=JSON.stringify(feedback);
 for(const forbidden of ['max_budget','over_budget','rank','consumer_secret','target_price']) assert.ok(!output.includes(forbidden),forbidden);
 await assert.rejects(directory.businessFeedback(branch.provider_id,actorFor(branches[1].provider_id)),e=>e.status===404);
 await assert.rejects(directory.readRatings(branch.provider_id,owner),e=>e.status===403);
});

test('branch creation cannot commit after its request generation is replaced',async(t)=>{
 const {store,directory}=await setup(t),request=job();
 await store.query('INSERT INTO requests (id,user_id,job_json,status,generation) VALUES ($1,$2,$3,$4,$5)',[request.id,owner.actor_id,JSON.stringify(request),'contacting',1]);
 const providers=(await directory.discover(request)).providers;
 const communications=createCommunications({store,now:()=>NOW});
 await assert.rejects(communications.createBranches(request.id,request,providers,{expectedGeneration:0}),e=>e.code==='stale_task');
 assert.equal((await store.query('SELECT COUNT(*) AS n FROM branches')).rows[0].n,0);
 await store.query('UPDATE requests SET archived_at=$1 WHERE id=$2',[NOW,request.id]);
 await assert.rejects(communications.createBranches(request.id,request,providers),e=>e.code==='stale_task');
});

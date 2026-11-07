import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { openStore } from '../server/store.mjs';
import { createBackend } from '../server/app.mjs';
import { createAppHandler } from '../server/http.mjs';
const ORIGIN='http://localhost:5180';
async function setup(t,{transport=20000}={}) {
  const store=await openStore({sqliteFile:':memory:',databaseUrl:'',production:false}),app=await createBackend({store,agents:{},env:{},now:()=>1794012900000,auth:{secret:'non-price-http-tests-private-secret-32-bytes',allowedOrigins:[ORIGIN],publicOrigin:ORIGIN,secure:false}});
  await store.query('UPDATE provider_prices SET transport=$1 WHERE provider_id=$2',[transport,'provider_ac_service_script_clear']);
  const server=createServer(createAppHandler({routes:app.routes,distDir:'dist'})).listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await app.close();});
  const base='http://127.0.0.1:'+server.address().port;let cookie='',csrf='';
  async function send(path,{method='GET',body,token}={}) {
    const response=await fetch(base+path,{method,headers:{Origin:ORIGIN,...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{Cookie:cookie,'X-CSRF-Token':csrf})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const value=await response.json();assert.ok(response.ok,path+' '+response.status+': '+value.message);return {value,response};
  }
  const boot=await send('/api/demo/session',{method:'POST',body:{}});cookie=boot.response.headers.get('set-cookie').split(';')[0];csrf=boot.value.csrf_token;
  const created=await send('/api/requests',{method:'POST',body:{request_text:'Clean 1 AC unit tomorrow morning.',category:'ac_service',location_label:'Kelapa Gading',schedule_label:'Tomorrow morning',max_budget:250000}}),id=created.value.id;
  let snapshot=created.value;
  async function processUntil(predicate){for(let i=0;i<120;i++){snapshot=(await send('/api/requests/'+id+'/process',{method:'POST',body:{max_steps:2}})).value;const found=predicate(snapshot);if(found)return found;}assert.fail('Expected sourced terms were not produced.');}
  async function select(branch){return (await send('/api/requests/'+id+'/deals',{method:'POST',body:{branch_id:branch.id,quote_revision:branch.quote.revision}})).value;}
  async function acceptCustomer(deal){const version=deal.versions.find(value=>value.id===deal.pending_version_id),selectors={version_id:version.id,terms_digest:version.terms_digest,expected_active_version_id:null};await send('/api/deals/'+deal.id+'/submit',{method:'POST',body:selectors});await send('/api/deals/'+deal.id+'/accept',{method:'POST',body:{...selectors,budget_ack_limit:version.terms.spending_limit}});return selectors;}
  return {store,app,send,id,processUntil,select,acceptCustomer,get snapshot(){return snapshot;}};
}

test('HTTP transport negotiation records an actual waiver while preserving the quoted warranty',async t=>{
  const f=await setup(t),branch=await f.processUntil(snapshot=>snapshot.branches.find(branch=>branch.provider_label==='Sejuk Prima Service'&&branch.quote?.status==='ready'&&branch.quote.lines.some(line=>line.item_code==='transport'&&line.unit_price===0)));
  assert.equal(branch.quote.warranty_days,30);const source=branch.messages.find(message=>message.id===branch.quote.warranty_source.message_id);assert.ok(source.text.includes('30 days'));
  assert.ok(branch.messages.some(message=>message.sender==='agent'&&message.text.includes('waive the transport')));assert.ok(!branch.messages.some(message=>message.sender==='provider'&&message.text.includes('60 days')));
  const deal=await f.select(branch);assert.equal(deal.versions[0].terms.warranty_days,30);assert.equal(deal.versions[0].terms.lines.find(line=>line.item_code==='transport').unit_price,0);
  const selectors=await f.acceptCustomer(deal),active=(await f.send('/api/demo/deals/'+deal.id+'/provider-action',{method:'POST',body:{action:'accept',payload:{...selectors,budget_ack_limit:null}}})).value;assert.ok(active.active_version_id);assert.equal(active.versions[0].terms.warranty_days,30);
});
test('HTTP warranty negotiation carries the exact ask through tasks and binds the explicit improvement to the agreement',async t=>{
  const f=await setup(t,{transport:0}),branch=await f.processUntil(snapshot=>snapshot.branches.find(branch=>branch.provider_label==='Sejuk Prima Service'&&branch.quote?.status==='ready'&&branch.quote.warranty_days===60));
  assert.ok(branch.messages.some(message=>message.sender==='agent'&&message.text.includes('improve the quoted warranty')));assert.ok(!branch.messages.some(message=>message.sender==='agent'&&message.text.includes('waive the transport')));
  const source=branch.messages.find(message=>message.id===branch.quote.warranty_source.message_id);assert.equal(source.text,branch.quote.warranty_source.snippet);assert.ok(source.text.includes('60 days'));
  const deal=await f.select(branch),selectors=await f.acceptCustomer(deal),active=(await f.send('/api/demo/deals/'+deal.id+'/provider-action',{method:'POST',body:{action:'accept',payload:{...selectors,budget_ack_limit:null}}})).value;assert.ok(active.active_version_id);assert.equal(active.versions[0].terms.warranty_days,60);assert.deepEqual(active.versions[0].terms.warranty_source,branch.quote.warranty_source);
});
test('HTTP human provider receives its sourced warranty but no private spending limit or other branch data',async t=>{
  const f=await setup(t),human=await f.processUntil(snapshot=>snapshot.branches.find(branch=>branch.mode==='human'));
  const link=(await f.send('/api/requests/'+f.id+'/branches/'+human.id+'/link')).value,token=new URLSearchParams(new URL(link.provider_url).hash.slice(1)).get('token');
  const text='AC cleaning: 1 unit at Rp90.000 per unit. Refrigerant check: 1 service included. Transport: 1 job at Rp20.000 per job. Available: '+f.snapshot.job.schedule_label+'. Service warranty: 60 days for labor only.';
  await f.send('/api/provider/'+human.id+'/messages',{method:'POST',token,body:{client_message_id:'client_warrantyhttp01',text}});
  const quoted=await f.processUntil(snapshot=>snapshot.branches.find(branch=>branch.id===human.id&&branch.quote?.warranty_days===60)),deal=await f.select(quoted),selectors=await f.acceptCustomer(deal);
  const provider=(await f.send('/api/provider/'+human.id,{token})).value,version=provider.versions[0];assert.equal(version.public_terms.warranty_days,60);assert.equal(version.public_terms.warranty_source.snippet,text);assert.equal(version.public_terms.spending_limit,undefined);assert.equal(provider.job_public.max_budget,undefined);
  for(const value of provider.messages)assert.equal(value.branch_id,human.id);
  await f.send('/api/provider/'+human.id+'/accept',{method:'POST',token,body:{...selectors,budget_ack_limit:null}});assert.ok((await f.send('/api/deals/'+deal.id)).value.active_version_id);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { openStore } from '../server/store.mjs';
import { createBackend, createRuntimeHandler } from '../server/app.mjs';
import { createAppHandler } from '../server/http.mjs';
import { createContractValidator } from '../scripts/contracts.mjs';
const validate=await createContractValidator();
const origin='http://localhost:5180';

async function setup(t) {
 const store=await openStore({databaseUrl:'',sqliteFile:':memory:',production:false});
 const app=await createBackend({store,agents:{},now:()=>1794012900000,auth:{secure:false,allowedOrigins:[origin],publicOrigin:origin}});
 const server=createServer(createAppHandler({routes:app.routes,distDir:'dist'})).listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await store.close();});
 const base='http://127.0.0.1:'+server.address().port;
 let cookie='',csrf='';
 const send=async(path,{method='GET',body,token,anonymous=false}={})=>{
  const response=await fetch(base+path,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),
    ...(token?{Authorization:'Bearer '+token}:anonymous?{}:{Cookie:cookie,'X-CSRF-Token':csrf})},...(body?{body:JSON.stringify(body)}:{})});
  const value=await response.json();
  return {status:response.status,value,response};
 };
 const boot=await send('/api/demo/session',{method:'POST',body:{}});
 assert.equal(boot.status,201);
 cookie=boot.response.headers.get('set-cookie').split(';')[0];csrf=boot.value.csrf_token;
 const ok=async(path,options)=>{const result=await send(path,options);assert.ok(result.status<300,JSON.stringify(result.value));return result.value;};
 const post=(path,body={})=>ok(path,{method:'POST',body});
 async function scenario(category) {
  let snapshot=await post('/api/demo/scenarios/'+category);
  for(let i=0;i<65;i++){
   snapshot=await post('/api/requests/'+snapshot.id+'/process',{max_steps:2});
   const tasks=await store.query("SELECT id FROM tasks WHERE request_id=$1 AND status IN ('pending','processing') AND due_at<=$2",[snapshot.id,1794012900000]);
   if(!tasks.rows.length)break;
  }
  validate('snapshot.schema.json',snapshot);
  assert.ok(snapshot.cards.length>0,category+' has no comparable quote');
  return snapshot;
 }
 async function select(snapshot) {
  const quoteId=snapshot.cards[0].quote_id,branch=snapshot.branches.find(b=>b.quote?.id===quoteId);
  assert.ok(branch);
  const deal=await post('/api/requests/'+snapshot.id+'/deals',{branch_id:branch.id,quote_revision:branch.quote.revision});
  validate('deal.schema.json',deal);
  return deal;
 }
 async function activate(deal) {
  const version=deal.versions.find(v=>v.id===deal.pending_version_id);
  const payload={version_id:version.id,terms_digest:version.terms_digest,expected_active_version_id:deal.active_version_id};
  deal=await post('/api/deals/'+deal.id+'/submit',payload);
  deal=await post('/api/deals/'+deal.id+'/accept',{...payload,budget_ack_limit:version.terms.spending_limit});
  assert.notEqual(deal.active_version_id,version.id,'one role cannot activate');
  deal=await post('/api/demo/deals/'+deal.id+'/provider-action',{action:'accept',payload:{...payload,budget_ack_limit:null}});
  assert.equal(deal.active_version_id,version.id);
  validate('deal.schema.json',deal);
  return deal;
 }
 return {app,store,send,ok,post,scenario,select,activate};
}

test('HTTP five-category negotiation produces contract-valid sourced comparison and draft selection',async t=>{
 const f=await setup(t);
 for(const category of ['ac_service','washer','plumbing','electrical','cleaning']){
  await t.test(category,async()=>{const snapshot=await f.scenario(category);const deal=await f.select(snapshot);assert.equal(deal.active_version_id,null);});
 }
});

test('HTTP agreement version2, bill checks and simulated lifecycle remain version-bound',async t=>{
 const f=await setup(t),snapshot=await f.scenario('ac_service');
 let deal=await f.activate(await f.select(snapshot));
 const v1=deal.active_version_id;
 deal=await f.post('/api/deals/'+deal.id+'/pay',{expected_active_version_id:v1});
 assert.equal(deal.lifecycle.status,'paid');
 const quote=snapshot.branches.find(branch=>branch.id===deal.branch_id).quote;
 const optional=quote.lines.find(line=>line.kind==='optional'&&line.unit_price!==null);
 assert.ok(optional);
 const total=deal.versions.find(v=>v.id===v1).terms.committed_total+optional.quantity*optional.unit_price;
 deal=await f.post('/api/deals/'+deal.id+'/changes',{expected_active_version_id:v1,change_message_id:optional.source.message_id,committed_line_ids:[optional.id],spending_limit:total});
 assert.equal(deal.active_version_id,v1);assert.ok(deal.pending_version_id);
 deal=await f.activate(deal);assert.notEqual(deal.active_version_id,v1);
 assert.equal(deal.lifecycle.due,optional.quantity*optional.unit_price);
 const terms=deal.versions.find(v=>v.id===deal.active_version_id).terms;
 const check=await f.post('/api/deals/'+deal.id+'/bill-checks',{expected_active_version_id:deal.active_version_id,lines:terms.lines.filter(line=>line.kind==='committed').map(({id,item_code,label,unit,quantity,unit_price})=>({id,item_code,label,unit,quantity,unit_price,explanation:null}))});
 validate('common.schema.json#/$defs/bill_check',check);
 assert.equal((await f.ok('/api/deals/'+deal.id+'/bill-checks')).checks.length,1);
 const stale=await f.send('/api/deals/'+deal.id+'/confirm-done',{method:'POST',body:{expected_active_version_id:v1}});assert.equal(stale.status,409);
 deal=await f.post('/api/deals/'+deal.id+'/pay',{expected_active_version_id:deal.active_version_id});
 deal=await f.post('/api/demo/deals/'+deal.id+'/provider-action',{action:'done',payload:{expected_active_version_id:deal.active_version_id}});
 deal=await f.post('/api/deals/'+deal.id+'/confirm-done',{expected_active_version_id:deal.active_version_id});
 assert.equal(deal.lifecycle.status,'released');assert.equal(deal.lifecycle.held,0);
 deal=await f.post('/api/deals/'+deal.id+'/reviews',{expected_active_version_id:deal.active_version_id,stars:5,tags:['Agreed price'],comment:'Clear costs.'});
 validate('deal.schema.json',deal);assert.equal(deal.lifecycle.rating.stars,5);
});

test('HTTP provider bearer projections omit private budgets and reset revokes all access',async t=>{
 const f=await setup(t),snapshot=await f.scenario('ac_service');
 const branch=snapshot.branches.find(b=>b.mode==='human');assert.ok(branch);
 const link=await f.ok('/api/requests/'+snapshot.id+'/branches/'+branch.id+'/link');
 const token=new URLSearchParams(new URL(link.provider_url).hash.slice(1)).get('token');
 const provider=await f.ok('/api/provider/'+branch.id,{token});
 validate('common.schema.json#/$defs/provider_snapshot',provider);
 assert.ok(!/max_budget|spending_limit|budget_ack_limit|consumer_/.test(JSON.stringify(provider)));
 const foreign=await f.send('/api/requests/'+snapshot.id,{token});assert.equal(foreign.status,403);
 const forged=await f.send('/api/requests',{method:'POST',body:{request_text:'AC',scripted:true}});assert.equal(forged.status,400);
 const invalid=await f.send('/api/demo/scenarios/ac_service',{method:'POST',body:{role:'provider'}});assert.equal(invalid.status,400);
 await f.post('/api/demo/reset',{confirm:true});
 assert.equal((await f.send('/api/requests/'+snapshot.id)).status,404);
 assert.equal((await f.send('/api/provider/'+branch.id,{token})).status,403);
});

test('runtime health and unknown paths do not initialize unavailable business storage',async t=>{
 const server=createServer(createRuntimeHandler({store:{query:async()=>{throw Error('must not initialize');}}})).listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/api/health')).status,200);
 assert.equal((await fetch(base+'/api/unknown')).status,404);
});

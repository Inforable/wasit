import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {openStore} from '../server/store.mjs';
import {createBackend} from '../server/app.mjs';
import {createAppHandler} from '../server/http.mjs';
import {providerQuestion} from '../server/provider-questions.mjs';

test('only clear requests for customer-only facts become pending questions',()=>{
  for(const text of ['What brand and model is your AC?','Is the unit an inverter?','Could you send a photo of the serial number?','Which floor is it on, and is there elevator access?','What is your maximum budget?','Berapa kapasitas PK AC-nya?','Mohon konfirmasi merek mesin cuci.'])assert.equal(providerQuestion(text),text);
  for(const text of ['Does this price work for you?','Does the inverter-service price work for you?','Can you accept Rp120.000?','Transport depends on the location.','The inverter service costs Rp90.000.','Warranty is 60 days.'])assert.equal(providerQuestion(text),null);
  assert.equal(providerQuestion('Service costs Rp90.000. What brand is the unit?'),'What brand is the unit?');
});
async function setup(t){
  const store=await openStore({sqliteFile:':memory:',databaseUrl:'',production:false});
  const origin='http://localhost:5180',app=await createBackend({store,agents:{},now:()=>1794012900000,auth:{secret:'provider-question-test-session-secret-32bytes',allowedOrigins:[origin],publicOrigin:origin,secure:false}});
  const server=createServer(createAppHandler({routes:app.routes,distDir:'dist'})).listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await app.close();});
  const base='http://127.0.0.1:'+server.address().port;let cookie='',csrf='';
  async function send(path,{method='GET',body,token,status=200}={}){
    const response=await fetch(base+path,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{Cookie:cookie,'X-CSRF-Token':csrf})},...(body?{body:JSON.stringify(body)}:{})});
    const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));
    const set=response.headers.get('set-cookie');if(set&&!token)cookie=set.split(';')[0];if(value?.csrf_token&&!token)csrf=value.csrf_token;
    return value;
  }
  const post=(path,body={},status=200)=>send(path,{method:'POST',body,status});
  await post('/api/demo/session',{},201);
  const created=await post('/api/requests',{request_text:'Clean one AC unit.',category:'ac_service',location_label:'Kelapa Gading',schedule_label:'Tomorrow morning',max_budget:200000},201);
  const initial=await post('/api/requests/'+created.id+'/process',{max_steps:1}),human=initial.branches.find(branch=>branch.mode==='human');
  const link=await send('/api/requests/'+created.id+'/branches/'+human.id+'/link'),token=new URLSearchParams(new URL(link.provider_url).hash.slice(1)).get('token');
  const provider=(text,key)=>send('/api/provider/'+human.id+'/messages',{method:'POST',token,body:{text,client_message_id:key}});
  async function processUntil(predicate,max=50){
    for(let i=0;i<max;i++){const value=await post('/api/requests/'+created.id+'/process',{max_steps:2});if(predicate(value))return value;}
    assert.fail('The requested persisted processing state was not reached.');
  }
  const branch=value=>value.branches.find(row=>row.id===human.id);
  await processUntil(value=>branch(value).messages.some(message=>message.sender==='agent'));
  const quoteText='AC cleaning: 1 unit at Rp90.000 per unit. Refrigerant check: 1 service included. Transport: 1 job at Rp20.000 per job. Capacitor replacement: 1 pcs at Rp150.000 per pcs, only if needed and approved. Available: '+initial.job.schedule_label;
  return {store,app,send,post,created,human,token,provider,processUntil,branch,quoteText};
}
test('HTTP provider question survives takeover, stops guessing and clears only through explicit customer control',async t=>{
  const f=await setup(t);
  await f.provider(f.quoteText,'client_question_quote01');
  let snapshot=await f.processUntil(value=>!!f.branch(value).quote);
  const raw='What brand and model is the AC?';
  await f.provider(raw,'client_question_brand01');
  snapshot=await f.send('/api/requests/'+f.created.id);
  assert.equal(f.branch(snapshot).pending_question,raw);
  assert.equal(f.branch(snapshot).quote.status,'needs_detail');
  assert.ok(f.branch(snapshot).quote.unresolved.includes('scope'));
  const agentBefore=f.branch(snapshot).messages.filter(message=>message.sender==='agent').length;
  snapshot=await f.post('/api/requests/'+f.created.id+'/branches/'+f.human.id+'/takeover',{mode:'customer'});
  assert.equal(f.branch(snapshot).pending_question,raw);
  for(let i=0;i<15;i++)snapshot=await f.post('/api/requests/'+f.created.id+'/process',{max_steps:2});
  assert.equal(f.branch(snapshot).messages.filter(message=>message.sender==='agent').length,agentBefore);
  const view=await f.send('/api/provider/'+f.human.id,{token:f.token});
  assert.equal(view.pending_question,raw);
  assert.equal(JSON.stringify(view).includes('spending_limit'),false);
  snapshot=await f.post('/api/requests/'+f.created.id+'/branches/'+f.human.id+'/say',{text:'It is a Samsung AR12 model.',client_message_id:'client_question_answer01'});
  assert.equal(f.branch(snapshot).pending_question,null);
  const answer=f.branch(snapshot).messages.find(message=>message.sender==='consumer');
  assert.ok(answer);
  assert.ok(f.branch(snapshot).quote.lines.every(line=>line.source.message_id!==answer.id));
  snapshot=await f.post('/api/requests/'+f.created.id+'/branches/'+f.human.id+'/takeover',{mode:'agent'});
  assert.equal(f.branch(snapshot).pending_question,null);
  snapshot=await f.processUntil(value=>f.branch(value).messages.filter(message=>message.sender==='agent').length>agentBefore);
  const resumed=f.branch(snapshot).messages.filter(message=>message.sender==='agent').slice(agentBefore);
  assert.ok(resumed.every(message=>!message.text.includes('Samsung')&&!message.text.includes('AR12')));
  await f.provider(f.quoteText,'client_question_confirm01');
  snapshot=await f.processUntil(value=>f.branch(value).quote.status==='ready');
  assert.equal(f.branch(snapshot).pending_question,null);
  const quote=f.branch(snapshot).quote;
  let deal=await f.post('/api/requests/'+f.created.id+'/deals',{branch_id:f.human.id,quote_revision:quote.revision},201);
  const version=deal.versions[0],body={version_id:version.id,terms_digest:version.terms_digest,expected_active_version_id:null};
  deal=await f.post('/api/deals/'+deal.id+'/submit',body);
  await f.post('/api/deals/'+deal.id+'/accept',{...body,budget_ack_limit:version.terms.spending_limit});
  await f.send('/api/provider/'+f.human.id+'/accept',{method:'POST',token:f.token,body:{...body,budget_ack_limit:null}});
  const locked=await f.send('/api/deals/'+deal.id),terms=JSON.stringify(locked.versions[0].terms);
  const photo='Could you send a photo of the serial number?';
  await f.provider(photo,'client_question_photo01');
  snapshot=await f.post('/api/requests/'+f.created.id+'/branches/'+f.human.id+'/takeover',{mode:'customer'});
  assert.equal(f.branch(snapshot).pending_question,photo);
  const unchanged=await f.send('/api/deals/'+deal.id);
  assert.equal(unchanged.active_version_id,version.id);assert.equal(JSON.stringify(unchanged.versions[0].terms),terms);
  const optional=quote.lines.find(line=>line.kind==='optional');
  await f.post('/api/deals/'+deal.id+'/changes',{expected_active_version_id:version.id,change_message_id:optional.source.message_id,committed_line_ids:[optional.id],spending_limit:300000},409);
  snapshot=await f.post('/api/requests/'+f.created.id+'/branches/'+f.human.id+'/takeover',{mode:'agent'});
  assert.equal(f.branch(snapshot).pending_question,null);
});

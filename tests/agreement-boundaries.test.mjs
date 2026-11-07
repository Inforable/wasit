import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {openStore} from '../server/store.mjs';
import {createBackend} from '../server/app.mjs';
import {createAppHandler} from '../server/http.mjs';

const origin='http://localhost:5180';
async function setup(t,units=1) {
  const store=await openStore({sqliteFile:':memory:',databaseUrl:'',production:false});
  const app=await createBackend({store,agents:{},now:()=>1794012900000,auth:{secret:'boundary-tests-private-session-secret-32-bytes',allowedOrigins:[origin],publicOrigin:origin,secure:false}});
  const server=createServer(createAppHandler({routes:app.routes,distDir:'dist'})).listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await app.close();});
  const base='http://127.0.0.1:'+server.address().port;let cookie='',csrf='';
  async function send(path,{method='GET',body,token}={}) {
    const response=await fetch(base+path,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{Cookie:cookie,'X-CSRF-Token':csrf})},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,value:await response.json(),response};
  }
  const boot=await send('/api/demo/session',{method:'POST',body:{}});
  cookie=boot.response.headers.get('set-cookie').split(';')[0];csrf=boot.value.csrf_token;
  const created=await send('/api/requests',{method:'POST',body:{request_text:'Clean '+units+' units of AC.',category:'ac_service',location_label:'Kelapa Gading',schedule_label:'Tomorrow morning',max_budget:300000}});
  assert.equal(created.status,201);
  const id=created.value.id;
  let snapshot=(await send('/api/requests/'+id+'/process',{method:'POST',body:{max_steps:1}})).value;
  const human=snapshot.branches.find(branch=>branch.mode==='human');assert.ok(human);
  const link=await send('/api/requests/'+id+'/branches/'+human.id+'/link');assert.equal(link.status,200);
  const token=new URLSearchParams(new URL(link.value.provider_url).hash.slice(1)).get('token');
  async function provider(text,key) {
    const result=await send('/api/provider/'+human.id+'/messages',{method:'POST',token,body:{text,client_message_id:key}});
    assert.equal(result.status,200,JSON.stringify(result.value));
  }
  async function processUntil(revision) {
    for(let i=0;i<60;i++){
      const result=await send('/api/requests/'+id+'/process',{method:'POST',body:{max_steps:2}});
      assert.equal(result.status,200,JSON.stringify(result.value));snapshot=result.value;
      if(snapshot.branches.find(branch=>branch.id===human.id).quote?.revision>=revision)return snapshot.branches.find(branch=>branch.id===human.id).quote;
    }
    assert.fail('The persisted provider quote task did not complete.');
  }
  const initialText='AC cleaning: 1 unit at Rp90.000 per unit. Refrigerant check: 1 service included. Transport: 1 job at Rp20.000 per job. Available: '+snapshot.job.schedule_label;
  return {store,send,id,human,provider,processUntil,initialText};
}
test('HTTP selection rejects a base quantity that differs from the requested job',async t=>{
  const f=await setup(t,2);
  await f.provider(f.initialText,'client_scope_initial01');
  const quote=await f.processUntil(1);
  const selected=await f.send('/api/requests/'+f.id+'/deals',{method:'POST',body:{branch_id:f.human.id,quote_revision:quote.revision}});
  assert.equal(selected.status,422);
  assert.equal(selected.value.error,'incomplete_quote');
  assert.equal((await f.store.query('SELECT COUNT(*) AS n FROM deals')).rows[0].n,0);
});
test('HTTP selection waits for changed provider terms to be processed before creating a draft',async t=>{
  const f=await setup(t);
  await f.provider(f.initialText,'client_price_initial01');
  const initial=await f.processUntil(1);
  await f.provider('Transport: 1 job at Rp50.000 per job.','client_price_update01');
  const premature=await f.send('/api/requests/'+f.id+'/deals',{method:'POST',body:{branch_id:f.human.id,quote_revision:initial.revision}});
  assert.equal(premature.status,409);assert.equal(premature.value.error,'quote_processing');
  const latest=await f.processUntil(initial.revision+1);
  const selected=await f.send('/api/requests/'+f.id+'/deals',{method:'POST',body:{branch_id:f.human.id,quote_revision:latest.revision}});
  assert.equal(selected.status,201,JSON.stringify(selected.value));
  assert.equal(selected.value.versions[0].terms.committed_total,140000);
});

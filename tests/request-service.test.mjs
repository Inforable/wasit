import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../server/store.mjs';
import {createDirectory} from '../server/directory.mjs';
import {createCommunications} from '../server/communications.mjs';
import {createQuoteService} from '../server/quote-service.mjs';
import {createRequests,HUMAN_REPLY_MS,TASK_LEASE_MS} from '../server/requests.mjs';
import {createAgentRuntime} from '../server/agents/index.mjs';
const owner={role:'consumer',actor_id:'user_owner01'},other={role:'consumer',actor_id:'user_other01'};
const input={request_text:'Clean one AC unit.',category:'ac_service',location_label:'Kelapa Gading',schedule_label:'Tomorrow morning',max_budget:200000};
async function setup(t,overrides={}) {
  const store=await openStore({sqliteFile:':memory:',databaseUrl:'',production:false});
  t.after(()=>store.close());
  let time=1794012900000;
  const now=()=>time;
  const directory=createDirectory({store,now});
  await directory.seed();
  const communications=createCommunications({store,now});
  const quotes=createQuoteService({store,now});
  const options={store,now,directory,communications,quotes,...overrides};
  const service=createRequests(options);
  const one=async(sql,params=[]) => (await store.query(sql,params)).rows[0];
  async function drain(id,{steps=80}={}) {
    let result;
    for(let i=0;i<steps;i++){
      result=await service.process(id,owner);
      const active=await one("SELECT COUNT(*) AS count FROM tasks WHERE request_id=$1 AND status IN ('pending','processing') AND due_at<=$2",[id,time]);
      if(!Number(active.count))break;
    }
    return result;
  }
  return {store,service,directory,communications,quotes,one,drain,now,advance:ms=>{time+=ms;},options};
}
test('scripted negotiation persists tasks, source-backed quotes and reproducible comparison',async t=>{
  const f=await setup(t),created=await f.service.create(input,owner);
  assert.equal(created.status,'contacting');
  assert.equal(created.branches.length,0);
  const before=await f.one('SELECT COUNT(*) AS count FROM tasks');
  await f.service.snapshot(created.id,owner);
  assert.equal((await f.one('SELECT COUNT(*) AS count FROM tasks')).count,before.count);
  const result=await f.drain(created.id);
  assert.equal(result.branches.length,3);
  assert.ok(result.branches.some(branch=>branch.mode==='human'));
  assert.ok(result.cards.length>=1,JSON.stringify(result.events));
  const clear=result.branches.find(branch=>branch.quote?.status==='ready');
  assert.ok(clear.messages.some(message=>message.sender==='provider'));
  assert.ok(clear.quote.lines.every(line=>clear.messages.some(message=>message.id===line.source.message_id)));
  assert.ok(result.branches.every(branch=>branch.clarifications_sent<=3));
  f.advance(HUMAN_REPLY_MS+1);
  const ended=await f.drain(created.id);
  assert.equal(ended.status,'awaiting_customer');
  assert.equal(ended.branches.find(branch=>branch.mode==='human').status,'timed_out');
  assert.ok(ended.events.some(event=>event.kind==='branch_timeout'));
});
test('clarification creates exactly one owned child and preserves original request',async t=>{
  const f=await setup(t),parent=await f.service.create({request_text:'Help me with AC',category:'ac_service'},owner);
  assert.equal(parent.status,'needs_clarification');
  const answers={time_window:'Tomorrow morning',location:'Kelapa Gading',max_budget:200000};
  const [a,b]=await Promise.all([f.service.clarify(parent.id,{answers},owner),f.service.clarify(parent.id,{answers},owner)]);
  assert.equal(a.id,b.id);
  assert.notEqual(a.id,parent.id);
  assert.equal(a.job.max_budget,200000);
  assert.equal((await f.service.snapshot(parent.id,owner)).status,'needs_clarification');
  await assert.rejects(f.service.clarify(parent.id,{answers},other),{status:404});
  await assert.rejects(f.service.snapshot(a.id,{role:'provider',actor_id:'provider_bad01'}),{status:403});
  assert.equal((await f.one('SELECT COUNT(*) AS count FROM requests WHERE parent_id=$1',[parent.id])).count,1);
});
test('human provider replies require the bound branch and stable message IDs',async t=>{
  const f=await setup(t),created=await f.service.create(input,owner);
  await f.drain(created.id);
  const branch=await f.one("SELECT * FROM branches WHERE request_id=$1 AND mode='human'",[created.id]);
  const actor={role:'provider',actor_id:branch.provider_id,provider_id:branch.provider_id,branch_id:branch.id};
  const text='AC cleaning: 1 unit at Rp90.000 per unit. Freon check: 1 job included. Transport Rp20.000 per job. Available: '+(await f.service.snapshot(created.id,owner)).job.schedule_label;
  const body={text,client_message_id:'client_human_reply01'};
  const a=await f.service.receiveProviderMessage(branch.id,body,actor);
  const b=await f.service.receiveProviderMessage(branch.id,body,actor);
  assert.equal(a.message.id,b.message.id);
  assert.equal(b.replayed,true);
  await assert.rejects(f.service.receiveProviderMessage(branch.id,body,{...actor,branch_id:'branch_wrong01'}),{status:403});
  await assert.rejects(f.service.receiveProviderMessage(branch.id,{...body,text:'Changed price'},actor),{status:409});
  await f.drain(created.id);
  assert.ok(await f.quotes.current(branch.id));
  assert.equal((await f.one("SELECT COUNT(*) AS count FROM tasks WHERE branch_id=$1 AND kind='quote' AND source_key=$2",[branch.id,a.message.id])).count,1);
});
test('reset archives owned state, cancels leases and revokes grants without touching another owner',async t=>{
  const f=await setup(t),a=await f.service.create(input,owner),b=await f.service.create(input,other);
  await f.service.process(a.id,owner,{maxSteps:1});
  await f.store.query("UPDATE branches SET token_hash='hash',token_nonce='nonce',token_expires_at=$1 WHERE request_id=$2",[f.now()+100000,a.id]);
  const result=await f.service.reset(owner);
  assert.equal(result.archived,1);
  const archived=await f.one('SELECT * FROM requests WHERE id=$1',[a.id]);
  assert.equal(archived.generation,1);
  assert.equal(archived.archived_at,f.now());
  assert.equal((await f.one("SELECT COUNT(*) AS count FROM tasks WHERE request_id=$1 AND status IN ('pending','processing')",[a.id])).count,0);
  assert.equal((await f.one('SELECT COUNT(*) AS count FROM branches WHERE request_id=$1 AND token_hash IS NOT NULL',[a.id])).count,0);
  await assert.rejects(f.service.snapshot(a.id,owner),{status:404});
  assert.equal((await f.service.snapshot(b.id,other)).id,b.id);
});
test('late discovery results are discarded after reset and do not create branches',async t=>{
  let release,started;
  const ready=new Promise(resolve=>{started=resolve;});
  const gate=new Promise(resolve=>{release=resolve;});
  const f=await setup(t);
  const slowDirectory={...f.directory,discover:async(...args)=>{started();await gate;return f.directory.discover(...args);}};
  const service=createRequests({...f.options,directory:slowDirectory});
  const created=await service.create(input,owner);
  const processing=service.process(created.id,owner,{maxSteps:1});
  await ready;
  await service.reset(owner);
  release();
  await assert.rejects(processing,{status:404});
  assert.equal((await f.one('SELECT COUNT(*) AS count FROM branches WHERE request_id=$1',[created.id])).count,0);
});
test('global processing cap and branch lease prevent duplicate claims; expired leases recover',async t=>{
  const f=await setup(t),created=await f.service.create(input,owner);
  await f.service.process(created.id,owner,{maxSteps:1});
  const tasks=(await f.store.query("SELECT * FROM tasks WHERE request_id=$1 AND status='pending' ORDER BY id",[created.id])).rows;
  for(const task of tasks.slice(0,2))await f.store.query("UPDATE tasks SET status='processing',lease_token=$1,lease_until=$2 WHERE id=$3",['lease_existing01',f.now()+TASK_LEASE_MS,task.id]);
  const before=await f.one('SELECT COUNT(*) AS count FROM messages');
  await f.service.process(created.id,owner);
  assert.equal((await f.one('SELECT COUNT(*) AS count FROM messages')).count,before.count);
  f.advance(TASK_LEASE_MS+1);
  await f.service.process(created.id,owner);
  assert.ok((await f.one('SELECT COUNT(*) AS count FROM messages')).count>before.count);
  assert.ok(Number((await f.one("SELECT COUNT(*) AS count FROM tasks WHERE status='processing'")).count)<=2);
});
test('takeover stops agent sends, customer says explicitly, finish never creates agreements',async t=>{
  const f=await setup(t),created=await f.service.create(input,owner);
  await f.service.process(created.id,owner,{maxSteps:1});
  const branch=await f.one('SELECT * FROM branches WHERE request_id=$1 ORDER BY id LIMIT 1',[created.id]);
  await assert.rejects(f.service.say(created.id,branch.id,{text:'Hello'},owner),{status:409});
  await f.service.takeover(created.id,branch.id,{mode:'customer'},owner);
  await f.service.say(created.id,branch.id,{text:'Please confirm the arrival time.',client_message_id:'client_customer01'},owner);
  await f.drain(created.id);
  const messages=await f.communications.messages(branch.id);
  assert.equal(messages.filter(message=>message.sender==='agent').length,0);
  assert.equal(messages.filter(message=>message.sender==='consumer').length,1);
  await assert.rejects(f.service.takeover(created.id,branch.id,{mode:'agent'},other),{status:404});
  const finished=await f.service.finish(created.id,owner);
  assert.ok(['awaiting_customer','no_match'].includes(finished.status));
  assert.equal(finished.deal,null);
  assert.equal((await f.one('SELECT COUNT(*) AS count FROM deals')).count,0);
  assert.equal((await f.one("SELECT COUNT(*) AS count FROM tasks WHERE request_id=$1 AND status IN ('pending','processing')",[created.id])).count,0);
});
test('persisted quote task guard refuses a cancelled lease without a new revision',async t=>{
  const f=await setup(t),created=await f.service.create(input,owner);
  await f.drain(created.id);
  const row=await f.one("SELECT t.* FROM tasks t WHERE t.request_id=$1 AND t.kind='quote' LIMIT 1",[created.id]);
  assert.ok(row);
  const count=(await f.one('SELECT COUNT(*) AS count FROM quotes')).count;
  const messageId=JSON.parse(row.payload_json).messageId;
  await assert.rejects(f.quotes.processMessage({branchId:row.branch_id,messageId,expectedGeneration:0,taskId:row.id,leaseToken:'lease_wrong01'}),{status:409});
  assert.equal((await f.one('SELECT COUNT(*) AS count FROM quotes')).count,count);
});
test('optional provider model replies keep task guards and show their actual engine',async t=>{
  const f=await setup(t);
  const agents=await createAgentRuntime({store:f.store,env:{OPENAI_API_KEY:'test-private',OPENAI_MODEL_PROVIDER:'test-model'},fetchImpl:async(_url,options)=>{
    const data=JSON.parse(JSON.parse(options.body).input[0].content[0].text);
    return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({message:data.approved_messages[0]})}]}]})};
  }});
  const service=createRequests({...f.options,providerReply:agents.provider});
  const created=await service.create(input,owner);
  let result;
  for(let i=0;i<35;i++)result=await service.process(created.id,owner);
  assert.ok(result.branches.some(branch=>branch.mode==='model'));
  assert.ok(result.events.some(event=>event.kind==='message_received'&&event.engine==='model'));
  assert.ok(result.cards.length>0);
  assert.equal(result.branches.find(branch=>branch.mode==='human').mode,'human');
});

test('stored model diagnostics become clear nonblocking action summaries without changing event history',async t=>{
 const f=await setup(t),request=await f.service.create(input,owner);
 await f.store.query('INSERT INTO events(id,request_id,kind,title,created_at) VALUES($1,$2,$3,$4,$5)',['event_timeout01',request.id,'validation_rejected','model_timeout',f.now()]);
 const view=await f.service.snapshot(request.id,owner),event=view.events.find(row=>row.id==='event_timeout01');
 assert.match(event.summary,/continued with verified rules/);assert.ok(!event.summary.includes('model_timeout'));
 assert.equal((await f.one('SELECT title FROM events WHERE id=$1',['event_timeout01'])).title,'model_timeout');
});

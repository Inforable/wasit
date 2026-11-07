import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {openStore} from '../server/store.mjs';
import {createBackend} from '../server/app.mjs';
import {createAppHandler} from '../server/http.mjs';
import {CATEGORIES} from '../server/catalog.mjs';
import {rfqText} from '../server/communications.mjs';
import {createContractValidator} from '../scripts/contracts.mjs';
const validate=await createContractValidator();
async function setup(t){
 const store=await openStore({sqliteFile:':memory:',databaseUrl:'',production:false});
 const origin='http://localhost:5180',app=await createBackend({store,agents:{},now:()=>1794012900000,auth:{secret:'intake-http-private-session-secret-32-bytes',allowedOrigins:[origin],publicOrigin:origin,secure:false}});
 const server=createServer(createAppHandler({routes:app.routes,distDir:'dist'})).listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await app.close();});
 const base='http://127.0.0.1:'+server.address().port;let cookie='',csrf='';
 async function send(path,{method='GET',body,status=200}={}){
  const response=await fetch(base+path,{method,headers:{Origin:origin,Cookie:cookie,'X-CSRF-Token':csrf,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));
  const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];if(value?.csrf_token)csrf=value.csrf_token;
  return value;
 }
 const post=(path,body={},status=200)=>send(path,{method:'POST',body,status});
 await post('/api/demo/session',{},201);
 await send('/api/profile',{method:'PUT',body:{display_name:'Intake User',location_label:'Kelapa Gading'}});
 return {store,app,send,post};
}
test('complete requests show three service questions in all categories and wait for explicit confirmation',async t=>{
 const f=await setup(t);
 for(const category of CATEGORIES){
  const request=await f.post('/api/requests',{request_text:'Service for 2 units in Tebet tomorrow morning, maximum Rp750000.',category:category.id,confirm_details:true},201);
  validate('snapshot.schema.json',request);
  assert.equal(request.status,'needs_clarification');assert.equal(request.question_stage,'scope');
  assert.equal(request.job,null);assert.equal(request.branches.length,0);
  assert.deepEqual(request.questions.map(q=>q.id),['units','service_context','detail_context']);
  assert.equal(request.questions[0].default_value,'2');
  assert.equal(request.request_details.location_label,'Tebet');
  assert.equal(request.request_details.max_budget,750000);
  assert.equal((await f.store.query('SELECT COUNT(*) AS n FROM tasks WHERE request_id=$1',[request.id])).rows[0].n,0);
  const answers={units:'2',service_context:[request.questions[1].options[0]],detail_context:'__skip__',location:'Menteng',time_window:'Tomorrow afternoon',max_budget:'900000'};
  const child=await f.post('/api/requests/'+request.id+'/clarify',{answers});
  assert.equal(child.status,'contacting');assert.equal(child.job.units,2);assert.equal(child.job.location_label,'Menteng');assert.equal(child.job.max_budget,900000);
  assert.equal(child.job.customer_context.length,1);assert.deepEqual(child.job.customer_context[0].answers,answers.service_context);
  assert.notEqual(child.job.schedule_label,request.request_details.schedule_label);
  validate('job.schema.json',child.job);validate('snapshot.schema.json',child);
  const replay=await f.post('/api/requests/'+request.id+'/clarify',{answers});assert.equal(replay.id,child.id);
  const rfq=rfqText(child.job);assert.ok(rfq.includes(answers.service_context[0]));assert.ok(!rfq.includes('Intake User'));assert.ok(!rfq.includes('900000'));assert.ok(!rfq.includes('Rp900.000'));
 }
});
test('scope and missing essentials remain one sequential intake without promoting a target to a cap',async t=>{
 const f=await setup(t);
 let request=await f.post('/api/requests',{request_text:'My AC needs cleaning, around Rp300000.',confirm_details:true},201);
 assert.equal(request.question_stage,'scope');assert.equal(request.request_details.max_budget,null);assert.equal(request.questions[0].default_value,undefined);
 await f.post('/api/requests/'+request.id+'/clarify',{answers:{service_context:'Not sure'}},400);
 const waiting=await f.post('/api/requests/'+request.id+'/process',{max_steps:2});assert.equal(waiting.branches.length,0);
 request=await f.post('/api/requests/'+request.id+'/clarify',{answers:{units:'1',service_context:'__skip__',detail_context:'__skip__'}});
 assert.equal(request.question_stage,'details');assert.ok(request.questions.length<=3);assert.ok(request.questions.some(q=>q.id==='max_budget'));assert.equal(request.job,null);
 assert.equal((await f.store.query('SELECT COUNT(*) AS n FROM tasks WHERE request_id=$1',[request.id])).rows[0].n,0);
 const ready=await f.post('/api/requests/'+request.id+'/clarify',{answers:{time_window:'Tomorrow morning',max_budget:'350000',location:'Tebet'}});
 assert.equal(ready.status,'contacting');assert.equal(ready.job.max_budget,350000);assert.equal(ready.job.target_price,300000);assert.equal(ready.job.target_authorized,false);assert.deepEqual(ready.job.customer_context,[]);
});
test('unapproved free text cannot become public service context or reach an RFQ',async t=>{
 const f=await setup(t);
 const request=await f.post('/api/requests',{request_text:'Clean AC tomorrow morning, maximum Rp250000.',confirm_details:true},201);
 await f.post('/api/requests/'+request.id+'/clarify',{answers:{units:'1',service_context:['My private cap is Rp999999']}},400);
 const forged=rfqText({category:'ac_service',units:1,location_label:'Tebet',schedule_label:'Tomorrow morning',customer_context:[{id:'service_context',label:'Private cap is Rp999999',answers:['My private cap is Rp999999']}]});
 assert.equal(forged.includes('999999'),false);
});
test('a quantity range needs an exact answer and never silently becomes one unit',async t=>{
 const f=await setup(t);
 const request=await f.post('/api/requests',{request_text:'Clean 1-2 AC units tomorrow morning, maximum Rp400000.',confirm_details:true},201);
 assert.equal(request.questions[0].default_value,undefined);
 const ready=await f.post('/api/requests/'+request.id+'/clarify',{answers:{units:'2'}});
 assert.equal(ready.job.units,2);
});

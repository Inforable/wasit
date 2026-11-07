import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {openStore} from '../server/store.mjs';
import {createAuth} from '../server/auth.mjs';
import {createAppHandler} from '../server/http.mjs';
import {createModelPreferences,DEFAULTS} from '../server/model-preferences.mjs';
import {createAgentRouter} from '../server/agent-router.mjs';
import {formatRequest} from '../server/formatter.mjs';
import {extractQuotedFacts} from '../server/quote-service.mjs';
import {PROVIDERS,seedPrices} from '../server/providers.mjs';
const A='consumer_alpha01',B='consumer_bravo01',L='gpt-6-luna',T='gpt-6.1-terra',NOW=1794012900000;
const env={OPENAI_API_KEY:'test-private-key-never-public',OPENAI_MODEL_BUYER:'old-model',OPENAI_REASONING_EFFORT:'low'};
const job=formatRequest({request_text:'AC cleaning',category:'ac_service',location_label:'Kelapa Gading',schedule_label:'Tomorrow morning',max_budget:250000},{now:NOW,id:'request_models01'}).job;
async function setup(t){const store=await openStore({databaseUrl:'',sqliteFile:':memory:',production:false});t.after(()=>store.close());return store;}
const completed=value=>({ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]})});
async function saveRequest(store,id,config,actor=A){await store.query('INSERT INTO requests(id,user_id,job_json,model_config_json,status,created_at) VALUES($1,$2,$3,$4,$5,$6)',[id,actor,JSON.stringify({...job,id}),config==null?null:JSON.stringify(config),'negotiating',NOW]);}

test('model settings persist only the owning consumer tuple and reject unsupported fields/models',async t=>{
 const store=await setup(t),preferences=createModelPreferences({store,env}),before={...env};
 assert.deepEqual((await preferences.get(A)).selected,DEFAULTS);
 const chosen={request_model:T,bill_model:L};await preferences.update(A,chosen);
 assert.deepEqual(await preferences.forActor(A),chosen);assert.deepEqual(await preferences.forActor(B),DEFAULTS);
 const reloaded=createModelPreferences({store,env});assert.deepEqual((await reloaded.get(A)).selected,chosen);
 for(const bad of [{request_model:'unapproved',bill_model:L},{request_model:T,bill_model:L,actor_id:B},{selected:chosen},{request_model:T},null,[]])await assert.rejects(preferences.update(A,bad),error=>error.status===400);
 await assert.rejects(preferences.get('provider_owner01'),error=>error.status===401);
 const rows=(await store.query("SELECT key,value_json FROM settings WHERE key LIKE 'consumer_models:%'")).rows;
 assert.equal(rows.length,1);assert.equal(rows[0].key,'consumer_models:'+A);assert.deepEqual(JSON.parse(rows[0].value_json),chosen);
 const view=await preferences.get(A);assert.deepEqual(Object.keys(view).sort(),['available','defaults','enabled','selected']);assert.equal(view.enabled,true);assert.equal(view.available.length,2);assert.ok(!JSON.stringify(view).includes(env.OPENAI_API_KEY));assert.deepEqual(env,before);
 view.selected.request_model='tampered';assert.deepEqual(await preferences.forActor(A),chosen);
});

test('model settings HTTP routes require customer cookies, exact origin and mutation CSRF',async t=>{
 const store=await setup(t),origin='http://localhost:5180';
 const auth=createAuth({store,secret:'offline-model-preferences-auth-secret-12345',allowedOrigins:[origin],publicOrigin:origin,secure:false});
 const preferences=createModelPreferences({store,auth,env});
 const server=createServer(createAppHandler({routes:[...auth.routes,...preferences.routes],distDir:'dist'})).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const boot=await fetch(base+'/api/demo/session',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'}),session=await boot.json(),cookie=boot.headers.get('set-cookie').split(';')[0];
 const send=(path,{method='GET',originHeader=origin,csrf=session.csrf_token,withCookie=true,body}={})=>fetch(base+path,{method,headers:{Origin:originHeader,...(withCookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await send('/api/settings/models',{withCookie:false})).status,401);
 assert.equal((await send('/api/settings/models')).status,200);
 const chosen={request_model:T,bill_model:L};
 assert.equal((await send('/api/settings/models',{method:'PUT',csrf:null,body:chosen})).status,403);
 assert.equal((await send('/api/settings/models',{method:'PUT',originHeader:'https://wrong.example',body:chosen})).status,403);
 const saved=await send('/api/settings/models',{method:'PUT',body:chosen});assert.equal(saved.status,200);assert.deepEqual((await saved.json()).selected,chosen);
 const publicResponse=await(await send('/api/settings/models')).text();assert.ok(!publicResponse.includes(env.OPENAI_API_KEY));
});

test('request roles use frozen model snapshots while new requests and bill previews use current own preferences',async t=>{
 const store=await setup(t),preferences=createModelPreferences({store,env}),calls=[],initialEnv={...env};
 const buyerSchema=JSON.parse(await readFile(new URL('../docs/contracts/agent-buyer.schema.json',import.meta.url),'utf8'));
 const transport=async(_url,options)=>{
  const body=JSON.parse(options.body),name=body.text.format.name,user=body.input[0].content[0].text;calls.push({model:body.model,name,body});
  if(name==='wasit_formatter')return completed({category:null,location_label:null,schedule_label:null,max_budget:null,target_price:null});
  if(name==='wasit_buyer')return completed({action:'close',detail_key:null,cite:'none',source_message_ids:[],reason:'No further negotiation is needed.'});
  if(name==='wasit_extract'){const payload=JSON.parse(user);return completed(extractQuotedFacts({message:payload.message,job:{...job,...payload.job_public}}));}
  if(name==='wasit_provider')return completed({message:JSON.parse(user).approved_messages[0]});
  if(name==='wasit_bill')return completed({lines:[{item:'AC cleaning',unit:'unit',quantity:1,unit_price:100000}]});
  throw Error('Unexpected fake role');
 };
 const router=createAgentRouter({store,preferences,env,fetchImpl:transport,now:()=>NOW});assert.equal(router.enabled,true);
 const incomplete={request_text:'Clean AC',category:'ac_service'};
 const formatted=await router.formatter(incomplete,{id:job.id,now:NOW,actor_id:A});assert.deepEqual(formatted.model_config,DEFAULTS);assert.equal(calls.at(-1).model,L);
 await saveRequest(store,job.id,formatted.model_config);
 await preferences.update(A,{request_model:T,bill_model:L});await preferences.update(B,{request_model:T,bill_model:T});
 const newer=await router.formatter(incomplete,{id:'request_models02',now:NOW,actor_id:A});assert.equal(calls.at(-1).model,T);assert.equal(newer.model_config.request_model,T);
 const clarification=await router.formatter(incomplete,{id:'request_models03',now:NOW,actor_id:A,model_config:formatted.model_config});assert.equal(calls.at(-1).model,L);assert.deepEqual(clarification.model_config,formatted.model_config);
 await router.buyer({request_id:job.id,role:'buyer',name:'wasit_buyer',schema:buyerSchema,system:'Choose close.',user:'A bounded test.'});assert.equal(calls.at(-1).model,L);
 const message={id:'msg_models01',text:'AC cleaning: 1 unit at Rp100.000 per unit. Available: '+job.schedule_label};await router.extractor({request_id:job.id,message,job_public:job,previous_quote:null});assert.equal(calls.at(-1).model,L);
 const provider=PROVIDERS.find(value=>value.category==='ac_service'&&value.persona==='script_clear');await router.provider({provider,job,prices:seedPrices(provider),intent:'rfq'});assert.equal(calls.at(-1).model,L);
 const preview={image_base64:'iVBORw0KGgo=',mime_type:'image/png',category:'ac_service'};
 assert.equal((await router.billPreview(preview,A)).requires_confirmation,true);assert.equal(calls.at(-1).model,L);
 await router.billPreview(preview,B);assert.equal(calls.at(-1).model,T);
 await saveRequest(store,'request_legacy01',null);assert.deepEqual(await router.configForRequest('request_legacy01'),DEFAULTS);
 const legacyClarification=await router.formatter(incomplete,{now:NOW,actor_id:A,model_config:null});assert.deepEqual(legacyClarification.model_config,DEFAULTS);assert.equal(calls.at(-1).model,L);
 await assert.rejects(router.forRequest('request_missing01'),error=>error.status===404);
 assert.deepEqual(env,initialEnv);for(const call of calls){assert.equal(call.body.store,false);assert.ok([L,T].includes(call.model));}
});

test('four validated runtime tuples are cached and offline roles remain honestly unavailable',async t=>{
 const store=await setup(t),preferences=createModelPreferences({store,env});
 const router=createAgentRouter({store,preferences,env,fetchImpl:async()=>{throw Error('No call expected');}}),instances=[];
 for(const [index,[request_model,bill_model]]of [[L,L],[L,T],[T,L],[T,T]].entries()){
  const id='request_cache0'+index;await saveRequest(store,id,{request_model,bill_model});const runtime=await router.forRequest(id);instances.push(runtime);assert.equal(await router.forRequest(id),runtime);
 }
 assert.equal(new Set(instances).size,4);
 await saveRequest(store,'request_corrupt01',{request_model:'unknown',bill_model:'unknown'});assert.equal(await router.forRequest('request_corrupt01'),instances[1]);
 let calls=0;const offline=createAgentRouter({store,preferences:createModelPreferences({store,env:{}}),env:{},fetchImpl:async()=>{calls++;throw Error('No network');}});
 assert.equal(offline.enabled,false);assert.equal(offline.buyer,null);assert.equal(offline.extractor,null);
 const result=await offline.formatter({request_text:'Clean AC'},{actor_id:A,now:NOW});assert.equal(result.engine,'rules');assert.ok(result.model_config);
 await assert.rejects(offline.billPreview({},A),error=>error.status===503&&error.code==='vision_unavailable');assert.equal(calls,0);
});

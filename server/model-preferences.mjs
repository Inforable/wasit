import {randomBytes} from 'node:crypto';
import {HttpError} from './errors.mjs';

export const AVAILABLE_MODELS=Object.freeze([
 Object.freeze({id:'gpt-6-luna',label:'GPT-6 Luna'}),
 Object.freeze({id:'gpt-6.1-terra',label:'GPT-6.1 Terra'}),
]);
export const DEFAULTS=Object.freeze({request_model:'gpt-6-luna',bill_model:'gpt-6.1-terra'});
const ids=new Set(AVAILABLE_MODELS.map(model=>model.id));
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function validateModelConfig(value){
 if(!plain(value)||Object.keys(value).length!==2||!Object.hasOwn(value,'request_model')||!Object.hasOwn(value,'bill_model')||Object.keys(value).some(key=>!['request_model','bill_model'].includes(key))||!ids.has(value.request_model)||!ids.has(value.bill_model))throw new HttpError(400,'invalid_payload','Choose a supported request model and bill model.');
 return {request_model:value.request_model,bill_model:value.bill_model};
}
export function storedModelConfig(value){
 try{return validateModelConfig(typeof value==='string'?JSON.parse(value):value);}catch{return {...DEFAULTS};}
}
const actorKey=actorId=>{
 if(typeof actorId!=='string'||!/^consumer_[a-zA-Z0-9_-]{6,64}$/.test(actorId))throw new HttpError(401,'session_required','Sign in to manage your model preferences.');
 return 'consumer_models:'+actorId;
};
export function createModelPreferences({store,auth,env=process.env,now=Date.now,newId=()=>'event_'+randomBytes(10).toString('hex')}={}) {
 if(!store?.query)throw new TypeError('Model preferences require a persistent store.');
 const enabled=typeof env.OPENAI_API_KEY==='string'&&Boolean(env.OPENAI_API_KEY.trim());
 async function forActor(actorId){const key=actorKey(actorId),row=(await store.query('SELECT value_json FROM settings WHERE key=$1',[key])).rows[0];return row?storedModelConfig(row.value_json):{...DEFAULTS};}
 const view=selected=>({enabled,selected:{...selected},defaults:{...DEFAULTS},available:AVAILABLE_MODELS.map(model=>({...model}))});
 async function get(actorId){return view(await forActor(actorId));}
 async function update(actorId,input){const key=actorKey(actorId),selected=validateModelConfig(input);await store.query('INSERT INTO settings(key,value_json) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value_json=$2',[key,JSON.stringify(selected)]);return view(selected);}
 const first=async(db,sql,params=[])=>(await db.query(sql,params)).rows[0];
 async function requestRow(db,requestId,actorId){
  const row=await first(db,'SELECT * FROM requests WHERE id=$1 AND archived_at IS NULL',[requestId]);
  if(!row||(actorId!==undefined&&row.user_id!==actorId))throw new HttpError(404,'not_found','The request was not found.');
  return row;
 }
 function resolveSelection(modelConfig,overrideJson){
  const initial=storedModelConfig(modelConfig);let override=null;try{override=JSON.parse(overrideJson??'null');}catch{}
  const valid=plain(override)&&ids.has(override.request_model)&&Number.isSafeInteger(override.revision)&&override.revision>0;
  return {initial,selected:{...initial,...(valid?{request_model:override.request_model}:{})},revision:valid?override.revision:0};
 }
 async function requestView(db,row){
  const saved=await first(db,'SELECT value_json FROM settings WHERE key=$1',['request_models:'+row.id]);
  const {initial,selected,revision}=resolveSelection(row.model_config_json,saved?.value_json);
  const busy=Boolean(await first(db,"SELECT id FROM tasks WHERE request_id=$1 AND status='processing' AND lease_until>$2 LIMIT 1",[row.id,now()]));
  return {enabled,selected,initial,available:AVAILABLE_MODELS.map(model=>({...model})),revision,busy};
 }
 async function forRequest(requestId){
  const row=await first(store,'SELECT r.model_config_json,s.value_json FROM requests r LEFT JOIN settings s ON s.key=$2 WHERE r.id=$1 AND r.archived_at IS NULL',[requestId,'request_models:'+requestId]);
  if(!row)throw new HttpError(404,'not_found','The request was not found.');
  return resolveSelection(row.model_config_json,row.value_json).selected;
 }
 async function getRequest(requestId,actorId){actorKey(actorId);return requestView(store,await requestRow(store,requestId,actorId));}
 async function updateRequest(requestId,actorId,input){
  actorKey(actorId);
  if(!plain(input)||Object.keys(input).length!==2||!ids.has(input.request_model)||!Number.isSafeInteger(input.expected_revision)||input.expected_revision<0||Object.keys(input).some(key=>!['request_model','expected_revision'].includes(key)))throw new HttpError(400,'invalid_payload','Choose a supported negotiation model and the current revision.');
  return store.transaction(async tx=>{
   // The task runner and reset use this lock before claiming or cancelling work.
   await tx.query('INSERT INTO settings(key,value_json) VALUES($1,$2) ON CONFLICT(key) DO NOTHING',['request_runtime_lock','{}']);
   await tx.query('UPDATE settings SET value_json=value_json WHERE key=$1',['request_runtime_lock']);
   await tx.query('UPDATE requests SET status=status WHERE id=$1',[requestId]);
   const row=await requestRow(tx,requestId,actorId),current=await requestView(tx,row);
   if(input.expected_revision!==current.revision){
    if(input.expected_revision===current.revision-1&&input.request_model===current.selected.request_model)return current;
    throw new HttpError(409,'stale_model','The request model changed. Refresh and apply your choice again.');
   }
   if(input.request_model===current.selected.request_model)return current;
   if(current.busy)throw new HttpError(409,'model_busy','Wait for the current action to finish before changing the model.');
   const revision=current.revision+1,at=now();
   await tx.query('INSERT INTO settings(key,value_json) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value_json=$2',['request_models:'+requestId,JSON.stringify({request_model:input.request_model,revision,updated_at:at})]);
   await tx.query('INSERT INTO events(id,request_id,branch_id,t_ms,actor,kind,engine,title,data_json,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[newId(),requestId,null,Math.max(0,at-Number(row.created_at??at)),'consumer','model_changed',null,'Negotiation model changed for future actions.',JSON.stringify({previous_model:current.selected.request_model,request_model:input.request_model,previous_revision:current.revision,revision}),at]);
   return {...current,selected:{...current.selected,request_model:input.request_model},revision};
  });
 }
 const routes=auth?[
  ['GET',/^\/api\/settings\/models$/,async({req})=>get((await auth.requireConsumer(req)).actor_id)],
  ['PUT',/^\/api\/settings\/models$/,async({req,body})=>update((await auth.requireConsumer(req,{mutation:true})).actor_id,body)],
  ['GET',/^\/api\/requests\/([^/]+)\/models$/,async({req,params})=>getRequest(params[0],(await auth.ownRequest(req,params[0])).actor_id)],
  ['PUT',/^\/api\/requests\/([^/]+)\/models$/,async({req,body,params})=>updateRequest(params[0],(await auth.ownRequest(req,params[0],{mutation:true})).actor_id,body)],
 ]:[];
 return {enabled,forActor,get,update,forRequest,getRequest,updateRequest,routes};
}

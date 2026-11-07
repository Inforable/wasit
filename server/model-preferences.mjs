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
export function createModelPreferences({store,auth,env=process.env}={}) {
 if(!store?.query)throw new TypeError('Model preferences require a persistent store.');
 const enabled=typeof env.OPENAI_API_KEY==='string'&&Boolean(env.OPENAI_API_KEY.trim());
 async function forActor(actorId){const key=actorKey(actorId),row=(await store.query('SELECT value_json FROM settings WHERE key=$1',[key])).rows[0];return row?storedModelConfig(row.value_json):{...DEFAULTS};}
 const view=selected=>({enabled,selected:{...selected},defaults:{...DEFAULTS},available:AVAILABLE_MODELS.map(model=>({...model}))});
 async function get(actorId){return view(await forActor(actorId));}
 async function update(actorId,input){const key=actorKey(actorId),selected=validateModelConfig(input);await store.query('INSERT INTO settings(key,value_json) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value_json=$2',[key,JSON.stringify(selected)]);return view(selected);}
 const routes=auth?[
  ['GET',/^\/api\/settings\/models$/,async({req})=>get((await auth.requireConsumer(req)).actor_id)],
  ['PUT',/^\/api\/settings\/models$/,async({req,body})=>update((await auth.requireConsumer(req,{mutation:true})).actor_id,body)],
 ]:[];
 return {enabled,forActor,get,update,routes};
}

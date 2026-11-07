import {createAgentRuntime} from './agents/index.mjs';
import {formatRequest} from './formatter.mjs';
import {HttpError} from './errors.mjs';
import {DEFAULTS,storedModelConfig} from './model-preferences.mjs';

export function createAgentRouter({store,preferences,env=process.env,fetchImpl=globalThis.fetch,now=Date.now}={}) {
 if(!store?.query||!preferences?.forActor)throw new TypeError('Agent routing requires a store and model preferences.');
 const environment={...env},enabled=typeof environment.OPENAI_API_KEY==='string'&&Boolean(environment.OPENAI_API_KEY.trim()),runtimes=new Map();
 function runtimeFor(config){
  const selected=storedModelConfig(config),key=selected.request_model+'|'+selected.bill_model;
  if(!runtimes.has(key)){
   const roleEnv={...environment,OPENAI_MODEL_BUYER:selected.request_model,OPENAI_MODEL_EXTRACTOR:selected.request_model,OPENAI_MODEL_PROVIDER:selected.request_model,OPENAI_MODEL_FORMATTER:selected.request_model,OPENAI_MODEL_SUPPORT:selected.bill_model};
   const pending=createAgentRuntime({store,env:roleEnv,fetchImpl,now}).catch(error=>{runtimes.delete(key);throw error;});
   runtimes.set(key,pending);
  }
  return runtimes.get(key);
 }
 async function configForRequest(requestId){
  if(requestId==null)return {...DEFAULTS};
  if(preferences.forRequest)return preferences.forRequest(requestId);
  const row=(await store.query('SELECT model_config_json FROM requests WHERE id=$1',[requestId])).rows[0];
  if(!row)throw new HttpError(404,'not_found','The request was not found.');
  return storedModelConfig(row.model_config_json);
 }
 async function forRequest(requestId){return runtimeFor(await configForRequest(requestId));}
 async function formatter(input,context={}){
  const model_config=Object.hasOwn(context,'model_config')?storedModelConfig(context.model_config):context.actor_id?await preferences.forActor(context.actor_id):{...DEFAULTS};
  if(!enabled)return {...formatRequest(input,context),engine:'rules',model_config:{...model_config}};
  const runtime=await runtimeFor(model_config);
  return {...await runtime.formatter(input,context),model_config:{...model_config}};
 }
 const extractor=enabled?async input=>(await forRequest(input.request_id)).extractor(input):null;
 const buyer=enabled?async input=>(await forRequest(input.request_id)).buyer(input):null;
 async function provider(input){return (await forRequest(input?.job?.id)).provider(input);}
 async function billPreview(input,actorId){const selected=enabled?await preferences.forActor(actorId):{...DEFAULTS};return (await runtimeFor(selected)).billPreview(input);}
 return {enabled,formatter,extractor,buyer,provider,billPreview,forRequest,configForRequest};
}

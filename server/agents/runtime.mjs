import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {HttpError} from '../errors.mjs';

const ROOT=new URL('../../docs/contracts/',import.meta.url);
const roles=['buyer','extractor','provider','formatter','support'];
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const clone=value=>JSON.parse(JSON.stringify(value));
export class ModelError extends Error {
  constructor(code,message){super(message);this.name='ModelError';this.code=code;}
}
/** Resolve local contract references before sending a schema to the model endpoint. */
export function resolveSchema(schema,documents,current='agent-schemas.json',seen=[]) {
  if(Array.isArray(schema))return schema.map(value=>resolveSchema(value,documents,current,seen));
  if(!plain(schema))return schema;
  if(schema.$ref){
    const [filePart,fragment='']=schema.$ref.split('#'),file=filePart||current;
    if(!/^[a-z0-9.-]+\.json$/i.test(file)||!documents[file])throw new ModelError('schema_reference','Only registered local contract references are supported.');
    const marker=file+'#'+fragment;
    if(seen.includes(marker))throw new ModelError('schema_reference','Recursive schemas are not supported by this adapter.');
    const target=fragment.split('/').slice(1).reduce((node,key)=>node?.[key.replaceAll('~1','/').replaceAll('~0','~')],documents[file]);
    if(!target)throw new ModelError('schema_reference','The local schema reference could not be resolved.');
    const rest={...schema};delete rest.$ref;
    return {...resolveSchema(target,documents,file,[...seen,marker]),...resolveSchema(rest,documents,current,seen)};
  }
  return Object.fromEntries(Object.entries(schema).filter(([key])=>!['$id','$schema'].includes(key)).map(([key,value])=>[key,resolveSchema(value,documents,current,seen)]));
}
/** The wire schema omits unsupported conditional keywords; the full schema still validates responses. */
export function strictWireSchema(schema) {
  if(Array.isArray(schema))return schema.map(strictWireSchema);
  if(!plain(schema))return schema;
  const out=Object.fromEntries(Object.entries(schema).filter(([key])=>!['allOf','if','then','else','not','default','$defs','definitions'].includes(key)).map(([key,value])=>[key,strictWireSchema(value)]));
  if(out.const!==undefined){out.enum=[out.const];delete out.const;}
  if(out.enum&&!out.type&&!out.anyOf){
    const types=[...new Set(out.enum.map(value=>value===null?'null':typeof value))];
    out.type=types.length===1?types[0]:types;
  }
  if(out.properties){out.type='object';out.additionalProperties=false;out.required=Object.keys(out.properties);}
  return out;
}
export async function loadSchemas() {
  const names=['agent-schemas.json','common.schema.json','agent-buyer.schema.json'];
  const documents=Object.fromEntries(await Promise.all(names.map(async name=>[name,JSON.parse(await readFile(new URL(name,ROOT),'utf8'))])));
  const schemas={};
  for(const[name,entry]of Object.entries(documents['agent-schemas.json']))if(entry?.schema)schemas[name]=resolveSchema(entry.schema,documents);
  return {documents,schemas};
}
export async function createStructuredRuntime({env=process.env,fetchImpl=globalThis.fetch,timeoutMs=Number(env.OPENAI_TIMEOUT_MS??12000),documents:providedDocuments,store,now=Date.now}={}) {
  const loaded=providedDocuments?{documents:providedDocuments,schemas:{}}:await loadSchemas();
  const key=typeof env.OPENAI_API_KEY==='string'?env.OPENAI_API_KEY.trim():'';
  const models=Object.fromEntries(roles.map(role=>[role,String(env['OPENAI_MODEL_'+role.toUpperCase()]??env.OPENAI_MODEL??'').trim()||null]));
  const enabled=!!key&&roles.some(role=>models[role]);
  const ajv=new Ajv2020({allErrors:true,strict:false});addFormats(ajv);
  const validators=new Map();
  const localLeases=new Map();
  const callTimeoutMs=Math.min(20000,Math.max(1,Number.isFinite(Number(timeoutMs))?Number(timeoutMs):12000));
  async function withLeases(update) {
    if(!store){
      const active=[...localLeases].filter(([,expiry])=>expiry>now()).map(([token,expires_at])=>({token,expires_at}));
      const result=update(active);
      localLeases.clear();for(const lease of active)localLeases.set(lease.token,lease.expires_at);
      return result;
    }
    return store.transaction(async tx=>{
      await tx.query('INSERT INTO settings(key,value_json) VALUES($1,$2) ON CONFLICT(key) DO NOTHING',['agent_model_leases','[]']);
      await tx.query('UPDATE settings SET value_json=value_json WHERE key=$1',['agent_model_leases']);
      const row=(await tx.query('SELECT value_json FROM settings WHERE key=$1',['agent_model_leases'])).rows[0];
      let saved;try{saved=JSON.parse(row.value_json);}catch{saved=[];}
      const active=Array.isArray(saved)?saved.filter(lease=>lease.expires_at>now()):[];
      const result=update(active);
      await tx.query('UPDATE settings SET value_json=$1 WHERE key=$2',[JSON.stringify(active),'agent_model_leases']);
      return result;
    });
  }
  async function acquire() {
    return withLeases(active=>{
      if(active.length>=2)throw new ModelError('model_busy','Two model calls are already processing. Use the verified fallback.');
      const token=randomBytes(16).toString('hex');active.push({token,expires_at:now()+callTimeoutMs+2000});return token;
    });
  }
  const release=token=>withLeases(active=>{const index=active.findIndex(lease=>lease.token===token);if(index>=0)active.splice(index,1);});
  async function structured({role='support',name='wasit_output',schema,system,user,image,maxOutputTokens=1800}={}) {
    const model=models[role];
    const effort=String(env['OPENAI_REASONING_EFFORT_'+role.toUpperCase()]??env.OPENAI_REASONING_EFFORT??'').trim();
    if(!key||!model)throw new ModelError('model_unavailable','A model and API key must be configured for this role.');
    if(typeof fetchImpl!=='function')throw new ModelError('model_unavailable','The model transport is unavailable.');
    if(typeof system!=='string'||typeof user!=='string'||user.length>50000)throw new ModelError('invalid_input','The bounded model input is invalid.');
    const resolved=resolveSchema(schema,loaded.documents);
    const fingerprint=JSON.stringify(resolved);
    let validate=validators.get(fingerprint);
    if(!validate){validate=ajv.compile(resolved);validators.set(fingerprint,validate);}
    const lease=await acquire();
    const controller=new AbortController();
    let timer;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new ModelError('model_timeout','The model exceeded its time limit.'));},callTimeoutMs);});
    try {
      return await Promise.race([(async()=>{
        const content=[{type:'input_text',text:user}];
        if(image)content.push({type:'input_image',image_url:image,detail:'auto'});
        const response=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({
          model,store:false,instructions:system,input:[{role:'user',content}],max_output_tokens:maxOutputTokens,
          ...(['none','low','medium','high','xhigh','max'].includes(effort)?{reasoning:{effort}}:{}),
          text:{format:{type:'json_schema',name:name.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,64),schema:strictWireSchema(resolved),strict:true}},
        })});
        if(!response.ok)throw new ModelError('model_http','The model endpoint did not accept the request.');
        const result=await response.json();
        if(result.status!=='completed')throw new ModelError('model_incomplete','The model response was incomplete.');
        const parts=(result.output??[]).flatMap(item=>item.content??[]);
        if(parts.some(part=>part.type==='refusal'))throw new ModelError('model_refusal','The model declined this request.');
        const text=parts.filter(part=>part.type==='output_text').map(part=>part.text??'').join('');
        if(!text||text.length>100000)throw new ModelError('invalid_json','The model response did not contain bounded JSON.');
        let value;try{value=JSON.parse(text);}catch{throw new ModelError('invalid_json','The model response was not valid JSON.');}
        if(!validate(value))throw new ModelError('schema_rejected','The model response failed local schema validation.');
        return value;
      })(),timeout]);
    }catch(cause){
      if(cause instanceof ModelError)throw cause;
      throw new ModelError('model_transport','The model transport was unavailable.');
    }finally{clearTimeout(timer);await release(lease);}
  }
  return {enabled,models,schemas:loaded.schemas,structured,available:role=>!!key&&!!models[role]};
}
export const unavailableVision=()=>new HttpError(503,'vision_unavailable','Bill image reading is unavailable. Enter the bill lines manually.');

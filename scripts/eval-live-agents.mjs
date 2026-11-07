import {performance} from 'node:perf_hooks';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createAgentRuntime} from '../server/agents/index.mjs';
import {evaluateExtractor} from './eval-agents.mjs';
import {formatRequest} from '../server/formatter.mjs';
import {decideBuyer} from '../server/buyer-policy.mjs';
import {PROVIDERS,seedPrices} from '../server/providers.mjs';

export const LIVE_CALL_CAP=30;
const now=1794012900000;
const round=value=>Number(value.toFixed(3));
const tokenUsage=value=>Object.fromEntries(['input_tokens','output_tokens','total_tokens'].map(key=>[key,Number(value?.[key]??0)]));
async function syntheticBill(file) {
  const {chromium}=await import('playwright');
  const executablePath=[process.env.PROGRAMFILES+'/Google/Chrome/Application/chrome.exe',process.env['PROGRAMFILES(X86)']+'/Microsoft/Edge/Application/msedge.exe'].find(path=>existsSync(path));
  const browser=await chromium.launch({...(executablePath?{executablePath}:{}),headless:true});
  try{
    const page=await browser.newPage({viewport:{width:900,height:650},deviceScaleFactor:1});
    await page.setContent('<!doctype html><html lang="en"><meta charset="utf-8"><style>body{font:24px Arial;padding:36px;background:white;color:#111}h1{font-size:30px}table{border-collapse:collapse;width:100%}th,td{padding:16px 10px;border-bottom:1px solid #aaa;text-align:left}small{font-size:17px}</style><h1>Wasit synthetic bill ? evaluation fixture</h1><small>Independent printed labels. Not a real transaction.</small><table><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Unit price (Rp)</th></tr><tr><td>AC cleaning</td><td>1</td><td>unit</td><td>113,000</td></tr><tr><td>Transport</td><td>1</td><td>job</td><td>13,000</td></tr><tr><td>Refrigerant check</td><td>1</td><td>service</td><td>0</td></tr></table><p>Total: Rp126,000</p>');
    await page.screenshot({path:file,fullPage:true});
  }finally{await browser.close();}
}
export function createLiveTransport({fetchImpl=globalThis.fetch,onProgress=()=>{},cap=LIVE_CALL_CAP}={}) {
  cap=Math.max(0,Math.min(LIVE_CALL_CAP,Math.trunc(cap)));
  const calls=[];
  async function trackedFetch(url,options) {
    if(calls.length>=cap)throw Object.assign(new Error('The explicit live evaluation call cap was reached.'),{code:'call_cap'});
    const request=JSON.parse(options.body);
    const record={number:calls.length+1,role_schema:request.text?.format?.name??'unknown',model:request.model,status:'started',http_status:null,elapsed_ms:null,usage:null};
    calls.push(record);const start=performance.now();
    try{
      const response=await fetchImpl(url,options);record.http_status=response.status;
      let result;try{result=await response.clone().json();}catch{}
      record.status=response.ok?result?.status??'unknown':'http_error';
      record.usage=result?.usage?tokenUsage(result.usage):null;
      const output=(result?.output??[]).flatMap(item=>item.content??[]).filter(part=>part.type==='output_text').map(part=>part.text??'').join('');
      if(output){const privateKey=String(options.headers?.Authorization??'').replace(/^Bearer /,'');const safe=privateKey?output.replaceAll(privateKey,'[REDACTED]'):output;try{record.output=JSON.parse(safe);}catch{record.output_status='invalid_json';}}
      return response;
    }catch(cause){record.status=cause.name==='AbortError'?'aborted':'transport_error';throw cause;}
    finally{record.elapsed_ms=round(performance.now()-start);onProgress({...record});}
  }
  return {calls,trackedFetch};
}
export async function runLiveEvaluation({env=process.env,fetchImpl=globalThis.fetch,outputDir=resolve('results'),onProgress=()=>{}}={}) {
  if(!env.OPENAI_API_KEY||!(env.OPENAI_MODEL_EXTRACTOR??env.OPENAI_MODEL))throw Object.assign(new Error('OpenAI credentials and an extractor model are required.'),{code:'model_unavailable'});
  await mkdir(outputDir,{recursive:true});
  const {calls,trackedFetch}=createLiveTransport({fetchImpl,onProgress});
  const started=new Date().toISOString(),agents=await createAgentRuntime({env,fetchImpl:trackedFetch});
  const extraction=await evaluateExtractor({extractor:agents.extractor});
  const job=formatRequest({request_text:'Clean one AC unit.',category:'ac_service',location_label:'Kelapa Gading',schedule_label:'Tomorrow morning',max_budget:190000,target_price:105000,target_authorized:true},{now,id:'request_live01'}).job;
  const profile=PROVIDERS.find(entry=>entry.category==='ac_service'&&entry.persona==='script_clear'),prices=seedPrices(profile);
  const lines=[
    {id:'line_live_base01',item_code:'cuci_ac',label:'AC cleaning',kind:'fixed',unit:'unit',quantity:1,unit_price:113000,condition:null,source:{message_id:'msg_live_base01',snippet:'AC cleaning: 1 unit at Rp113.000 per unit.'}},
    {id:'line_live_fee01',item_code:'transport',label:'Transport',kind:'fixed',unit:'job',quantity:1,unit_price:13000,condition:null,source:{message_id:'msg_live_fee01',snippet:'Transport Rp13.000 per job.'}},
    {id:'line_live_included01',item_code:'cek_freon',label:'Refrigerant check',kind:'included',unit:'service',quantity:1,unit_price:0,condition:null,source:{message_id:'msg_live_included01',snippet:'Refrigerant check included.'}},
  ];
  const quote={id:'quote_live01',branch_id:'branch_live01',revision:1,category:job.category,scope:job.scope,units:1,schedule_label:job.schedule_label,lines,status:'ready',fixed_total:126000,unresolved:[],updated_at:now};
  const checks=[];
  async function check(name,work,validate) {
    const start=performance.now();try{
      const output=await work();
      const passed=validate(output);
      checks.push({name,passed,engine:output.engine??null,rejected:output.rejected??null,elapsed_ms:round(performance.now()-start),output});
    }catch(cause){checks.push({name,passed:false,engine:null,error_code:cause.code??'unexpected_error',elapsed_ms:round(performance.now()-start)});}
  }
  await check('buyer_authorized_target',()=>decideBuyer({job,quote,branch:{status:'processing',countered:0,asked_terms:0,clarifications_sent:0}},agents.buyer),out=>['counter','counter_terms','close'].includes(out.action)&&(!out.amount||out.amount===105000)&&out.engine==='model');
  await check('buyer_unresolved_detail',()=>decideBuyer({job,quote:{...quote,status:'needs_detail',fixed_total:null,unresolved:['transport']},branch:{status:'processing',clarifications_sent:0}},agents.buyer),out=>['ask_detail','close'].includes(out.action)&&out.engine==='model');
  await check('provider_rfq',()=>agents.provider({provider:profile,prices,job,intent:'rfq'}),out=>out.engine==='model'&&out.message.includes('Rp100.000'));
  await check('provider_counter_floor',()=>agents.provider({provider:profile,prices,job,intent:'counter'}),out=>out.engine==='model'&&out.message.includes('Rp95.000'));
  await check('formatter_missing_cap',()=>agents.formatter({request_text:'Clean AC tomorrow morning in Kelapa Gading around Rp120.000',category:'ac_service'},{now,id:'request_live_format01'}),out=>out.status==='needs_clarification'&&out.questions.some(question=>question.id==='max_budget'));
  await check('card_explanation',()=>agents.explain({card:{reason:'Complete quoted scope costs are available.',quoted_total:126000},quote}),out=>out.engine==='model'&&!out.sentence.includes('saving'));
  const imageFile=resolve(outputDir,'synthetic-bill-live.png');
  try{
    await syntheticBill(imageFile);
    const image=(await readFile(imageFile)).toString('base64');
    await check('synthetic_bill_image',()=>agents.billPreview({image_base64:image,mime_type:'image/png',category:'ac_service'}),out=>{
      const actual=out.lines.map(line=>[line.item_code,line.unit,line.quantity,line.unit_price]).sort();
      const expected=[['cuci_ac','unit',1,113000],['transport','job',1,13000],['cek_freon','service',1,0]].sort();
      return out.requires_confirmation===true&&JSON.stringify(actual)===JSON.stringify(expected);
    });
  }catch(cause){checks.push({name:'synthetic_bill_image',passed:false,engine:null,error_code:cause.code??'image_fixture_unavailable',note:'Synthetic image fixture could not be rendered; no OCR claim is made.'});}
  const fallback=await createAgentRuntime({env,timeoutMs:10,fetchImpl:()=>new Promise(()=>{})});
  await check('forced_timeout_rules_fallback',()=>fallback.provider({provider:profile,prices,job,intent:'rfq'}),out=>out.engine==='rules'&&out.rejected==='model_timeout');
  const usage=calls.reduce((sum,row)=>Object.fromEntries(Object.keys(sum).map(key=>[key,sum[key]+Number(row.usage?.[key]??0)])),{input_tokens:0,output_tokens:0,total_tokens:0});
  const result={suite:'wasit-openai-live-v1',started_at:started,finished_at:new Date().toISOString(),actual_calls:calls.length,call_cap:LIVE_CALL_CAP,models:agents.models,usage,calls,extraction,checks,
    limitations:['The extraction labels previously informed two rules fixes, so this is a regression comparison.','One synthetic printed bill image does not establish real bill OCR accuracy.','The timeout fallback check uses a simulated failed transport and makes no paid call.','Usage is reported from actual API responses; no monetary cost is guessed.']};
  await writeFile(resolve(outputDir,'agent-live-evaluation.json'),JSON.stringify(result,null,2)+'\n');
  return result;
}
export async function runFocusedEvaluation({env=process.env,fetchImpl=globalThis.fetch,outputDir=resolve('results'),onProgress=()=>{},caseIds=['transport-unknown','injection-same-clause','cross-item-price']}={}) {
  const {calls,trackedFetch}=createLiveTransport({fetchImpl,onProgress,cap:5});
  const agents=await createAgentRuntime({env,fetchImpl:trackedFetch});
  if(!agents.extractor)throw Object.assign(new Error('The configured extractor is unavailable.'),{code:'model_unavailable'});
  const extraction=await evaluateExtractor({extractor:agents.extractor,caseIds});
  const usage=calls.reduce((sum,row)=>Object.fromEntries(Object.keys(sum).map(key=>[key,sum[key]+Number(row.usage?.[key]??0)])),{input_tokens:0,output_tokens:0,total_tokens:0});
  const result={suite:'wasit-openai-focused-regression-v1',finished_at:new Date().toISOString(),actual_calls:calls.length,call_cap:5,usage,calls,extraction,checks:[],limitations:['Three selected regressions after fixes; this is not a new independent evaluation.']};
  await mkdir(outputDir,{recursive:true});
  await writeFile(resolve(outputDir,'agent-live-focused.json'),JSON.stringify(result,null,2)+'\n');
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(!process.argv.includes('--live')){process.stdout.write('Live evaluation requires explicit --live. No API calls were made.\n');}
  else{
    try{
      const evaluate=process.argv.includes('--focused')?runFocusedEvaluation:runLiveEvaluation;
      const selected=process.argv.find(value=>value.startsWith('--case='))?.slice(7).split(',');
      const result=await evaluate({...(selected?{caseIds:selected}:{}),onProgress:row=>process.stdout.write(JSON.stringify({call:row.number,schema:row.role_schema,status:row.status,http_status:row.http_status,elapsed_ms:row.elapsed_ms,usage:row.usage})+'\n')});
      process.stdout.write(JSON.stringify({suite:result.suite,actual_calls:result.actual_calls,usage:result.usage,extraction:{passed:result.extraction.passed,case_count:result.extraction.case_count,line_precision:result.extraction.line_precision,line_recall:result.extraction.line_recall,fallback_count:result.extraction.fallback_count,median_ms:result.extraction.median_ms,p95_ms:result.extraction.p95_ms},checks:result.checks.map(({name,passed,engine,error_code,rejected,elapsed_ms})=>({name,passed,engine,error_code,rejected,elapsed_ms}))},null,2)+'\n');
    }catch(cause){process.stderr.write(JSON.stringify({error_code:cause.code??'evaluation_failed',message:'Live evaluation could not complete. No secret details are printed.'})+'\n');process.exitCode=1;}
  }
}

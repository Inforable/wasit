import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openStore} from '../server/store.mjs';
import {createBackend} from '../server/app.mjs';
import {createAppHandler} from '../server/http.mjs';
import {createAgentRuntime} from '../server/agents/index.mjs';
import {ModelError} from '../server/agents/runtime.mjs';
import {createBudgetedFetch} from '../server/model-budget.mjs';
import {CATEGORIES,catalog} from '../server/catalog.mjs';
import {parseAmounts} from '../server/money.mjs';
import {HUMAN_REPLY_MS} from '../server/requests.mjs';

export const STAGES=['Customer profile','Service request','Format and clarify','Discover providers','Private RFQs','Bounded negotiation','Source-backed quotations','Equivalent-scope comparison','Choose a quotation','Bilateral booking v1','On-site bill and change v2','Complete, resolve, release and review'];
const CAPS={ac_service:160000,washer:230000,plumbing:200000,electrical:210000,cleaning:280000};
const ORIGIN='http://localhost:5180';
const round=value=>Number(value.toFixed(3));
const sum=lines=>lines.reduce((total,line)=>total+line.quantity*line.unit_price,0);
const billLines=terms=>terms.lines.filter(line=>line.kind==='committed').map(({id,item_code,label,unit,quantity,unit_price})=>({id,item_code,label,unit,quantity,unit_price,explanation:null}));
const publicToken=link=>new URLSearchParams(new URL(link.provider_url).hash.slice(1)).get('token');
export async function runPipeline({live=false,env=process.env,onProgress=()=>{},outputDir=resolve('results'),callCap=24}={}) {
  if(!Number.isInteger(callCap)||callCap<1||callCap>24)throw new TypeError('The live pipeline call cap must be from 1 to 24.');
  if(live&&!env.OPENAI_API_KEY)throw new ModelError('model_unavailable','The explicitly requested live run needs configured OpenAI credentials.');
  const store=await openStore({sqliteFile:':memory:',databaseUrl:'',production:false});
  let clock=1794012900000;const now=()=>clock,calls=[];
  const trackedFetch=async(url,options)=>{
    if(calls.length>=callCap)throw new ModelError('model_budget_exhausted','The live pipeline call cap has been reached.');
    const body=JSON.parse(options.body),record={number:calls.length+1,schema:body.text?.format?.name??null,model:body.model,status:'started',http_status:null,elapsed_ms:null,usage:null};
    calls.push(record);const start=performance.now();
    try{
      const response=await fetch(url,options);record.http_status=response.status;
      let value;try{value=await response.clone().json();}catch{}
      record.status=response.ok?value?.status??'unknown':'http_error';
      if(value?.usage)record.usage=Object.fromEntries(['input_tokens','output_tokens','total_tokens'].map(key=>[key,Number(value.usage[key]??0)]));
      return response;
    }catch(cause){record.status=cause.name==='AbortError'?'aborted':'transport_error';throw cause;}
    finally{record.elapsed_ms=round(performance.now()-start);onProgress({type:'model_call',...record});}
  };
  const agents=live?await createAgentRuntime({store,now,env,fetchImpl:createBudgetedFetch({store,now,dailyLimit:callCap,fetchImpl:trackedFetch})}):{};
  const app=await createBackend({store,agents,now,auth:{secret:'pipeline-only-isolated-http-session-secret-32-bytes',allowedOrigins:[ORIGIN],publicOrigin:ORIGIN,secure:false}});
  const server=createServer(createAppHandler({routes:app.routes,distDir:'dist'})).listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port,journeys=[],clients=[],started=new Date().toISOString();
  function client(){
    let cookie='',csrf='';const stats={requests:0,expected_rejections:0,statuses:{}};
    async function send(path,{method='GET',body,token,status=200}={}){
      const response=await fetch(base+path,{method,headers:{Origin:ORIGIN,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{Cookie:cookie,'X-CSRF-Token':csrf})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
      const value=await response.json();stats.requests++;stats.statuses[response.status]=(stats.statuses[response.status]??0)+1;
      if(status>=400)stats.expected_rejections++;
      if(response.status!==status)throw Object.assign(new Error('Unexpected HTTP status.'),{code:'http_'+response.status,route:path,expected_status:status,actual_status:response.status});
      const setCookie=response.headers.get('set-cookie');if(setCookie&&!token)cookie=setCookie.split(';')[0];
      if(value?.csrf_token&&!token)csrf=value.csrf_token;
      return value;
    }
    return {send,stats,post:(path,body={},status=200)=>send(path,{method:'POST',body,status})};
  }
  try{
    for(const category of (live?CATEGORIES.filter(entry=>entry.id==='ac_service'):CATEGORIES)){
      const c=client();clients.push(c);
      const journey={category:category.id,stages:[],status:'running',http:c.stats,flags:{},outcome:null};journeys.push(journey);
      let currentStage;
      function check(name,condition){currentStage.flags[name]=!!condition;if(!condition)throw Object.assign(new Error(name),{code:'invariant_failed',check:name});}
      async function stage(number,work){
        currentStage={number,name:STAGES[number],status:'running',elapsed_ms:null,flags:{}};journey.stages.push(currentStage);
        const at=performance.now();
        try{await work();currentStage.status='passed';}
        catch(cause){currentStage.status='failed';currentStage.error={code:cause.code??'stage_failed',check:cause.check??null,route:cause.route??null,expected_status:cause.expected_status??null,actual_status:cause.actual_status??null};throw cause;}
        finally{currentStage.elapsed_ms=round(performance.now()-at);onProgress({type:'stage',category:category.id,number,status:currentStage.status,elapsed_ms:currentStage.elapsed_ms});}
      }
      let request,snapshot,selected,deal,v1,v2,optional,v1Terms,v1Digest,quoteBefore,owner,providerToken,human;
      const cap=CAPS[category.id],password='Pipeline-'+randomBytes(18).toString('base64url'),email=category.id+'-'+randomBytes(5).toString('hex')+'@pipeline.example';
      async function processUntil(predicate,max=80){
        for(let i=0;i<max;i++){snapshot=await c.post('/api/requests/'+request.id+'/process',{max_steps:2});if(predicate(snapshot))return snapshot;}
        throw Object.assign(new Error('Bounded processing did not reach its expected state.'),{code:'processing_bound'});
      }
      async function providerAction(action,payload){return c.post('/api/demo/deals/'+deal.id+'/provider-action',{action,payload});}
      async function activate(){
        const version=deal.versions.find(row=>row.id===deal.pending_version_id),previous=deal.active_version_id;
        const acceptance={version_id:version.id,terms_digest:version.terms_digest,expected_active_version_id:previous};
        deal=await c.post('/api/deals/'+deal.id+'/submit',acceptance);
        deal=await c.post('/api/deals/'+deal.id+'/accept',{...acceptance,budget_ack_limit:version.terms.spending_limit});
        check('one_role_does_not_activate_'+version.number,deal.active_version_id===previous);
        deal=await providerAction('accept',{...acceptance,budget_ack_limit:null});
        check('bilateral_activation_'+version.number,deal.active_version_id===version.id&&deal.versions.find(row=>row.id===version.id).acceptances.length===2);
        return version.id;
      }
      try{
        await stage(0,async()=>{
          const demo=await c.post('/api/demo/session',{},201);owner=demo.actor_id;
          check('new_profile_is_null',(await c.send('/api/profile'))===null);
          const profile=await c.send('/api/profile',{method:'PUT',body:{display_name:'Pipeline Customer',location_label:'Kelapa Gading',default_category:category.id,weights:{price:50,slot:25,trust:25}}});
          check('profile_saved',profile.default_category===category.id&&profile.weights.price+profile.weights.slot+profile.weights.trust===100);
          const registered=await c.post('/api/auth/register',{display_name:'Pipeline Customer',email,password},201);
          check('optional_account_adopts_demo',registered.actor_id===owner);
          await c.post('/api/auth/logout');
          const logged=await c.post('/api/auth/login',{email,password});
          check('login_preserves_actor_and_profile',logged.actor_id===owner&&(await c.send('/api/profile')).location_label==='Kelapa Gading');
        });
        await stage(1,async()=>{
          request=await c.post('/api/requests',{request_text:category.label+' for one requested unit.',category:category.id},201);
          journey.formatter={engine:request.events.find(event=>event.kind==='request_created')?.engine??null,rejection_events:request.events.filter(event=>event.kind==='validation_rejected').length};
          check('request_owned_and_persisted',!!request.id&&request.branches.length===0);
        });
        await stage(2,async()=>{
          check('missing_hard_facts_require_answers',request.status==='needs_clarification'&&request.questions.length>0&&request.questions.length<=3);
          const answers={time_window:'Tomorrow morning',location:'Kelapa Gading',max_budget:cap};
          const child=await c.post('/api/requests/'+request.id+'/clarify',{answers});
          const replay=await c.post('/api/requests/'+request.id+'/clarify',{answers});
          check('clarification_replay_reuses_child',child.id===replay.id&&child.id!==request.id);
          request=child;snapshot=child;
          check('private_cap_explicit_no_authorized_target',child.job.max_budget===cap&&child.job.target_authorized===false&&child.status==='contacting');
        });
        await stage(3,async()=>{
          snapshot=await c.post('/api/requests/'+request.id+'/process',{max_steps:1});
          check('eligible_bounded_provider_branches',snapshot.branches.length>=1&&snapshot.branches.length<=5);
          const eligible=await c.send('/api/providers?category='+category.id+'&location=Kelapa+Gading');
          check('all_providers_match_category',snapshot.branches.every(branch=>eligible.providers.some(provider=>provider.name===branch.provider_label&&provider.category===category.id)));
          human=snapshot.branches.find(branch=>branch.mode==='human');check('separate_human_branch_exists',!!human);
        });
        await stage(4,async()=>{
          await processUntil(value=>value.branches.every(branch=>branch.messages.some(message=>message.sender==='agent')));
          const rfqs=snapshot.branches.map(branch=>branch.messages.find(message=>message.sender==='agent'));
          check('private_rfq_excludes_customer_identity_and_cap',rfqs.every(message=>!message.text.includes('Pipeline Customer')&&!message.text.includes(String(cap))&&!message.text.includes('Rp'+String(cap).replace(/\B(?=(\d{3})+(?!\d))/g,'.'))));
          const link=await c.send('/api/requests/'+request.id+'/branches/'+human.id+'/link');providerToken=publicToken(link);
          const provider=await c.send('/api/provider/'+human.id,{token:providerToken});
          check('provider_bearer_projection_private',!/(max_budget|spending_limit|budget_ack_limit|consumer_)/.test(JSON.stringify(provider)));
          await c.send('/api/requests/'+request.id,{token:providerToken,status:403});check('provider_cannot_enter_customer_route',true);
        });
        await stage(5,async()=>{
          await processUntil(value=>value.branches.filter(branch=>branch.mode!=='human').every(branch=>['ready','closed','timed_out'].includes(branch.status)));
          clock+=HUMAN_REPLY_MS+1;
          await processUntil(value=>['awaiting_customer','no_match'].includes(value.status));
          check('silent_human_timeout_persisted',snapshot.branches.find(branch=>branch.id===human.id).status==='timed_out');
          check('negotiation_is_bounded',snapshot.branches.every(branch=>branch.clarifications_sent<=3));
          check('action_events_record_actual_engines',snapshot.events.some(event=>event.kind==='decision')&&snapshot.events.every(event=>event.engine===null||['rules','model'].includes(event.engine)));
        });
        await stage(6,async()=>{
          const quoted=snapshot.branches.filter(branch=>branch.quote);check('quotations_exist',quoted.length>0);
          check('every_line_has_own_provider_source',quoted.every(branch=>branch.quote.lines.every(line=>{
            const source=branch.messages.find(message=>message.id===line.source.message_id);
            return source?.sender==='provider'&&source.text.includes(line.source.snippet)&&(line.unit_price==null||line.unit_price===0||parseAmounts(line.source.snippet).some(amount=>amount.value===line.unit_price));
          })));
          check('fixed_totals_exclude_optional_work',quoted.every(branch=>branch.quote.fixed_total===null||branch.quote.fixed_total===sum(branch.quote.lines.filter(line=>line.kind==='fixed'))));
        });
        await stage(7,async()=>{
          check('comparable_cards_available',snapshot.cards.length>0);
          check('ranked_totals_equal_quoted_scope',snapshot.cards.every(card=>snapshot.branches.some(branch=>branch.quote?.id===card.quote_id&&branch.quote.fixed_total===card.quoted_total)));
          const before=JSON.stringify(snapshot.cards),book=catalog(category.id);
          const context=await c.send('/api/reference-prices?'+new URLSearchParams({category:category.id,item_code:book.baseItem,unit:book.items.find(item=>item.id===book.baseItem).units[0],scope:snapshot.job.scope}));
          const planning=await c.send('/api/requests/'+request.id+'/planning');
          const unchanged=await c.send('/api/requests/'+request.id);
          check('reference_and_planning_do_not_change_ranking',context.advisory_only===true&&JSON.stringify(unchanged.cards)===before&&Array.isArray(planning.scenarios));
        });
        await stage(8,async()=>{
          selected=snapshot.branches.find(branch=>branch.quote?.id===snapshot.cards[0].quote_id);quoteBefore=structuredClone(selected.quote);
          deal=await c.post('/api/requests/'+request.id+'/deals',{branch_id:selected.id,quote_revision:selected.quote.revision},201);
          check('selection_creates_draft_only',deal.active_version_id===null&&deal.versions[0].status==='draft'&&deal.lifecycle===null);
          check('draft_scope_quantity_schedule_match',deal.versions[0].terms.units===snapshot.job.units&&deal.versions[0].terms.schedule_label===snapshot.job.schedule_label);
        });
        await stage(9,async()=>{
          v1=await activate();v1Terms=structuredClone(deal.versions.find(version=>version.id===v1).terms);v1Digest=deal.versions.find(version=>version.id===v1).terms_digest;
          check('acceptance_does_not_fund_work',deal.lifecycle.held===0&&deal.lifecycle.due===v1Terms.committed_total);
          deal=await c.post('/api/deals/'+deal.id+'/pay',{expected_active_version_id:v1});
          const repeat=await c.post('/api/deals/'+deal.id+'/pay',{expected_active_version_id:v1});
          check('v1_hold_idempotent',repeat.lifecycle.held===v1Terms.committed_total&&repeat.lifecycle.payments.filter(row=>row.kind==='hold').length===1&&repeat.lifecycle.simulation===true);
          deal=repeat;
        });
        await stage(10,async()=>{
          optional=quoteBefore.lines.find(line=>line.kind==='optional'&&line.unit_price>0);check('extra_work_is_explicit_provider_candidate',!!optional);
          const total=v1Terms.committed_total+optional.quantity*optional.unit_price;
          const included=v1Terms.lines.find(line=>line.kind==='included'),base=billLines(v1Terms)[0];
          const previewRows=billLines(v1Terms).map(line=>line.id===base.id?{...line,unit_price:line.unit_price+1000}:line);
          previewRows.push({id:'billline_included_'+category.id,item_code:included.item_code,label:included.label,unit:included.unit,quantity:included.quantity,unit_price:10000,explanation:null});
          previewRows.push({id:'billline_optional_'+category.id,item_code:optional.item_code,label:optional.label,unit:optional.unit,quantity:optional.quantity,unit_price:optional.unit_price,explanation:null});
          const bill=await c.post('/api/deals/'+deal.id+'/bill-checks',{expected_active_version_id:v1,lines:previewRows},201);
          check('v1_bill_flags_changed_included_and_new_work',['price_changed','already_included','new_work'].every(status=>bill.results.some(result=>result.status===status)));
          check('bill_check_does_not_authorize_extra',(await c.send('/api/deals/'+deal.id)).active_version_id===v1);
          const change={expected_active_version_id:v1,change_message_id:optional.source.message_id,committed_line_ids:[optional.id],spending_limit:cap};
          check('new_work_exceeds_original_cap',total>cap);
          await c.post('/api/deals/'+deal.id+'/changes',change,422);check('old_cap_cannot_authorize_extra',true);
          deal=await c.post('/api/deals/'+deal.id+'/changes',{...change,spending_limit:total});
          check('v1_stays_active_during_change',deal.active_version_id===v1&&!!deal.pending_version_id);
          v2=await activate();
          const original=deal.versions.find(version=>version.id===v1),active=deal.versions.find(version=>version.id===v2);
          check('v1_terms_and_digest_immutable',JSON.stringify(original.terms)===JSON.stringify(v1Terms)&&original.terms_digest===v1Digest&&original.status==='superseded');
          check('v2_acceptance_requires_separate_topup',deal.lifecycle.due===optional.quantity*optional.unit_price&&deal.lifecycle.held===v1Terms.committed_total);
          await c.post('/api/demo/deals/'+deal.id+'/provider-action',{action:'done',payload:{expected_active_version_id:v2}},409);check('unfunded_v2_cannot_be_completed',true);
          await c.post('/api/deals/'+deal.id+'/bill-checks',{expected_active_version_id:v1,lines:billLines(v1Terms)},409);check('old_version_bill_rejected',true);
          const checked=await c.post('/api/deals/'+deal.id+'/bill-checks',{expected_active_version_id:v2,lines:billLines(active.terms)},201);
          check('approved_v2_bill_matches',checked.results.every(result=>result.status==='matches')&&checked.version_id===v2);
          deal=await c.post('/api/deals/'+deal.id+'/pay',{expected_active_version_id:v2});
          deal=await c.post('/api/deals/'+deal.id+'/pay',{expected_active_version_id:v2});
          check('topup_is_version_bound_and_idempotent',deal.lifecycle.held===total&&deal.lifecycle.funded_version_id===v2&&deal.lifecycle.payments.filter(row=>row.kind==='topup').length===1);
          const checks=await c.send('/api/deals/'+deal.id+'/bill-checks');
          check('bill_history_preserves_both_versions',checks.checks.some(row=>row.version_id===v1)&&checks.checks.some(row=>row.version_id===v2));
        });
        await stage(11,async()=>{
          deal=await providerAction('done',{expected_active_version_id:v2});
          const held=deal.lifecycle.held,payments=deal.lifecycle.payments.length;
          const read=await c.send('/api/deals/'+deal.id);
          check('read_does_not_release_funds',read.lifecycle.status==='done'&&read.lifecycle.held===held&&read.lifecycle.payments.length===payments);
          deal=await c.post('/api/deals/'+deal.id+'/disputes',{expected_active_version_id:v2,reason:'unresolved_work',detail:'Synthetic rehearsal: the customer requests agreed rework.'});
          check('dispute_holds_current_version_funds',deal.lifecycle.status==='disputed'&&deal.lifecycle.held===held&&deal.lifecycle.dispute.version_id===v2);
          const dispute=deal.lifecycle.dispute.id;
          deal=await c.post('/api/deals/'+deal.id+'/evidence',{expected_active_version_id:v2,dispute_id:dispute,text:'Synthetic inspection note for this agreed version.'});
          check('evidence_is_preserved',deal.lifecycle.dispute.evidence.length===1);
          await c.post('/api/deals/'+deal.id+'/confirm-done',{expected_active_version_id:v2},409);check('unresolved_dispute_blocks_release',true);
          deal=await providerAction('respond_dispute',{expected_active_version_id:v2,dispute_id:dispute,accept:true,note:'The simulated provider accepts rework.'});
          check('rework_requires_renewed_completion',deal.lifecycle.status==='paid'&&deal.lifecycle.done_version_id===null&&deal.lifecycle.held===held);
          deal=await providerAction('done',{expected_active_version_id:v2});
          deal=await c.post('/api/deals/'+deal.id+'/confirm-done',{expected_active_version_id:v2});
          deal=await c.post('/api/deals/'+deal.id+'/confirm-done',{expected_active_version_id:v2});
          check('release_is_exact_and_idempotent',deal.lifecycle.status==='released'&&deal.lifecycle.held===0&&deal.lifecycle.released===held&&deal.lifecycle.payments.filter(row=>row.kind==='release').length===1);
          deal=await c.post('/api/deals/'+deal.id+'/reviews',{expected_active_version_id:v2,stars:5,tags:['Agreed price'],comment:'Synthetic rehearsal: clear agreed costs.'});
          deal=await providerAction('reply_review',{expected_active_version_id:v2,text:'Thank you for reviewing the agreed work.'});
          check('settled_review_and_provider_reply_persist',deal.lifecycle.rating.stars===5&&!!deal.lifecycle.rating.reply);
          const history=await c.send('/api/requests');
          const entry=history.requests.find(row=>row.id===request.id);
          const resumed=await c.send('/api/deals/'+entry.deal_id);
          check('own_history_resumes_final_active_version',entry.active_version_id===v2&&resumed.lifecycle.status==='released'&&entry.committed_total===held);
          journey.outcome={request_id:request.id,deal_id:deal.id,v1_total:v1Terms.committed_total,v2_total:held,topup:optional.quantity*optional.unit_price,lifecycle:deal.lifecycle.status,review_stars:deal.lifecycle.rating.stars,dispute_status:deal.lifecycle.dispute.status,history_row_status:entry.status};
        });
        journey.status='passed';
        const final=await c.send('/api/requests/'+request.id),engines={rules:0,model:0,none:0};
        for(const event of final.events)engines[event.engine??'none']++;
        journey.engines=engines;
        journey.engine_events_by_kind={};
        for(const event of final.events){const key=event.kind+':'+(event.engine??'none');journey.engine_events_by_kind[key]=(journey.engine_events_by_kind[key]??0)+1;}
        journey.explicit_fallback_events=final.events.filter(event=>['validation_rejected','fallback'].includes(event.kind)).length;
        journey.quote_rules_fallbacks=live&&agents.extractor?final.events.filter(event=>event.kind==='quote_updated'&&event.engine==='rules').length:0;
      }catch{journey.status='failed';}
      for(let number=journey.stages.length;number<12;number++)journey.stages.push({number,name:STAGES[number],status:'blocked',elapsed_ms:0,flags:{}});
    }
    for(let i=0;i<journeys.length;i++){
      const own=await clients[i].send('/api/requests');
      journeys[i].flags.history_isolated=own.requests.every(row=>!journeys.some((other,index)=>index!==i&&other.outcome?.request_id===row.id));
      if(!journeys[i].flags.history_isolated)journeys[i].status='failed';
    }
    const matrix=STAGES.map((name,number)=>({number,name,categories:Object.fromEntries(journeys.map(journey=>[journey.category,journey.stages[number].status]))}));
    const stageRows=journeys.flatMap(journey=>journey.stages),allFlags=stageRows.flatMap(stage=>Object.values(stage.flags)),usage=calls.reduce((totals,row)=>Object.fromEntries(Object.keys(totals).map(key=>[key,totals[key]+Number(row.usage?.[key]??0)])),{input_tokens:0,output_tokens:0,total_tokens:0});
    const budget=(await store.query('SELECT value_json FROM settings WHERE key=$1',['model_daily_attempts'])).rows[0];
    const result={suite:live?'wasit-customer-pipeline-live-v1':'wasit-customer-pipeline-rules-v1',started_at:started,finished_at:new Date().toISOString(),mode:live?'OpenAI with verified rules fallback':'Rules only',summary:{journeys:journeys.length,journeys_passed:journeys.filter(row=>row.status==='passed').length,stages:stageRows.length,stages_passed:stageRows.filter(row=>row.status==='passed').length,flags:allFlags.length,flags_passed:allFlags.filter(Boolean).length,http_requests:clients.reduce((total,c)=>total+c.stats.requests,0),actual_model_calls:calls.length,model_call_cap:live?callCap:0,usage},stage_matrix:matrix,journeys,model_calls:calls,model_budget:budget?JSON.parse(budget.value_json):null,
      limitations:['Local actual HTTP against an isolated SQLite backend; not a hosted PostgreSQL rehearsal.','Providers and payment movements are explicitly simulated.','Human no-reply timeout uses an advanced injected clock, not a ninety-second wall-clock wait.','Stage checks measure workflow invariants, not general model quality or real provider/OCR accuracy.','Named credentials, cookies, provider tokens and request headers are never written to this report.']};
    await mkdir(outputDir,{recursive:true});
    await writeFile(resolve(outputDir,live?'pipeline-e2e-live.json':'pipeline-e2e-rules.json'),JSON.stringify(result,null,2)+'\n');
    return result;
  }finally{await new Promise(resolve=>server.close(resolve));await app.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const configuredCap=process.argv.find(value=>value.startsWith('--call-cap='));
    const result=await runPipeline({live:process.argv.includes('--live'),...(configuredCap?{callCap:Number(configuredCap.slice(11))}:{}),onProgress:value=>process.stdout.write(JSON.stringify(value)+'\n')});
    process.stdout.write(JSON.stringify(result.summary,null,2)+'\n');
    if(result.summary.journeys_passed!==result.summary.journeys)process.exitCode=1;
  }catch(cause){process.stderr.write(JSON.stringify({error_code:cause.code??'pipeline_failed',message:'The pipeline rehearsal could not complete; no credential details are printed.'})+'\n');process.exitCode=1;}
}

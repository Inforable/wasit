import { randomBytes, createHash } from 'node:crypto';
import { HttpError } from './errors.mjs';
import { publicAgentNote } from './agent-notes.mjs';
import { formatRequest } from './formatter.mjs';
import { compareQuotes } from './comparison.mjs';
import { decideBuyer } from './buyer-policy.mjs';
import { scriptedReply } from './providers.mjs';

const makeId = (prefix) => prefix + '_' + randomBytes(10).toString('hex');
const parse = (text, fallback = null) => { try { return text ? JSON.parse(text) : fallback; } catch { return fallback; } };
const error = (status, code, text) => new HttpError(status, code, text);
const agent = {role:'agent',actor_id:'system_wasit01',internal:true};
export const TASK_LEASE_MS = 45_000;
export const HUMAN_REPLY_MS = 90_000;
const stableKey = (text) => createHash('sha256').update(text).digest('hex').slice(0,32);
const modeOf = (mode) => mode === 'human' || mode === 'manual' ? 'human' : mode === 'model' ? 'model' : 'script';

/** Explicit processing calls advance persisted work; reads never start background work. */
export function createRequests({store,now=Date.now,newId=makeId,formatter=formatRequest,directory,communications,quotes,auth,llm=null,providerReply=null,agreements,lifecycle} = {}) {
  if (!store?.transaction || !directory || !communications || !quotes) throw new TypeError('Request services and a transactional store are required.');
  const first = async(db,sql,params=[]) => (await db.query(sql,params)).rows[0] ?? null;
  function consumer(actor) {
    if (!actor?.actor_id) throw error(401,'session_required','Sign in to continue.');
    if (actor.role !== 'consumer') throw error(403,'wrong_role','This action is available to the customer only.');
  }
  async function owned(db,id,actor) {
    consumer(actor);
    const row=await first(db,'SELECT * FROM requests WHERE id=$1 AND user_id=$2 AND archived_at IS NULL',[id,actor.actor_id]);
    if (!row) throw error(404,'not_found','The request was not found.');
    return row;
  }
  async function event(db,requestId,branchId,kind,summary,{engine='rules',sources=[]}={}) {
    const at=now();
    await db.query('INSERT INTO events(id,request_id,branch_id,t_ms,actor,kind,engine,title,data_json,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [newId('event'),requestId,branchId??null,0,'wasit',kind,engine,summary,JSON.stringify({source_message_ids:sources}),at]);
  }
  async function enqueue(db,request,branchId,kind,source,payload={},due=now()) {
    const previous=await first(db,'SELECT id FROM tasks WHERE request_id=$1 AND (branch_id=$2 OR (branch_id IS NULL AND $2 IS NULL)) AND kind=$3 AND source_key=$4',
      [request.id,branchId,kind,source]);
    if (previous) return previous.id;
    const id=newId('task');
    await db.query('INSERT INTO tasks(id,request_id,branch_id,kind,source_key,generation,status,due_at,payload_json,created_at,updated_at,attempts) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING',
      [id,request.id,branchId,kind,source,Number(request.generation??0),'pending',due,JSON.stringify(payload),now(),now(),0]);
    return id;
  }
  async function insertRequest(db,input,actor,id,result,parentId=null) {
    const status=result.status==='ready'?'contacting':'needs_clarification',at=now();
    await db.query('INSERT INTO requests(id,parent_id,user_id,request_text,input_json,generation,status,job_json,questions_json,weights_json,formatter_by,manual_for,scenario_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
      [id,parentId,actor.actor_id,input.request_text,JSON.stringify(input),0,status,result.job?JSON.stringify(result.job):null,JSON.stringify(result.questions??[]),JSON.stringify(result.job?.weights??{}),result.engine==='model'?'model':'rules',input.manual_for??null,input.scripted?'scripted':null,at]);
    const request=await first(db,'SELECT * FROM requests WHERE id=$1',[id]);
    await event(db,id,null,'request_created',result.job?'The request is ready to contact eligible providers.':'A few request details need confirmation.',{engine:result.engine==='model'?'model':'rules'});
    if(result.rejected)await event(db,id,null,'validation_rejected',String(result.rejected).slice(0,240));
    if (result.job) await enqueue(db,request,null,'discover','initial');
    return request;
  }
  async function create(input,actor) {
    consumer(actor);
    const id=newId('request');
    const result=await formatter(input,{now:now(),id});
    await store.transaction(tx=>insertRequest(tx,input,actor,id,result));
    return snapshot(id,actor);
  }
  async function clarify(requestId,{answers}={},actor) {
    const parent=await owned(store,requestId,actor);
    if (!answers || typeof answers!=='object' || Array.isArray(answers)) throw error(400,'invalid_payload','Answer the requested clarification questions.');
    const original=parse(parent.input_json,{request_text:parent.request_text});
    const input={...original,answers:{...original.answers,...answers}},id=newId('request');
    const formatted=await formatter(input,{now:now(),id});
    const childId=await store.transaction(async tx=>{
      await tx.query('UPDATE requests SET status=status WHERE id=$1',[requestId]);
      const row=await owned(tx,requestId,actor);
      const child=await first(tx,'SELECT id FROM requests WHERE parent_id=$1 AND user_id=$2 AND archived_at IS NULL ORDER BY created_at,id LIMIT 1',[requestId,actor.actor_id]);
      if(child)return child.id;
      if(row.status!=='needs_clarification')throw error(409,'invalid_transition','This request does not need clarification.');
      await insertRequest(tx,input,actor,id,formatted,requestId);
      return id;
    });
    return snapshot(childId,actor);
  }
  async function comparison(request,branches) {
    const allQuotes=[],providers={};
    for(const branch of branches) {
      const quote=await quotes.current(branch.id);
      if(quote)allQuotes.push(quote);
      providers[branch.id]={rating:branch.rating};
    }
    return request.job_json?compareQuotes({job:parse(request.job_json),quotes:allQuotes,providers}):{comparison:{groups:[],excluded:[]},cards:[]};
  }
  async function snapshot(requestId,actor) {
    const request=await owned(store,requestId,actor);
    const rows=(await store.query('SELECT b.*,p.name AS provider_label,p.rating FROM branches b LEFT JOIN providers p ON p.id=b.provider_id WHERE b.request_id=$1 ORDER BY b.created_at,b.id',[requestId])).rows;
    const branches=[];
    for(const row of rows) branches.push({
      id:row.id,provider_label:row.provider_label??'Service provider',mode:modeOf(row.mode),wasit_mode:row.wasit_mode==='customer'?'customer':'agent',
      status:['awaiting_reply','processing','ready','closed','timed_out'].includes(row.status)?row.status:'awaiting_reply',
      clarifications_sent:Number(row.clarifications_sent??0),countered:!!row.countered,asked_terms:!!row.asked_terms,
      messages:await communications.messages(row.id),quote:await quotes.current(row.id),
    });
    const events=(await store.query('SELECT * FROM events WHERE request_id=$1 ORDER BY created_at,id',[requestId])).rows.map(row=>({
      id:String(row.id),request_id:requestId,branch_id:row.branch_id??null,created_at:Number(row.created_at),
      kind:row.kind,engine:['rules','model'].includes(row.engine)?row.engine:null,summary:row.kind==='validation_rejected'?publicAgentNote(row.title??row.detail):row.title??row.detail??'Request updated.',
      source_message_ids:parse(row.data_json,{})?.source_message_ids??[],
    }));
    const ranking=await comparison(request,rows);
    const dealRow=await first(store,'SELECT id,active_version_id FROM deals WHERE request_id=$1 ORDER BY created_at DESC LIMIT 1',[requestId]);
    const deal=dealRow&&agreements?await agreements.getDeal(dealRow.id,actor):null;
    return {id:requestId,status:dealRow?.active_version_id?'locked':request.status,job:parse(request.job_json),questions:parse(request.questions_json,[]),branches,events,...ranking,deal,created_at:Number(request.created_at)};
  }
  async function lockRuntime(tx) {
    await tx.query("INSERT INTO settings(key,value_json) VALUES($1,$2) ON CONFLICT(key) DO NOTHING",['request_runtime_lock','{}']);
    await tx.query('UPDATE settings SET value_json=value_json WHERE key=$1',['request_runtime_lock']);
  }
  async function claim(requestId,actor) {
    return store.transaction(async tx=>{
      await lockRuntime(tx);
      const request=await owned(tx,requestId,actor),at=now();
      await tx.query("UPDATE tasks SET status='pending',lease_token=NULL,lease_until=NULL,updated_at=$1 WHERE status='processing' AND lease_until<=$1",[at]);
      await tx.query("UPDATE tasks SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE request_id=$1 AND generation<>$2 AND status IN ('pending','processing')",[requestId,Number(request.generation??0)]);
      const running=await first(tx,"SELECT COUNT(*) AS count FROM tasks WHERE status='processing' AND lease_until>$1",[at]);
      if(Number(running.count)>=2)return null;
      const pending=(await tx.query("SELECT * FROM tasks WHERE request_id=$1 AND generation=$2 AND status='pending' AND due_at<=$3 ORDER BY due_at,created_at,id",[requestId,Number(request.generation??0),at])).rows;
      for(const task of pending) {
        if(task.branch_id) {
          const busy=await first(tx,"SELECT id FROM tasks WHERE branch_id=$1 AND status='processing' AND lease_until>$2",[task.branch_id,at]);
          if(busy)continue;
        }
        const token=newId('lease');
        await tx.query("UPDATE tasks SET status='processing',lease_token=$1,lease_until=$2,attempts=attempts+1,updated_at=$3 WHERE id=$4",[token,at+TASK_LEASE_MS,at,task.id]);
        return {...task,lease_token:token,lease_until:at+TASK_LEASE_MS,attempts:Number(task.attempts)+1,request};
      }
      return null;
    });
  }
  async function valid(tx,task) {
    const row=await first(tx,"SELECT t.id FROM tasks t JOIN requests r ON r.id=t.request_id WHERE t.id=$1 AND t.status='processing' AND t.lease_token=$2 AND t.lease_until>$3 AND t.generation=r.generation AND r.archived_at IS NULL",[task.id,task.lease_token,now()]);
    if(!row)throw error(409,'stale_task','This work was cancelled or replaced.');
  }
  async function commit(task,fn) {
    return store.transaction(async tx=>{
      await tx.query('UPDATE requests SET status=status WHERE id=$1',[task.request_id]);
      await valid(tx,task);
      const result=await fn(tx);
      await tx.query("UPDATE tasks SET status='done',lease_token=NULL,lease_until=NULL,updated_at=$1 WHERE id=$2",[now(),task.id]);
      return result;
    });
  }
  const guards=task=>({expectedGeneration:Number(task.generation),taskId:task.id,leaseToken:task.lease_token});
  async function isLocked(requestId) {
    return !!await first(store,'SELECT id FROM deals WHERE request_id=$1 AND active_version_id IS NOT NULL',[requestId]);
  }
  async function execute(task) {
    const request=task.request,job=parse(request.job_json),payload=parse(task.payload_json,{});
    await store.transaction(tx=>valid(tx,task));
    if(task.kind==='discover') {
      const found=await directory.discover(job,{limit:5,scripted:request.scenario_id==='scripted'});
      if(!found.providers.length)return commit(task,async tx=>{
        await tx.query("UPDATE requests SET status='no_match',evaluated_at=$1 WHERE id=$2",[now(),request.id]);
        await event(tx,request.id,null,'rank','No eligible providers are available for this request.');
      });
      const branches=await communications.createBranches(request.id,job,found.providers,guards(task));
      return commit(task,async tx=>{
        for(const branch of branches)await enqueue(tx,request,branch.id,'rfq','initial');
        await tx.query("UPDATE requests SET status='negotiating' WHERE id=$1",[request.id]);
      });
    }
    const branch=await first(store,'SELECT * FROM branches WHERE id=$1 AND request_id=$2',[task.branch_id,request.id]);
    if(!branch)throw error(404,'not_found','The provider branch was not found.');
    if(task.kind==='timeout')return commit(task,async tx=>{
      if(branch.status==='awaiting_reply'&&Number(branch.deadline_at)<=now()) {
        await tx.query("UPDATE branches SET status='timed_out',updated_at=$1 WHERE id=$2",[now(),branch.id]);
        await event(tx,request.id,branch.id,'branch_timeout','The provider did not reply before the persisted deadline.');
      }
    });
    if(task.kind==='rfq'||task.kind==='send') {
      if(branch.wasit_mode==='customer'||await isLocked(request.id))return commit(task,async()=>{});
      const text=task.kind==='rfq'?communications.rfqText(job):payload.text;
      const sent=await communications.appendAgentMessage({branchId:branch.id,text,clientMessageId:'agent_'+stableKey(task.id),intent:payload.intent??'rfq',engine:payload.engine??'rules',...guards(task)});
      return commit(task,async tx=>{
        const deadline=now()+HUMAN_REPLY_MS;
        await tx.query("UPDATE branches SET status='awaiting_reply',deadline_at=$1,updated_at=$2 WHERE id=$3",[deadline,now(),branch.id]);
        if(modeOf(branch.mode)==='human')await enqueue(tx,request,branch.id,'timeout',sent.message.id,{},deadline);
        else await enqueue(tx,request,branch.id,'reply',sent.message.id,{intent:payload.intent??'rfq',detailKey:payload.detailKey??null});
      });
    }
    if(task.kind==='reply') {
      if(branch.wasit_mode==='customer'||await isLocked(request.id))return commit(task,async()=>{});
      const provider=await directory.getProvider(branch.provider_id),prices=await directory.pricesOf(branch.provider_id);
      const replyInput={provider,prices,job,intent:payload.intent??'rfq',detailKey:payload.detailKey};
      let output;
      try{output=providerReply?await providerReply(replyInput):null;}catch{output={message:scriptedReply(replyInput),engine:'rules',rejected:'The provider simulation model was unavailable.'};}
      const text=output?.message??scriptedReply(replyInput);
      if(!text)return commit(task,async()=>{});
      const sent=await communications.appendMessage({branchId:branch.id,actor:{role:'provider',actor_id:'system_script01',provider_id:provider.id,internal:true},text,clientMessageId:'script_'+stableKey(task.id),...guards(task)});
      return commit(task,async tx=>{
        await enqueue(tx,request,branch.id,'quote',sent.message.id,{messageId:sent.message.id});
        await tx.query('UPDATE branches SET mode=$1 WHERE id=$2',[output?.engine==='model'?'model':'script',branch.id]);
        if(output?.rejected)await event(tx,request.id,branch.id,'validation_rejected',String(output.rejected).slice(0,240),{sources:[sent.message.id]});
        await event(tx,request.id,branch.id,'message_received','The provider replied to the request.',{sources:[sent.message.id],engine:output?.engine==='model'?'model':'rules'});
      });
    }
    if(task.kind==='quote') {
      const result=await quotes.processMessage({branchId:branch.id,messageId:payload.messageId,...guards(task)});
      return commit(task,async tx=>{
        await tx.query("UPDATE branches SET deadline_at=NULL WHERE id=$1",[branch.id]);
        await tx.query("UPDATE tasks SET status='cancelled' WHERE branch_id=$1 AND kind='timeout' AND status='pending'",[branch.id]);
        await enqueue(tx,request,branch.id,'decide',result.quote.id,{quoteId:result.quote.id});
      });
    }
    if(task.kind==='decide') {
      if(branch.wasit_mode==='customer'||await isLocked(request.id))return commit(task,async tx=>{
        await tx.query("UPDATE branches SET status='ready' WHERE id=$1",[branch.id]);
      });
      const quote=await quotes.current(branch.id),competitorQuotes=[];
      const others=(await store.query('SELECT id FROM branches WHERE request_id=$1 AND id<>$2',[request.id,branch.id])).rows;
      for(const other of others){const current=await quotes.current(other.id);if(current)competitorQuotes.push(current);}
      const decision=await decideBuyer({job,quote,branch,competitorQuotes},llm);
      return commit(task,async tx=>{
        const fresh=await first(tx,'SELECT * FROM branches WHERE id=$1',[branch.id]);
        if(fresh.wasit_mode==='customer')return;
        if(decision.rejected)await event(tx,request.id,branch.id,'validation_rejected',decision.rejected,{sources:decision.source_message_ids});
        await event(tx,request.id,branch.id,'decision',decision.reason,{engine:decision.engine,sources:decision.source_message_ids});
        if(decision.action==='close') {
          await tx.query("UPDATE branches SET status='ready',deadline_at=NULL,updated_at=$1 WHERE id=$2",[now(),branch.id]);
        } else {
          const count=Number(fresh.clarifications_sent??0)+(decision.action==='ask_detail'?1:0);
          await tx.query('UPDATE branches SET clarifications_sent=$1,countered=$2,asked_terms=$3,status=$4,updated_at=$5 WHERE id=$6',
            [count,fresh.countered||decision.action==='counter'?1:0,fresh.asked_terms||decision.action==='counter_terms'?1:0,'processing',now(),branch.id]);
          await enqueue(tx,request,branch.id,'send',quote.id,{text:decision.message,intent:decision.action==='ask_detail'?'clarify':decision.action,detailKey:decision.detail_key,engine:decision.engine});
        }
      });
    }
    throw error(422,'unknown_task','The persisted task kind is not supported.');
  }
  async function evaluate(requestId,actor,{force=false}={}) {
    const request=await owned(store,requestId,actor);
    if(!request.job_json||await isLocked(requestId))return;
    const branches=(await store.query('SELECT b.*,p.rating FROM branches b LEFT JOIN providers p ON p.id=b.provider_id WHERE request_id=$1',[requestId])).rows;
    const remaining=await first(store,"SELECT id FROM tasks WHERE request_id=$1 AND generation=$2 AND status IN ('pending','processing') LIMIT 1",[requestId,Number(request.generation??0)]);
    if(!force&&remaining)return;
    const ranked=await comparison(request,branches);
    await store.transaction(async tx=>{
      await tx.query('UPDATE requests SET status=status WHERE id=$1',[requestId]);
      const current=await owned(tx,requestId,actor);
      if(Number(current.generation)!==Number(request.generation))return;
      if(['needs_clarification','awaiting_customer','no_match','locked'].includes(current.status)&&!force)return;
      const deal=await first(tx,'SELECT id FROM deals WHERE request_id=$1 AND active_version_id IS NOT NULL',[requestId]);
      if(deal)return;
      await tx.query('UPDATE requests SET status=$1,evaluated_at=$2 WHERE id=$3',[ranked.cards.length?'awaiting_customer':'no_match',now(),requestId]);
      await event(tx,requestId,null,'rank',ranked.cards.length?'Comparable quotes are ready for customer review.':'No complete comparable quote is available.');
    });
  }
  async function process(requestId,actor,{maxSteps=2}={}) {
    await owned(store,requestId,actor);
    if(!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>2)throw error(400,'invalid_payload','Process one or two persisted steps at a time.');
    for(let step=0;step<maxSteps;step++){
      const task=await claim(requestId,actor);
      if(!task)break;
      try{await execute(task);}
      catch(cause){
        if(cause.code==='stale_task'||cause.code==='not_found')continue;
        await store.transaction(async tx=>{
          try{await valid(tx,task);}catch{return;}
          const retry=task.attempts<3;
          await tx.query('UPDATE tasks SET status=$1,lease_token=NULL,lease_until=NULL,updated_at=$2,due_at=$3 WHERE id=$4',[retry?'pending':'failed',now(),now(),task.id]);
          if(!retry){
            if(task.branch_id)await tx.query("UPDATE branches SET status='closed' WHERE id=$1",[task.branch_id]);
            await event(tx,requestId,task.branch_id,'fallback','Automatic processing could not complete this step; the customer can review available information.');
          }
        });
      }
    }
    await evaluate(requestId,actor);
    return snapshot(requestId,actor);
  }
  async function finish(requestId,actor) {
    await store.transaction(async tx=>{
      await tx.query('UPDATE requests SET status=status WHERE id=$1',[requestId]);
      await owned(tx,requestId,actor);
      await tx.query("UPDATE tasks SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE request_id=$1 AND status IN ('pending','processing')",[requestId]);
      await tx.query("UPDATE branches SET status=CASE WHEN status='ready' THEN status ELSE 'closed' END,deadline_at=NULL WHERE request_id=$1",[requestId]);
    });
    await evaluate(requestId,actor,{force:true});
    return snapshot(requestId,actor);
  }
  async function receiveProviderMessage(branchId,{text,client_message_id}={},actor) {
    const branch=await first(store,'SELECT b.*,r.generation,r.archived_at,r.user_id FROM branches b JOIN requests r ON r.id=b.request_id WHERE b.id=$1',[branchId]);
    if(!actor?.actor_id)throw error(401,'session_required','Use the provider access link.');
    if(actor.role!=='provider'||actor.branch_id!==branchId||!branch||modeOf(branch.mode)!=='human'||branch.archived_at!=null)throw error(403,'wrong_role','This provider branch is not available.');
    const result=await communications.appendMessage({branchId,actor,text,clientMessageId:client_message_id,expectedGeneration:Number(branch.generation)});
    await store.transaction(async tx=>{
      const request=await first(tx,'SELECT * FROM requests WHERE id=$1 AND archived_at IS NULL AND generation=$2',[branch.request_id,Number(branch.generation)]);
      if(!request)throw error(409,'stale_task','This request was reset.');
      await enqueue(tx,request,branchId,'quote',result.message.id,{messageId:result.message.id});
      await tx.query("UPDATE tasks SET status='cancelled' WHERE branch_id=$1 AND kind='timeout' AND status='pending'",[branchId]);
      if(!result.replayed)await event(tx,branch.request_id,branchId,'message_received','The provider sent a message.',{sources:[result.message.id],engine:null});
      const locked=await first(tx,'SELECT id FROM deals WHERE request_id=$1 AND active_version_id IS NOT NULL',[request.id]);
      if(!locked)await tx.query("UPDATE requests SET status='negotiating' WHERE id=$1",[request.id]);
    });
    return result;
  }
  async function takeover(requestId,branchId,{mode}={},actor) {
    if(!['customer','agent'].includes(mode))throw error(400,'invalid_payload','Choose customer or agent control.');
    await store.transaction(async tx=>{
      await tx.query('UPDATE requests SET status=status WHERE id=$1',[requestId]);
      const request=await owned(tx,requestId,actor);
      const branch=await first(tx,'SELECT * FROM branches WHERE id=$1 AND request_id=$2',[branchId,requestId]);
      if(!branch)throw error(404,'not_found','The provider branch was not found.');
      await tx.query('UPDATE branches SET wasit_mode=$1,updated_at=$2 WHERE id=$3',[mode,now(),branchId]);
      if(mode==='customer'){
        await tx.query("UPDATE tasks SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE branch_id=$1 AND kind IN ('rfq','reply','send','decide') AND status IN ('pending','processing')",[branchId]);
      }else{
        const latest=await first(tx,'SELECT id FROM quotes WHERE branch_id=$1 ORDER BY version DESC LIMIT 1',[branchId]);
        if(latest)await enqueue(tx,request,branchId,'decide',latest.id+':resume:'+newId('resume'));
      }
    });
    return snapshot(requestId,actor);
  }
  async function say(requestId,branchId,{text,client_message_id}={},actor) {
    const request=await owned(store,requestId,actor);
    const branch=await first(store,'SELECT * FROM branches WHERE id=$1 AND request_id=$2',[branchId,requestId]);
    if(!branch)throw error(404,'not_found','The provider branch was not found.');
    if(branch.wasit_mode!=='customer')throw error(409,'not_taken_over','Take over this branch before sending a message.');
    const sent=await communications.appendMessage({branchId,actor,text,clientMessageId:client_message_id??newId('client'),expectedGeneration:Number(request.generation)});
    return snapshot(requestId,actor);
  }
  async function reset(actor) {
    consumer(actor);
    return store.transaction(async tx=>{
      await lockRuntime(tx);
      const requests=(await tx.query('SELECT id FROM requests WHERE user_id=$1 AND archived_at IS NULL',[actor.actor_id])).rows;
      for(const request of requests){
        await tx.query('UPDATE requests SET archived_at=$1,generation=generation+1 WHERE id=$2',[now(),request.id]);
        await tx.query("UPDATE tasks SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE request_id=$1 AND status IN ('pending','processing')",[request.id]);
        await tx.query('UPDATE branches SET token=NULL,token_hash=NULL,token_nonce=NULL,token_expires_at=NULL,deadline_at=NULL WHERE request_id=$1',[request.id]);
        await event(tx,request.id,null,'reset','The customer archived this request.');
      }
      return {ok:true,archived:requests.length};
    });
  }
  return {create,clarify,snapshot,process,finish,receiveProviderMessage,takeover,say,reset};
}

import { randomBytes } from 'node:crypto';
import { HttpError } from './errors.mjs';
import { catalog } from './catalog.mjs';
import { parseAmounts } from './money.mjs';
import { publicTerms } from './agreement-terms.mjs';
import { assertTaskGeneration } from './task-guard.mjs';

const failure = (status,code,message) => new HttpError(status,code,message);
const defaultId = (prefix) => prefix + '_' + randomBytes(10).toString('hex');
const parse = (value,fallback = null) => { try { return typeof value === 'string' ? JSON.parse(value) : value ?? fallback; } catch { return fallback; } };
const pick = (value,keys) => Object.fromEntries(keys.map((key) => [key,value[key] ?? null]));
const modeOf = (value) => value === 'human' || value === 'manual' ? 'human' : value === 'model' ? 'model' : 'script';
const messageView = (row) => ({
  id:String(row.id),branch_id:row.branch_id,sender:row.sender ?? (row.direction === 'in' ? 'provider' : 'agent'),
  text:row.text,created_at:Number(row.created_at),engine:row.sender === 'provider' || row.sender === 'consumer' ? null : row.engine ?? null,
});
function projectTerms(terms) {
  const projected = publicTerms(terms);
  projected.lines = (terms.lines ?? []).map((line) => pick(line,['id','item_code','label','kind','unit','quantity','unit_price','condition','source_message_id']));
  return projected;
}
export function rfqText(job) {
  const book = catalog(job.category);
  const requested = book.requiredItems.filter((id) => id !== 'transport').map((id) => book.items.find((item) => item.id === id).label).join(' and ');
  return `Hello. A customer needs ${book.label} for ${job.units} requested unit(s) in ${job.location_label}, ${job.schedule_label}. Please quote ${requested}, transport, what is included, your available slot and warranty. List optional work separately; extra work requires prior approval.`;
}
export function createCommunications({ store,now = Date.now,newId = defaultId,getDeal,mintToken } = {}) {
  if (!store?.query || !store?.transaction) throw new TypeError('A transactional store is required.');
  const first = async (db,text,params) => (await db.query(text,params)).rows[0] ?? null;
  const branchRow = async (db,id) => first(db,'SELECT b.*,r.user_id,r.job_json,r.generation AS request_generation,r.archived_at,p.name AS provider_label,p.category AS provider_category FROM branches b JOIN requests r ON r.id=b.request_id JOIN providers p ON p.id=b.provider_id WHERE b.id=$1',[id]);
  function authorize(row,actor,{send = false} = {}) {
    if (!actor?.actor_id) throw failure(401,'session_required','Sign in to continue.');
    if (!row) throw failure(404,'not_found','The provider branch was not found.');
    if (actor.role === 'provider') {
      const branchMatches = actor.branch_id ? actor.branch_id === row.id : actor.provider_id === row.provider_id;
      if (!branchMatches || (actor.provider_id && actor.provider_id !== row.provider_id) || (row.mode !== 'human' && actor.internal !== true)) throw failure(403,'wrong_role','This provider branch is not available.');
    } else if (actor.role === 'consumer') {
      if (actor.actor_id !== row.user_id) throw failure(404,'not_found','The provider branch was not found.');
      if (send && row.wasit_mode !== 'customer') throw failure(409,'not_taken_over','Take over this branch before sending a customer message.');
    } else if (actor.role !== 'agent' || actor.internal !== true) throw failure(403,'wrong_role','This action is not available for your role.');
  }
  async function createBranches(requestId,job,providers,{expectedGeneration,taskId,leaseToken} = {}) {
    if (!Array.isArray(providers) || !providers.length || providers.length > 5 || new Set(providers.map((p) => p.id)).size !== providers.length) throw failure(400,'invalid_payload','Choose one to five distinct eligible providers.');
    const created = await store.transaction(async (tx) => {
      await tx.query('UPDATE requests SET status=status WHERE id=$1',[requestId]);
      await assertTaskGeneration(tx,{requestId,expectedGeneration,taskId,leaseToken,now:now()});
      const request = await first(tx,'SELECT id,job_json FROM requests WHERE id=$1',[requestId]);
      if (!request || job.id !== requestId) throw failure(404,'not_found','The request was not found.');
      const saved = parse(request.job_json);
      if (saved && (saved.id !== job.id || saved.category !== job.category || saved.scope !== job.scope)) throw failure(409,'stale_version','The request details changed before contacting providers.');
      const rows = [];
      for (const selected of providers) {
        const provider = await first(tx,'SELECT * FROM providers WHERE id=$1',[selected.id]);
        if (!provider || provider.category !== job.category || !provider.consent) throw failure(409,'provider_unavailable','A selected provider is no longer available or has withdrawn consent.');
        let branch = await first(tx,'SELECT * FROM branches WHERE request_id=$1 AND provider_id=$2',[requestId,provider.id]);
        if (!branch) {
          const id = newId('branch'), mode = provider.persona === 'human' ? 'human' : 'script', at = now();
          await tx.query('INSERT INTO branches (id,request_id,provider_id,channel,mode,wasit_mode,status,round,clarifications_sent,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
            [id,requestId,provider.id,'sim_chat',mode,'agent','awaiting_reply',0,0,at,at]);
          branch = await first(tx,'SELECT * FROM branches WHERE id=$1',[id]);
        }
        rows.push({...branch,provider_label:provider.name});
      }
      return rows;
    });
    if (mintToken) for (const branch of created) if (modeOf(branch.mode) === 'human' && !branch.token_hash) await mintToken(branch.id);
    return created;
  }
  async function appendMessage({branchId,actor,text,clientMessageId,intent = null,engine = null,expectedGeneration,taskId,leaseToken}) {
    const body = typeof text === 'string' ? text.trim() : '';
    if (!body || body.length > 1000) throw failure(400,'invalid_payload','Send a message using 1 to 1,000 characters.');
    if (clientMessageId != null && (typeof clientMessageId !== 'string' || !/^[a-z]+_[a-zA-Z0-9_-]{6,64}$/.test(clientMessageId))) throw failure(400,'invalid_payload','Use a stable message identifier when retrying.');
    if (actor?.role !== 'agent' && !clientMessageId) throw failure(400,'invalid_payload','A stable message identifier is required.');
    return store.transaction(async (tx) => {
      const related = await first(tx,'SELECT request_id FROM branches WHERE id=$1',[branchId]);
      if (related) await tx.query('UPDATE requests SET status=status WHERE id=$1',[related.request_id]);
      await tx.query('UPDATE branches SET updated_at=updated_at WHERE id=$1',[branchId]);
      const branch = await branchRow(tx,branchId);
      authorize(branch,actor);
      await assertTaskGeneration(tx,{requestId:branch.request_id,branchId,expectedGeneration,taskId,leaseToken,now:now()});
      const sender = actor.role === 'agent' ? 'agent' : actor.role;
      if (clientMessageId) {
        const previous = await first(tx,'SELECT * FROM messages WHERE branch_id=$1 AND client_message_id=$2',[branchId,clientMessageId]);
        if (previous) {
          if (previous.text !== body || previous.sender !== sender) throw failure(409,'idempotency_conflict','This message identifier was already used for different content.');
          return {message:messageView(previous),replayed:true};
        }
      }
      authorize(branch,actor,{send:true});
      if (sender === 'agent' && branch.wasit_mode === 'customer' && !['booking','agreement','version'].includes(intent)) throw failure(409,'taken_over','The customer currently controls this branch.');
      const last = await first(tx,'SELECT MAX(created_at) AS at FROM messages WHERE branch_id=$1',[branchId]);
      const at = Math.max(now(),Number(last?.at ?? 0)+1);
      const id = newId('msg'), direction = sender === 'provider' ? 'in' : 'out';
      const actualEngine = sender === 'agent' ? (engine === 'model' ? 'model' : 'rules') : null;
      const actualIntent = sender === 'provider' ? 'reply' : sender === 'consumer' ? 'customer' : intent;
      await tx.query('INSERT INTO messages (id,branch_id,direction,intent,text,sender,client_message_id,engine,amounts_json,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [id,branchId,direction,actualIntent,body,sender,clientMessageId??null,actualEngine,JSON.stringify(parseAmounts(body).map((amount) => amount.value)),at]);
      if (sender === 'provider') await tx.query("UPDATE branches SET status='processing',updated_at=$1 WHERE id=$2",[at,branchId]);
      return {message:messageView(await first(tx,'SELECT * FROM messages WHERE id=$1',[id])),replayed:false};
    });
  }
  async function messages(branchId) {
    const rows = (await store.query('SELECT * FROM messages WHERE branch_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100',[branchId])).rows.reverse();
    return rows.map(messageView);
  }
  async function sourceMessage(id) {
    const row = await first(store,'SELECT * FROM messages WHERE id=$1',[id]);
    return row ? messageView(row) : null;
  }
  async function privateDeal(branchId) {
    const row = await first(store,'SELECT * FROM deals WHERE branch_id=$1',[branchId]);
    if (!row) return null;
    if (getDeal) return getDeal(row.id);
    const versions = [];
    for (const version of (await store.query('SELECT * FROM agreement_versions WHERE deal_id=$1 ORDER BY number',[row.id])).rows) {
      const acceptances = (await store.query('SELECT role FROM acceptances WHERE version_id=$1',[version.id])).rows;
      versions.push({id:version.id,number:Number(version.number),parent_version_id:version.parent_version_id??null,status:version.status,terms:parse(version.terms_json,{}),terms_digest:version.terms_digest,acceptances});
    }
    return {...row,versions};
  }
  async function providerSnapshot(branchId,actor) {
    const branch = await branchRow(store,branchId); authorize(branch,actor);
    const job = parse(branch.job_json);
    if (!job) throw failure(409,'invalid_transition','The request details are not available yet.');
    const deal = await privateDeal(branchId);
    if (deal && deal.branch_id !== branch.id) throw failure(409,'invalid_transition','The agreement does not belong to this provider branch.');
    return {
      branch_id:branch.id,provider_label:branch.provider_label,mode:modeOf(branch.mode),
      active_version_id:deal?.active_version_id??null,pending_version_id:deal?.pending_version_id??null,
      job_public:pick(job,['category','scope','units','location_label','schedule_label']),
      messages:await messages(branchId),
      versions:(deal?.versions??[]).map((version) => ({
        id:version.id,number:Number(version.number),parent_version_id:version.parent_version_id??null,status:version.status,
        public_terms:projectTerms(version.terms),terms_digest:version.terms_digest,
        consumer_accepted:(version.acceptances??[]).some((entry) => entry.role === 'consumer'),
        provider_accepted:(version.acceptances??[]).some((entry) => entry.role === 'provider'),
      })),
    };
  }
  return {
    createBranches,appendMessage,messages,sourceMessage,providerSnapshot,rfqText,
    appendAgentMessage:(input) => appendMessage({...input,actor:{role:'agent',actor_id:'system_wasit01',internal:true}}),
  };
}

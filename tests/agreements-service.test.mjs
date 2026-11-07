import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../server/store.mjs';
import { createAgreements } from '../server/agreements.mjs';
import { checkBillLines } from '../server/bill-check.mjs';
import { readFixture, createContractValidator } from '../scripts/contracts.mjs';

const validate = await createContractValidator();
const consumer = { role: 'consumer', actor_id: 'consumer_demo01' };
const provider = { role: 'provider', actor_id: 'provider_dingin01', branch_id: 'branch_human01' };
const stranger = { role: 'consumer', actor_id: 'consumer_other01' };
const isError = (status, code) => (error) => error.status === status && (!code || error.code === code);

async function setup(t) {
  const store = await openStore({ sqliteFile: ':memory:', databaseUrl: '', production: false });
  t.after(() => store.close());
  const job = await readFixture('job.json');
  let quote = await readFixture('quote.json');
  const initialMessage = await readFixture('message.json');
  const messages = new Map([[initialMessage.id, initialMessage]]);
  await store.query('INSERT INTO requests (id,user_id,request_text,status,job_json,created_at) VALUES ($1,$2,$3,$4,$5,$6)', [job.id, consumer.actor_id, job.request_text, 'awaiting_customer', JSON.stringify(job), job.created_at]);
  await store.query('INSERT INTO providers (id,name,category,consent) VALUES ($1,$2,$3,$4)', ['provider_dingin01','Dingin Jaya Teknik',job.category,1]);
  await store.query('INSERT INTO branches (id,request_id,provider_id,mode,status) VALUES ($1,$2,$3,$4,$5)', [quote.branch_id,job.id,'provider_dingin01','human','ready']);
  async function persist(next) {
    quote = structuredClone(next);
    await store.query('INSERT INTO quotes (id,branch_id,request_id,version,data_json,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', ['stored_' + String(next.revision).padStart(6,'0'),next.branch_id,job.id,next.revision,JSON.stringify(next),next.status,job.created_at + next.revision]);
  }
  await persist(quote);
  let counter = 0;
  const service = createAgreements({
    store, now: () => job.created_at + 5000 + counter,
    newId: (prefix) => prefix + '_test' + String(++counter).padStart(6,'0'),
    loadQuote: async () => structuredClone(quote),
    loadJob: async () => structuredClone(job),
    loadSourceMessage: async (id) => messages.get(id) ?? null,
  });
  const create = () => service.createDeal({ requestId:job.id,branchId:quote.branch_id,quoteRevision:quote.revision,actor:consumer });
  async function activate(deal = null) {
    deal ??= await create();
    let version = deal.versions.find((v) => v.id === deal.pending_version_id);
    const body = { version_id:version.id,terms_digest:version.terms_digest,expected_active_version_id:deal.active_version_id };
    deal = await service.submit(deal.id, body, consumer);
    deal = await service.accept(deal.id, { ...body,budget_ack_limit:version.terms.spending_limit }, consumer);
    return service.accept(deal.id, { ...body,budget_ack_limit:null }, provider);
  }
  async function addCandidate() {
    const changed = structuredClone(quote);
    changed.revision++;
    changed.lines[3].source = { message_id:'msg_change01',snippet:'ganti kapasitor 1 pcs Rp150.000' };
    messages.set('msg_change01', { id:'msg_change01',branch_id:quote.branch_id,sender:'provider',text:'Kapasitor rusak, ganti kapasitor 1 pcs Rp150.000, hanya setelah disetujui.',created_at:job.created_at+4000,engine:null });
    await persist(changed);
    return { expected_active_version_id:null,change_message_id:'msg_change01',committed_line_ids:[changed.lines[3].id],spending_limit:260000 };
  }
  return { store, service, job, messages, create, activate, persist, addCandidate, get quote() { return quote; } };
}

test('selection creates only a draft, excludes optional costs, and replays the original selection', async (t) => {
  const ctx = await setup(t);
  const first = await ctx.create();
  validate('deal.schema.json',first);
  assert.equal(first.active_version_id,null);
  assert.equal(first.versions[0].status,'draft');
  assert.equal(first.versions[0].terms.committed_total,110000);
  assert.equal(first.versions[0].terms.lines[3].kind,'optional');
  const replay = await ctx.create();
  assert.equal(replay.id,first.id);
  assert.equal((await ctx.store.query('SELECT COUNT(*) AS n FROM deals')).rows[0].n,1);
  const changed = structuredClone(ctx.quote); changed.revision++; await ctx.persist(changed);
  const oldReplay = await ctx.service.createDeal({requestId:ctx.job.id,branchId:changed.branch_id,quoteRevision:1,actor:consumer});
  assert.equal(oldReplay.id,first.id);
  await assert.rejects(ctx.create(),isError(409,'deal_exists'));
});

test('selection enforces the requested base quantity and exact appointment scope',async t=>{
  for(const change of ['quantity','schedule'])await t.test(change,async t=>{
    const ctx=await setup(t),quote=structuredClone(ctx.quote);quote.revision++;
    if(change==='quantity'){
      ctx.job.units=2;quote.units=2;
      await ctx.store.query('UPDATE requests SET job_json=$1 WHERE id=$2',[JSON.stringify(ctx.job),ctx.job.id]);
    }else quote.schedule_label='A different unrequested appointment';
    await ctx.persist(quote);
    await assert.rejects(ctx.create(),isError(422,'incomplete_quote'));
    assert.equal((await ctx.store.query('SELECT COUNT(*) AS n FROM deals')).rows[0].n,0);
  });
});

test('unprocessed provider messages block selection regardless of timestamps or ID ordering',async t=>{
  const ctx=await setup(t);
  const message={id:'msg_aaaaaa01',branch_id:ctx.quote.branch_id,sender:'provider',text:'Cuci AC sekarang Rp80.000',created_at:1};
  ctx.messages.set(message.id,message);
  await ctx.store.query('INSERT INTO messages(id,branch_id,sender,text,direction,created_at) VALUES($1,$2,$3,$4,$5,$6)',[message.id,message.branch_id,message.sender,message.text,'in',message.created_at]);
  await assert.rejects(ctx.create(),isError(409,'quote_processing'));
  const revised=structuredClone(ctx.quote);revised.revision++;revised.fixed_total=100000;
  revised.lines[0].unit_price=80000;revised.lines[0].source={message_id:message.id,snippet:message.text};
  await ctx.persist(revised);
  await ctx.store.query('UPDATE quotes SET source_message_id=$1 WHERE branch_id=$2 AND version=$3',[message.id,message.branch_id,revised.revision]);
  const deal=await ctx.create();
  assert.equal(deal.versions[0].terms.committed_total,100000);
});

test('archived requests cannot create or read agreements or accept existing proposals',async t=>{
  const ctx=await setup(t),deal=await ctx.create(),version=deal.versions[0];
  const body={version_id:version.id,terms_digest:version.terms_digest,expected_active_version_id:null,budget_ack_limit:version.terms.spending_limit};
  await ctx.store.query('UPDATE requests SET archived_at=$1,generation=generation+1 WHERE id=$2',[1,ctx.job.id]);
  await assert.rejects(ctx.create(),isError(404));
  await assert.rejects(ctx.service.getDeal(deal.id,consumer),isError(404));
  await assert.rejects(ctx.service.getPublicVersions(deal.id,provider),isError(404));
  await assert.rejects(ctx.service.submit(deal.id,body,consumer),isError(404));
  await assert.rejects(ctx.service.accept(deal.id,body,consumer),isError(404));
  await assert.rejects(ctx.service.reject(deal.id,body,consumer),isError(404));
  assert.equal((await ctx.store.query('SELECT COUNT(*) AS n FROM acceptances')).rows[0].n,0);
});

test('a reset during external quote loading discards a late selection before inserting a deal',async t=>{
  const ctx=await setup(t);let started,release;
  const ready=new Promise(resolve=>{started=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  const service=createAgreements({store:ctx.store,loadQuote:async()=>{started();await gate;return structuredClone(ctx.quote);},loadJob:async()=>structuredClone(ctx.job),loadSourceMessage:async id=>ctx.messages.get(id)});
  const selecting=service.createDeal({requestId:ctx.job.id,branchId:ctx.quote.branch_id,quoteRevision:ctx.quote.revision,actor:consumer});
  await ready;
  await ctx.store.query('UPDATE requests SET archived_at=$1,generation=generation+1 WHERE id=$2',[1,ctx.job.id]);
  release();await assert.rejects(selecting,isError(404));
  assert.equal((await ctx.store.query('SELECT COUNT(*) AS n FROM deals')).rows[0].n,0);
});

test('selection rejects wrong owners, provider impersonation, stale quote data and false source association', async (t) => {
  const ctx = await setup(t);
  await assert.rejects(ctx.service.createDeal({requestId:ctx.job.id,branchId:ctx.quote.branch_id,quoteRevision:1,actor:stranger}),isError(404));
  await assert.rejects(ctx.service.createDeal({requestId:ctx.job.id,branchId:ctx.quote.branch_id,quoteRevision:1,actor:provider}),isError(403));
  const stale = structuredClone(ctx.quote); stale.revision=2; await ctx.persist(stale);
  await assert.rejects(ctx.service.createDeal({requestId:ctx.job.id,branchId:stale.branch_id,quoteRevision:1,actor:consumer}),isError(409,'stale_quote'));
  ctx.messages.get('msg_quote01').branch_id='branch_other01';
  await assert.rejects(ctx.create(),isError(422,'invalid_source'));
});

test('two independent role acceptances activate atomically and repeated requests do not add acceptances', async (t) => {
  const ctx = await setup(t);
  let deal=await ctx.create(), version=deal.versions[0];
  const body={version_id:version.id,terms_digest:version.terms_digest,expected_active_version_id:null};
  await assert.rejects(ctx.service.accept(deal.id,{...body,budget_ack_limit:250000},consumer),isError(409,'invalid_transition'));
  deal=await ctx.service.submit(deal.id,body,consumer);
  await assert.rejects(ctx.service.accept(deal.id,{...body,budget_ack_limit:249999},consumer),isError(409,'stale_version'));
  await assert.rejects(ctx.service.accept(deal.id,{...body,budget_ack_limit:250000},provider),isError(409,'stale_version'));
  await Promise.all([
    ctx.service.accept(deal.id,{...body,budget_ack_limit:250000},consumer),
    ctx.service.accept(deal.id,{...body,budget_ack_limit:null},provider),
  ]);
  deal=await ctx.service.getDeal(deal.id,consumer);
  assert.equal(deal.active_version_id,version.id);
  assert.equal(deal.pending_version_id,null);
  assert.equal(deal.versions[0].acceptances.length,2);
  await Promise.all([
    ctx.service.accept(deal.id,{...body,budget_ack_limit:250000},consumer),
    ctx.service.accept(deal.id,{...body,budget_ack_limit:null},provider),
  ]);
  assert.equal((await ctx.store.query('SELECT COUNT(*) AS n FROM acceptances')).rows[0].n,2);
  validate('deal.schema.json',await ctx.service.getDeal(deal.id,consumer));
});

test('consumer and provider cannot read or mutate an unrelated agreement', async (t) => {
  const ctx=await setup(t), deal=await ctx.activate();
  await assert.rejects(ctx.service.getDeal(deal.id,stranger),isError(404));
  await assert.rejects(ctx.service.getDeal(deal.id,provider),isError(403));
  const body={version_id:deal.active_version_id,terms_digest:deal.versions[0].terms_digest,budget_ack_limit:null,expected_active_version_id:null};
  await assert.rejects(ctx.service.accept(deal.id,body,{...provider,branch_id:'branch_other01'}),isError(403));
  const publicVersions=await ctx.service.getPublicVersions(deal.id,provider);
  validate('common.schema.json#/$defs/provider_version',publicVersions[0]);
  const serialized=JSON.stringify(publicVersions);
  for(const key of ['spending_limit','budget_ack_limit','actor_id']) assert.ok(!serialized.includes(key),key);
});

test('new work above the old limit is rejected, then v2 needs both parties and preserves v1', async (t) => {
  const ctx=await setup(t);
  const original=await ctx.activate();
  const body=await ctx.addCandidate(); body.expected_active_version_id=original.active_version_id;
  await assert.rejects(ctx.service.proposeChange(original.id,{...body,spending_limit:250000},consumer),isError(422,'budget_exceeded'));
  assert.equal((await ctx.service.getDeal(original.id,consumer)).pending_version_id,null);
  let pending=await ctx.service.proposeChange(original.id,body,consumer);
  assert.equal(pending.active_version_id,original.active_version_id);
  assert.equal(pending.versions[1].terms.committed_total,260000);
  assert.equal(pending.versions[1].terms.spending_limit,260000);
  assert.equal((await ctx.service.proposeChange(original.id,body,consumer)).versions.length,2);
  const second=pending.versions[1];
  const acceptance={version_id:second.id,terms_digest:second.terms_digest,expected_active_version_id:original.active_version_id};
  pending=await ctx.service.submit(original.id,acceptance,consumer);
  pending=await ctx.service.accept(original.id,{...acceptance,budget_ack_limit:260000},consumer);
  assert.equal(pending.active_version_id,original.active_version_id);
  await assert.rejects(ctx.service.accept(original.id,{...acceptance,budget_ack_limit:250000},provider),isError(409));
  const active=await ctx.service.accept(original.id,{...acceptance,budget_ack_limit:null},provider);
  assert.equal(active.active_version_id,second.id);
  assert.equal(active.versions[0].status,'superseded');
  assert.deepEqual(active.versions[0].terms,original.versions[0].terms);
  assert.deepEqual(active.versions[0].acceptances,original.versions[0].acceptances);
  validate('deal.schema.json',active);
  await assert.rejects(ctx.store.query("UPDATE agreement_versions SET terms_json='{}' WHERE id=$1",[second.id]),/immutable/);
});

test('rejected changes retain the active version and cannot be accepted later', async (t) => {
  const ctx=await setup(t), initial=await ctx.activate();
  const proposal=await ctx.addCandidate(); proposal.expected_active_version_id=initial.active_version_id;
  const pending=await ctx.service.proposeChange(initial.id,proposal,consumer), version=pending.versions[1];
  const body={version_id:version.id,terms_digest:version.terms_digest,expected_active_version_id:initial.active_version_id};
  await ctx.service.submit(initial.id,body,consumer);
  await ctx.service.accept(initial.id,{...body,budget_ack_limit:260000},consumer);
  const rejected=await ctx.service.reject(initial.id,body,provider);
  assert.equal(rejected.active_version_id,initial.active_version_id);
  assert.equal(rejected.pending_version_id,null);
  await assert.rejects(ctx.service.accept(initial.id,{...body,budget_ack_limit:260000},consumer),isError(409,'invalid_transition'));
  await assert.rejects(ctx.service.accept(initial.id,{...body,budget_ack_limit:null},provider),isError(409,'invalid_transition'));
  assert.equal((await ctx.service.reject(initial.id,body,provider)).versions[1].status,'rejected');
});

test('invalid source, included items and provider-authored consumer changes are rejected', async (t) => {
  const ctx=await setup(t), initial=await ctx.activate();
  const body=await ctx.addCandidate(); body.expected_active_version_id=initial.active_version_id;
  await assert.rejects(ctx.service.proposeChange(initial.id,body,provider),isError(403));
  await assert.rejects(ctx.service.proposeChange(initial.id,{...body,change_message_id:'msg_quote01'},consumer),isError(422,'invalid_source'));
  const changed=structuredClone(ctx.quote); changed.revision++; changed.lines[3].item_code='cek_freon'; changed.lines[3].unit='service'; changed.lines[3].source.snippet='cek freon Rp150.000';
  ctx.messages.get('msg_change01').text='cek freon Rp150.000'; await ctx.persist(changed);
  await assert.rejects(ctx.service.proposeChange(initial.id,body,consumer),isError(422,'unsupported_change'));
  assert.equal((await ctx.service.getDeal(initial.id,consumer)).versions.length,1);
});

test('bill checks flag included fees, price changes, new work and split quantities without changing terms', async (t) => {
  const ctx=await setup(t), deal=await ctx.activate();
  const base={id:'bill_test0001',item_code:'cek_freon',label:'Refrigerant check',unit:'service',quantity:1,unit_price:25000,explanation:null};
  const checked=await ctx.service.checkBill(deal.id,{expected_active_version_id:deal.active_version_id,lines:[base]},consumer);
  assert.equal(checked.results[0].status,'already_included');
  validate('common.schema.json#/$defs/bill_check',checked);
  const terms=deal.versions[0].terms;
  const line=(id,item,unit,price,quantity=1)=>({id,item_code:item,label:item,unit,quantity,unit_price:price,explanation:null});
  const statuses=checkBillLines({terms,knownItems:['cuci_ac','transport','cek_freon','isi_freon','ganti_kapasitor'],lines:[
    line('bill_test0002','cuci_ac','unit',100000),line('bill_test0003','ganti_kapasitor','pcs',150000),
    line('bill_test0004','isi_freon','service',200000),line('bill_test0005','other','job',50000),
  ]});
  assert.deepEqual(statuses.results.map((r)=>r.status),['price_changed','new_work','new_work','needs_clarification']);
  const split=checkBillLines({terms,lines:[line('bill_test0006','cuci_ac','unit',90000),line('bill_test0007','cuci_ac','unit',90000)]});
  assert.ok(split.results.every((r)=>r.status==='needs_clarification'));
  const differentUnit=checkBillLines({terms,lines:[line('bill_test0008','cuci_ac','job',90000)]});
  assert.equal(differentUnit.results[0].status,'needs_clarification');
  assert.deepEqual((await ctx.service.getDeal(deal.id,consumer)).versions[0].terms,terms);
  await assert.rejects(ctx.service.checkBill(deal.id,{expected_active_version_id:'version_stale01',lines:[base]},consumer),isError(409,'stale_version'));
});

test('stale digest, different actor replay and altered committed totals cannot change agreement state', async (t) => {
  const ctx=await setup(t), deal=await ctx.create(), version=deal.versions[0];
  const body={version_id:version.id,terms_digest:version.terms_digest,expected_active_version_id:null};
  await assert.rejects(ctx.service.submit(deal.id,{...body,terms_digest:'f'.repeat(64)},consumer),isError(409,'stale_digest'));
  await ctx.service.submit(deal.id,body,consumer);
  await ctx.service.accept(deal.id,{...body,budget_ack_limit:250000},consumer);
  await assert.rejects(ctx.service.accept(deal.id,{...body,budget_ack_limit:250000},stranger),isError(404));
  await assert.rejects(ctx.service.accept(deal.id,{...body,budget_ack_limit:null},{...provider,actor_id:'provider_wrong01',branch_id:'branch_other01'}),isError(403));
  assert.equal((await ctx.service.getDeal(deal.id,consumer)).active_version_id,null);
});

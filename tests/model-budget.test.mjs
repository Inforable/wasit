import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../server/store.mjs';
import {createBudgetedFetch} from '../server/model-budget.mjs';
test('model attempt budgets persist across instances, cap parallel claims and reset on the next UTC day',async t=>{
 const store=await openStore({databaseUrl:'',sqliteFile:':memory:',production:false});t.after(()=>store.close());
 let time=Date.parse('2026-11-07T10:00:00Z'),calls=0;
 const options={store,now:()=>time,dailyLimit:2,fetchImpl:async()=>{calls++;return {ok:true};}};
 const first=createBudgetedFetch(options),second=createBudgetedFetch(options);
 const results=await Promise.allSettled([first('https://api.openai.com/v1/responses'),second('https://api.openai.com/v1/responses'),first('https://api.openai.com/v1/responses')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,2);
 assert.equal(results.find(r=>r.status==='rejected').reason.code,'model_budget_exhausted');assert.equal(calls,2);
 const recreated=createBudgetedFetch(options);await assert.rejects(recreated('url'),e=>e.code==='model_budget_exhausted');
 time+=86400000;await recreated('url');assert.equal(calls,3);
});
test('a zero model budget prevents network use and malformed persisted counters fail closed',async t=>{
 const store=await openStore({databaseUrl:'',sqliteFile:':memory:',production:false});t.after(()=>store.close());
 const now=()=>Date.parse('2026-11-07T10:00:00Z'),fetchImpl=async()=>{throw Error('network should not run');};
 await assert.rejects(createBudgetedFetch({store,now,fetchImpl,dailyLimit:0})('url'),e=>e.code==='model_budget_exhausted');
 await store.query('INSERT INTO settings(key,value_json) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value_json=$2',['model_daily_attempts',JSON.stringify({day:'2026-11-07',count:-1})]);
 await assert.rejects(createBudgetedFetch({store,now,fetchImpl})('url'),e=>e.code==='model_budget_unavailable');
 await store.query('UPDATE settings SET value_json=$1 WHERE key=$2',['malformed','model_daily_attempts']);
 await assert.rejects(createBudgetedFetch({store,now,fetchImpl})('url'),e=>e.code==='model_budget_unavailable');
});

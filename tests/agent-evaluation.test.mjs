import test from 'node:test';
import assert from 'node:assert/strict';
import {HELD_OUT_CASES,evaluateExtractor,runEvaluation} from '../scripts/eval-agents.mjs';

test('hand-labeled extraction set covers all categories and retains independent expected facts',async()=>{
  assert.equal(HELD_OUT_CASES.length,20);
  assert.equal(new Set(HELD_OUT_CASES.map(row=>row.id)).size,20);
  assert.equal(new Set(HELD_OUT_CASES.map(row=>row.category)).size,5);
  const before=JSON.stringify(HELD_OUT_CASES);
  const result=await evaluateExtractor();
  assert.equal(JSON.stringify(HELD_OUT_CASES),before);
  assert.equal(result.case_count,20);
  assert.ok(result.passed>=18);
  assert.equal(result.line_precision,1);
  assert.ok(result.failures.every(row=>['washer-explicit','unknown-price'].includes(row.id)));
  assert.equal(result.records.find(row=>row.id==='injection-same-clause').passed,true);
  assert.equal(result.records.find(row=>row.id==='cross-item-price').passed,true);
  assert.equal(result.records.find(row=>row.id==='denied-slot').passed,true);
});

test('evaluation reports unavailable model baseline without issuing paid calls',async()=>{
  let calls=0;
  const result=await runEvaluation({live:true,env:{},fetchImpl:async()=>{calls++;throw Error('No network expected.');}});
  assert.equal(result.model.status,'not_run');
  assert.equal(result.rules.model_calls,0);
  assert.equal(calls,0);
  assert.ok(result.rules.failures.every(row=>row.expected.length>0&&row.actual.length===0));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveTransport,LIVE_CALL_CAP} from '../scripts/eval-live-agents.mjs';

const options={body:JSON.stringify({model:'test-model',text:{format:{name:'wasit_test'}}}),headers:{Authorization:'Bearer example-private-secret'}};
test('live telemetry captures usage and output while redacting an echoed secret',async()=>{
  const progress=[];
  const transport=createLiveTransport({onProgress:row=>progress.push(row),fetchImpl:async()=>new Response(JSON.stringify({status:'completed',usage:{input_tokens:3,output_tokens:2,total_tokens:5},output:[{content:[{type:'output_text',text:JSON.stringify({message:'example-private-secret'})}]}]}),{status:200})});
  await transport.trackedFetch('https://api.openai.com/v1/responses',options);
  assert.deepEqual(transport.calls[0].usage,{input_tokens:3,output_tokens:2,total_tokens:5});
  assert.equal(transport.calls[0].output.message,'[REDACTED]');
  assert.equal(JSON.stringify(progress).includes('example-private-secret'),false);
  assert.equal(JSON.stringify(progress).includes('Authorization'),false);
});
test('live transport stops before another request once its explicit cap is reached',async()=>{
  let calls=0;
  const transport=createLiveTransport({cap:2,fetchImpl:async()=>{calls++;return new Response(JSON.stringify({status:'completed',output:[]}),{status:200});}});
  await transport.trackedFetch('https://api.openai.com/v1/responses',options);
  await transport.trackedFetch('https://api.openai.com/v1/responses',options);
  await assert.rejects(transport.trackedFetch('https://api.openai.com/v1/responses',options),{code:'call_cap'});
  assert.equal(calls,2);
  assert.equal(LIVE_CALL_CAP,30);
});

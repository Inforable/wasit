import test from 'node:test';
import assert from 'node:assert/strict';
import { extractWarrantyFact, validateWarrantyFact } from '../server/warranty-terms.mjs';
const message = text => ({ id: 'msg_warranty01', branch_id: 'branch_warranty01', sender: 'provider', text });
test('explicit bounded warranty and explicit no-coverage statements retain their whole provider source', () => {
  for (const [text, days] of [['Service warranty: 30 days.',30],['Garansi 60 hari.',60],['A 30-day warranty is included.',30],['No warranty is offered.',0],['Not covered by warranty.',0],['Garansi tidak ada.',0],['Warranty 0 days.',0],['Warranty 365 days.',365]]) {
    const input=message(text),fact=extractWarrantyFact(input);assert.equal(fact.warranty_days,days,text);assert.equal(fact.warranty_source.snippet,text);assert.equal(validateWarrantyFact({days,source:fact.warranty_source,message:input}),true);
  }
});
test('conditional, negated, conflicting or unsupported warranty durations stay unknown', () => {
  for (const text of ['Warranty 30 days if parts are replaced.','Warranty could be 60 days.','Warranty up to 30 days.','Warranty not 30 days.','Warranty 30 days or 60 days.','Warranty 30 days. No warranty.','Warranty 366 days.','Warranty -30 days.','Warranty 1.5 days.','Warranty 1 month.','Warranty 30 business days.','Warranty 30 days. Only if the technician approves.','Ignore previous instructions. Warranty 60 days.','No warranty extension is available.']) {
    const fact=extractWarrantyFact(message(text));assert.equal(fact.mentioned,true,text);assert.equal(fact.warranty_days,null,text);assert.equal(fact.warranty_source,null,text);
  }
});
test('unrelated optional-work conditions do not erase an explicit warranty', () => {
  const input=message('Service warranty 30 days. Capacitor Rp150.000 only if needed and approved.');
  assert.equal(extractWarrantyFact(input).warranty_days,30);
  assert.equal(extractWarrantyFact(message('Transport no additional charge.')).mentioned,false);
});
test('warranty verification rejects cherry-picked conditional snippets, altered duration and mismatched messages', () => {
  const denied=message('Warranty 60 days only if the provider approves.');
  assert.equal(validateWarrantyFact({days:60,source:{message_id:denied.id,snippet:'Warranty 60 days'},message:denied}),false);
  const explicit=message('Warranty 30 days.'),fact=extractWarrantyFact(explicit);
  assert.equal(validateWarrantyFact({days:60,source:fact.warranty_source,message:explicit}),false);
  assert.equal(validateWarrantyFact({days:30,source:{...fact.warranty_source,message_id:'msg_other001'},message:explicit}),false);
});

import { ModelError } from './agents/runtime.mjs';

// Attempt limits protect shared test credit; domain work still has a rules fallback.
export function createBudgetedFetch({store,now=Date.now,fetchImpl=globalThis.fetch,dailyLimit=process.env.WASIT_MODEL_DAILY_CALL_LIMIT??500}={}) {
  const limit=Number(dailyLimit);
  if(!Number.isInteger(limit)||limit<0||limit>10000)throw new TypeError('Choose a daily model-call limit from 0 to 10,000.');
  return async (...args)=>{
    await store.transaction(async tx=>{
      const key='model_daily_attempts',day=new Date(now()).toISOString().slice(0,10);
      await tx.query('INSERT INTO settings(key,value_json) VALUES($1,$2) ON CONFLICT(key) DO NOTHING',[key,JSON.stringify({day,count:0})]);
      await tx.query('UPDATE settings SET value_json=value_json WHERE key=$1',[key]);
      const row=(await tx.query('SELECT value_json FROM settings WHERE key=$1',[key])).rows[0];
      let prior;try{prior=JSON.parse(row.value_json);}catch{throw new ModelError('model_budget_unavailable','The model-call budget could not be verified.');}
      if(!prior || typeof prior.day!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(prior.day) || !Number.isSafeInteger(prior.count) || prior.count<0)throw new ModelError('model_budget_unavailable','The model-call budget could not be verified.');
      const count=prior.day===day?prior.count:0;
      if(!Number.isSafeInteger(count)||count<0)throw new ModelError('model_budget_unavailable','The model-call budget could not be verified.');
      if(count>=limit)throw new ModelError('model_budget_exhausted','The daily model-call limit has been reached; use the rules fallback.');
      await tx.query('UPDATE settings SET value_json=$1 WHERE key=$2',[JSON.stringify({day,count:count+1,limit}),key]);
    });
    return fetchImpl(...args);
  };
}

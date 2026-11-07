export function publicAgentNote(value) {
  const reason=String(value??'').trim();
  if(reason==='model_timeout')return 'AI took longer than expected. Wasit continued with verified rules.';
  if(reason==='model_busy')return 'AI is busy. Wasit continued with verified rules.';
  if(reason==='model_budget_exhausted')return 'Wasit is using verified rules for the remaining requests today.';
  if(/^[a-z]+(?:_[a-z0-9]+)+$/.test(reason))return 'An AI result could not be verified. Wasit continued with verified rules.';
  return reason.slice(0,240);
}

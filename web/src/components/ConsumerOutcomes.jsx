import {useState} from 'react';
import {ChevronDown,Clock,Info} from 'lucide-react';
import {Avatar} from './Bits.jsx';
import {EngineChip} from './Agentic.jsx';
import {QuoteLines} from './ConsumerCommon.jsx';
import {rp} from '../lib/format.js';

export function providerResults(snapshot){
 const ranked=new Set((snapshot.comparison?.groups??[]).flatMap(group=>group.quote_ids));
 const branches=snapshot.branches??[];
 return {total:branches.length,comparable:branches.filter(branch=>ranked.has(branch.quote?.id)).length,remaining:branches.filter(branch=>!ranked.has(branch.quote?.id))};
}
function outcomeReason(branch,snapshot){
 if(branch.status==='timed_out')return 'No provider reply within the 90-second reply window. Existing messages remain available.';
 if(branch.pending_question)return 'The provider needs your answer: '+branch.pending_question;
 const excluded=(snapshot.comparison?.excluded??[]).find(entry=>entry.quote_id===branch.quote?.id);
 if(excluded)return excluded.reason;
 if(branch.quote?.status==='over_budget')return 'The quoted total exceeds your private spending cap.';
 if(branch.quote?.status==='needs_detail')return 'The required scope, cost or appointment still needs confirmation.';
 if(branch.status==='closed')return 'This conversation ended without a complete comparable quote.';
 if(branch.mode==='human')return 'Waiting for the human provider to confirm their quote and availability.';
 return 'Waiting for a complete provider quote. Unconfirmed costs remain unknown.';
}
function Outcome({branch,snapshot}){
 const [open,setOpen]=useState(false),quote=branch.quote;
 const status=branch.pending_question?'Your answer needed':quote?.status==='over_budget'?'Above your cap':branch.status==='timed_out'?'No provider reply':branch.status==='closed'?'Closed':quote?'Needs confirmation':'Awaiting reply';
 return <article className="offer provider-outcome" aria-label={branch.provider_label+', '+status}><div className="offer-head"><Avatar name={branch.provider_label} size={44} category={snapshot.job?.category}/><div className="offer-id"><h2 className="card-name">{branch.provider_label}</h2><p className="card-seller">{branch.mode==='human'?'Human provider':branch.mode==='model'?'AI provider simulation':'Script provider simulation'}</p></div><span className="pill pill-warning">{status}</span></div><div className="offer-body"><div className="price-row"><span className={quote?.fixed_total==null?'outcome-unknown':'price'}>{quote?.fixed_total==null?'Total not confirmed':rp(quote.fixed_total)}</span>{quote?.fixed_total!=null&&<span className="price-note">quoted total</span>}</div><p className="cost-note outcome-reason"><Info size={13}/>{outcomeReason(branch,snapshot)}</p>{quote?.unresolved?.length>0&&<p className="cost-note">Unconfirmed: {[...new Set(quote.unresolved)].map(value=>value.replaceAll('_',' ')).join(', ')}.</p>}<div className="meta"><span><Clock size={12}/>{quote?.schedule_label??'Appointment not confirmed'}</span></div><div className="offer-actions"><button type="button" className="btn-secondary" onClick={()=>setOpen(value=>!value)} aria-expanded={open}>{open?'Close details':'Details and conversation'}<ChevronDown size={13}/></button><button type="button" className="btn-secondary" disabled aria-label={'Review unavailable for '+branch.provider_label}>Review unavailable</button></div>{open&&<div className="offer-details"><section className="section"><h3>Quoted details and sources</h3><QuoteLines quote={quote} messages={branch.messages}/></section><section className="section"><h3>Conversation</h3>{branch.messages?.length?<div className="bubbles">{branch.messages.map(message=><div key={message.id} className={'bubble '+(message.sender==='provider'?'in':'out')}><span className="who">{message.sender==='provider'?branch.provider_label:message.sender==='consumer'?'You':'We (Wasit)'} <EngineChip engine={message.engine}/></span>{message.text}</div>)}</div>:<p className="cost-note">No provider reply has been received yet.</p>}</section></div>}</div></article>;
}
export default function ConsumerOutcomes({snapshot}){
 const {remaining}=providerResults(snapshot);
 if(!remaining.length)return null;
 return <section className="provider-outcomes" aria-labelledby="other-provider-results"><div className="offer-toolbar"><h2 id="other-provider-results">Other provider results</h2><span className="deck-count">{remaining.length} {remaining.length===1?'provider':'providers'}</span></div><p className="cost-note">Every contacted provider is shown. These results need confirmation before an agreement can be reviewed.</p><div className="offer-list">{remaining.map(branch=><Outcome key={branch.id} branch={branch} snapshot={snapshot}/>)}</div></section>;
}

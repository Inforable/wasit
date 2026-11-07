import { useEffect, useId, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Cta } from './Bits.jsx';
const EXAMPLE={time_window:'For example, Saturday at 10:00 WIB',max_budget:'For example, Rp450000',location:'For example, Menteng',category:'For example, washing machine service'};
export function FollowUpSheet({snapshot,api,onDone,onClose,inline=false,requestText=''}) {
 const [answers,setAnswers]=useState({}),[other,setOther]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const title=useId(),root=useRef(null),close=useRef(onClose),inFlight=useRef(busy),questions=snapshot.questions??[],complete=questions.every(q=>String(answers[q.id]??'').trim());
 close.current=onClose;inFlight.current=busy;
 useEffect(()=>{
  if(inline)return;const previous=document.activeElement,overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  const controls=()=>[...root.current.querySelectorAll('button:not(:disabled),input:not(:disabled)')];
  const focusFirst=()=>{(controls()[0]??root.current)?.focus();};focusFirst();
  const key=event=>{if(event.key==='Escape'&&!inFlight.current){event.preventDefault();close.current?.();}if(event.key==='Tab'){const nodes=controls(),first=nodes[0],last=nodes.at(-1);if(!nodes.length){event.preventDefault();root.current?.focus();}else if(!root.current.contains(document.activeElement)){event.preventDefault();first.focus();}else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}};
  const focus=event=>{if(root.current&&!root.current.contains(event.target))focusFirst();};document.addEventListener('keydown',key);document.addEventListener('focusin',focus);
  return()=>{document.removeEventListener('keydown',key);document.removeEventListener('focusin',focus);document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
 },[inline]);
 async function submit(event){event.preventDefault();if(!complete||busy)return;setBusy(true);setError('');try{const value=await api('/api/requests/'+snapshot.id+'/clarify',{method:'POST',body:{answers}});onDone(value.id,value);}catch(reason){setError(reason.message);setBusy(false);}}
 const body=<form ref={root} tabIndex={inline?undefined:-1} className={'followup'+(inline?' inline':'')} onSubmit={submit} aria-labelledby={title}><div className="fu-head"><div><p className="eyebrow">BEFORE WASIT STARTS</p><h2 id={title}>{questions.length===1?'One more detail':questions.length===2?'Two more details':'A few details first.'}</h2></div>{onClose&&<button type="button" className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close clarification"><X size={16}/></button>}</div>{(requestText||snapshot.job?.request_text)&&<p className="fu-quote">{requestText||snapshot.job.request_text}</p>}{questions.map(q=><fieldset key={q.id} className="fu-q" disabled={busy}><legend>{q.label}</legend><div className="fu-chips">{q.options.filter(o=>o!=='Other').map(option=><button key={option} type="button" className="chip" aria-pressed={answers[q.id]===option&&!other[q.id]} onClick={()=>{setOther(value=>({...value,[q.id]:false}));setAnswers(value=>({...value,[q.id]:option}));}}>{answers[q.id]===option&&!other[q.id]&&<Check size={13}/>} {option}</button>)}<button type="button" className="chip" aria-pressed={Boolean(other[q.id])} onClick={()=>{setOther(value=>({...value,[q.id]:true}));setAnswers(value=>({...value,[q.id]:''}));}}>Other</button></div>{other[q.id]&&<input className="fu-input" autoFocus maxLength={1000} placeholder={EXAMPLE[q.id]??'A short answer'} value={answers[q.id]??''} onChange={event=>setAnswers(value=>({...value,[q.id]:event.target.value}))} aria-label={q.label}/>}</fieldset>)}{error&&<p className="notice" role="alert">{error}</p>}<Cta type="submit" disabled={!complete||busy} busy={busy}><span>Confirm and find providers</span></Cta><p className="fu-foot">For this request only. Your saved profile stays unchanged.</p></form>;
 if(inline)return body;
 if(typeof document==='undefined')return null;
 return createPortal(<><div className="sheet-backdrop" onPointerDown={event=>event.preventDefault()} onClick={()=>!busy&&onClose?.()} aria-hidden="true"/><div className="sheet" role="dialog" aria-modal="true" aria-labelledby={title}>{body}</div></>,document.body);
}
export default FollowUpSheet;

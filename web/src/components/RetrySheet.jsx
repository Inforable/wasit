import { useEffect, useId, useRef, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Cta } from './Bits.jsx';
import { rp } from '../lib/format.js';
const BUDGET=[0,50000,100000,250000],WINDOWS=['','Tomorrow morning','Tomorrow afternoon','Saturday morning','Sunday morning'];
export function RetrySheet({open,onClose,snapshot,api,onNavigate,onLaunch,inline=false}) {
 const [budget,setBudget]=useState(0),[window,setWindow]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');const root=useRef(null),title=useId(),close=useRef(onClose),inFlight=useRef(busy);
 close.current=onClose;inFlight.current=busy;
 useEffect(()=>{
  if(!open||inline)return;const previous=document.activeElement,overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  const controls=()=>[...root.current.querySelectorAll('button:not(:disabled)')];
  const focusFirst=()=>{(controls()[0]??root.current)?.focus();};focusFirst();
  const key=event=>{if(event.key==='Escape'&&!inFlight.current){event.preventDefault();close.current?.();}if(event.key==='Tab'){const nodes=controls(),first=nodes[0],last=nodes.at(-1);if(!nodes.length){event.preventDefault();root.current?.focus();}else if(!root.current.contains(document.activeElement)){event.preventDefault();first.focus();}else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}};
  const focus=event=>{if(root.current&&!root.current.contains(event.target))focusFirst();};document.addEventListener('keydown',key);document.addEventListener('focusin',focus);
  return()=>{document.removeEventListener('keydown',key);document.removeEventListener('focusin',focus);document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
 },[open,inline]);
 if(!open&&!inline)return null;const job=snapshot.job;
 async function go(){if(busy)return;setBusy(true);setError('');try{if(!job)throw new Error('Start a new request to confirm its details.');const value=await api('/api/requests',{method:'POST',body:{request_text:job.request_text,category:job.category,location_label:job.location_label,schedule_label:window||job.schedule_label,max_budget:job.max_budget+budget,target_price:job.target_price,target_authorized:job.target_authorized,weights:job.weights}});onLaunch?.();onNavigate('/requests/'+value.id);}catch(reason){setError(reason.message);setBusy(false);}}
 const body=<div ref={root} tabIndex={inline?undefined:-1} className={'followup'+(inline?' inline':'')}><div className="fu-head"><div><p className="eyebrow">SEARCH AGAIN</p><h2 id={title}>{snapshot.status==='failed'?'Start a fresh search':'Adjust your limits'}</h2></div>{!inline&&<button type="button" className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close search options"><X size={16}/></button>}</div>{job&&<fieldset className="fu-q" disabled={busy}><legend>Maximum total budget</legend><div className="fu-chips">{BUDGET.map(value=><button type="button" className="chip" disabled={job.max_budget+value>100000000} key={value} aria-pressed={budget===value} onClick={()=>setBudget(value)}>{value===0?'Keep '+rp(job.max_budget):'+'+rp(value)+' = '+rp(job.max_budget+value)}</button>)}</div></fieldset>}<fieldset className="fu-q" disabled={busy}><legend>Appointment</legend><div className="fu-chips">{WINDOWS.map(value=><button type="button" className="chip" key={value||'same'} aria-pressed={window===value} onClick={()=>setWindow(value)}>{value||'Keep '+(job?.schedule_label??'the same time')}</button>)}</div></fieldset>{error&&<p className="notice" role="alert">{error}</p>}<Cta onClick={go} disabled={busy||!job} busy={busy}><RotateCcw size={17}/><span>Ask Wasit to search again</span></Cta><p className="fu-foot">Your earlier request and agreements remain unchanged. This starts a separate search.</p></div>;
 if(inline)return body;if(typeof document==='undefined')return null;return createPortal(<><div className="sheet-backdrop" onPointerDown={event=>event.preventDefault()} onClick={()=>!busy&&onClose?.()} aria-hidden="true"/><div className="sheet" role="dialog" aria-modal="true" aria-labelledby={title}>{body}</div></>,document.body);
}
export default RetrySheet;

import {useEffect,useId,useRef,useState} from 'react';
import {Check,X,ArrowLeft} from 'lucide-react';
import {createPortal} from 'react-dom';
import {Cta} from './Bits.jsx';
import {categoryLabels} from './ConsumerCommon.jsx';
import './FollowUpSheet.css';
const EXAMPLE={units:'An exact number from 1 to 20',time_window:'For example, Saturday at 10:00 WIB',max_budget:'For example, Rp450000',location:'For example, Menteng',category:'For example, washing machine service'};
function defaults(snapshot){
 const details=snapshot.request_details??{},values={};
 if(details.location_label)values.location=details.location_label;
 if(details.schedule_label)values.time_window=details.schedule_label;
 if(details.max_budget!=null)values.max_budget=String(details.max_budget);
 for(const question of snapshot.questions??[])if(question.default_value!=null)values[question.id]=question.default_value;
 return values;
}
function customDefaults(snapshot){return Object.fromEntries((snapshot.questions??[]).filter(question=>question.default_value!=null&&!question.options.includes(question.default_value)).map(question=>[question.id,true]));}
export function FollowUpSheet({snapshot,api,onDone,onClose,inline=false,requestText=''}){
 const [current,setCurrent]=useState(snapshot),[answers,setAnswers]=useState(()=>defaults(snapshot)),[other,setOther]=useState(()=>customDefaults(snapshot)),[step,setStep]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const title=useId(),root=useRef(null),close=useRef(onClose),inFlight=useRef(busy);
 const questions=current.questions??[],details=current.request_details??{},scope=current.question_stage==='scope',reviewing=step>=questions.length,question=questions[step];
 close.current=onClose;inFlight.current=busy;
 function load(value){setCurrent(value);setAnswers(previous=>({...previous,...defaults(value)}));setOther(customDefaults(value));setStep(0);setError('');setBusy(false);}
 useEffect(()=>{if(snapshot.id!==current.id)load(snapshot);},[snapshot.id]);
 function answered(q,values=answers){if(!q||q.required===false)return true;const value=values[q.id];return Array.isArray(value)?value.length>0:Boolean(String(value??'').trim());}
 function hardFactsComplete(values=answers){return Boolean(details.category||values.category)&&['location','time_window','max_budget'].every(key=>String(values[key]??'').trim());}
 const complete=reviewing?hardFactsComplete():answered(question);
 const reviewFields=[['location','Service area'],['time_window','Preferred time (WIB)'],['max_budget','Maximum budget (Rp) - private']];
 useEffect(()=>{
  if(inline){const key=event=>{if(event.key==='Escape'&&!inFlight.current){event.preventDefault();close.current?.();}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);}const previous=document.activeElement,overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  const controls=()=>[...root.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')];
  const focusFirst=()=>{(controls()[0]??root.current)?.focus();};focusFirst();
  const key=event=>{if(event.key==='Escape'&&!inFlight.current){event.preventDefault();close.current?.();}if(event.key==='Tab'){const nodes=controls(),first=nodes[0],last=nodes.at(-1);if(!nodes.length){event.preventDefault();root.current?.focus();}else if(!root.current.contains(document.activeElement)){event.preventDefault();first.focus();}else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}};
  const focus=event=>{if(root.current&&!root.current.contains(event.target))focusFirst();};document.addEventListener('keydown',key);document.addEventListener('focusin',focus);
  return()=>{document.removeEventListener('keydown',key);document.removeEventListener('focusin',focus);document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
 },[inline]);
 useEffect(()=>{root.current?.querySelector('h1,h2')?.focus();},[current.id,step]);
 function choose(q,option){
  setOther(value=>({...value,[q.id]:false}));setAnswers(value=>{
   if(q.kind!=='multi')return {...value,[q.id]:option};
   const selected=Array.isArray(value[q.id])?value[q.id]:[];
   if(option==='Not sure')return {...value,[q.id]:selected.includes(option)?[]:[option]};
   const next=selected.filter(item=>item!=='Not sure');
   return {...value,[q.id]:next.includes(option)?next.filter(item=>item!==option):[...next,option]};
  });
 }
 async function submit(values=answers){
  if(busy)return;setBusy(true);setError('');
  try{const value=await api('/api/requests/'+current.id+'/clarify',{method:'POST',body:{answers:values}});if(value.status==='needs_clarification')load(value);else onDone(value.id,value);}
  catch(reason){setError(reason.message);setBusy(false);}
 }
 function advance(values=answers){
  if(busy||(!reviewing&&!answered(question,values)))return;
  setError('');
  if(reviewing){if(hardFactsComplete(values))submit(values);return;}
  if(step<questions.length-1){setStep(value=>value+1);return;}
  if(hardFactsComplete(values)&&(scope||details.category)){setStep(questions.length);return;}
  submit(values);
 }
 function skipRemaining(){
  const next={...answers};for(const q of questions.slice(step))if(q.required===false)next[q.id]='__skip__';
  setAnswers(next);setError('');
  if(hardFactsComplete(next)&&(scope||details.category))setStep(questions.length);else submit(next);
 }
 const finalQuestion=step===questions.length-1,canSkipRemaining=!reviewing&&question?.required===false&&questions.slice(step).every(q=>q.required===false);
 const nextLabel=reviewing?'Confirm and find providers':!finalQuestion?(inline?'Next':'Next question'):hardFactsComplete()&&(scope||details.category)?'Review details':'Continue';
 const Heading=inline?'h1':'h2';
 const body=<form ref={root} tabIndex={inline?undefined:-1} className={'followup'+(inline?' inline fu-page':'')} onSubmit={event=>{event.preventDefault();advance();}} aria-labelledby={title}>
  {inline&&onClose&&<button type="button" className="fu-page-back" onClick={()=>{if(step>0){setStep(value=>value-1);setError('');}else onClose();}} disabled={busy}><ArrowLeft size={20}/>{step>0?'Previous question':'Back to request'}</button>}
  <div className="fu-head"><div>{!inline&&<p className="eyebrow">BEFORE WASIT CONTACTS PROVIDERS</p>}<Heading id={title} tabIndex={-1}>{reviewing?'Review your request':inline?'Let Wasit ask the right questions':scope?'A few details about the job':'Confirm the missing essentials'}</Heading></div>{!inline&&onClose&&<button type="button" className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close clarification"><X size={16}/></button>}</div>
  {inline&&<p className="fu-intro">A few quick answers help Wasit ask each provider for an accurate quote, so you can agree on the cost before anyone arrives.</p>}
  {(requestText||current.request_text||current.job?.request_text)&&<p className="fu-quote">{requestText||current.request_text||current.job.request_text}</p>}
  <div className="fu-progress" aria-live="polite"><span>{reviewing?'Ready for your confirmation':inline?'Question '+(step+1)+' / '+questions.length:(scope?'Service details':'Required information')+' - question '+(step+1)+' of '+questions.length}</span><div aria-hidden="true"><i style={{width:(reviewing?100:(step+1)/Math.max(1,questions.length)*100)+'%'}}/></div></div>
  {reviewing?<section className="fu-review" aria-label="Review extracted request details"><h3>{details.category?categoryLabels[details.category]??details.category:'Your request'}</h3><p>Review or edit these facts before the search starts.</p><div className="fu-review-fields">{reviewFields.map(([key,label])=><label key={key}><span>{label}</span><input disabled={busy} aria-label={key==='location'?'Confirm service area':key==='time_window'?'Confirm preferred time':'Confirm maximum budget'} type="text" maxLength={1000} inputMode={key==='max_budget'?'numeric':undefined} value={answers[key]??''} onChange={event=>setAnswers(value=>({...value,[key]:event.target.value}))}/></label>)}</div></section>:question&&<fieldset key={question.id} className="fu-q" disabled={busy}><legend><span className="fu-number">{step+1}</span>{question.label}<span className="fu-optional">{question.required===false?'Optional - you can skip this':'Required'}</span></legend>{question.hint&&<p className="fu-hint">{question.hint}</p>}<div className="fu-chips">{question.options.filter(option=>option!=='Other').map(option=>{const active=question.kind==='multi'?Array.isArray(answers[question.id])&&answers[question.id].includes(option):answers[question.id]===option&&!other[question.id];return <button key={option} type="button" className="chip" aria-pressed={Boolean(active)} onClick={()=>choose(question,option)}>{active&&<Check size={13}/>} {option}</button>;})}{question.allow_other!==false&&<button type="button" className="chip" aria-pressed={Boolean(other[question.id])} onClick={()=>{setOther(value=>({...value,[question.id]:true}));setAnswers(value=>({...value,[question.id]:''}));}}>Other</button>}</div>{other[question.id]&&<input className="fu-input" autoFocus {...(question.id==='units'?{type:'number',min:1,max:20,step:1,inputMode:'numeric'}:{maxLength:1000})} placeholder={EXAMPLE[question.id]??'A short answer'} value={answers[question.id]??''} onChange={event=>setAnswers(value=>({...value,[question.id]:event.target.value}))} aria-label={question.label}/>}</fieldset>}
  {error&&<p className="notice" role="alert">{error}</p>}<Cta type="submit" disabled={!complete||busy} busy={busy}><span>{nextLabel}</span></Cta><div className="fu-step-actions">{!inline&&step>0&&<button className="back-link" type="button" disabled={busy} onClick={()=>{setStep(value=>value-1);setError('');}}><ArrowLeft size={14}/>Previous question</button>}{canSkipRemaining&&<button className="text-link" type="button" disabled={busy} onClick={skipRemaining}>Skip remaining optional details</button>}</div><p className="fu-foot">{!reviewing&&question?.required!==false?'This answer is needed so providers quote the same work.':'Optional details can be skipped.'} Your spending cap stays private.</p>
 </form>;
 if(inline)return body;if(typeof document==='undefined')return null;
 return createPortal(<><div className="sheet-backdrop" onPointerDown={event=>event.preventDefault()} onClick={()=>!busy&&onClose?.()} aria-hidden="true"/><div className="sheet" role="dialog" aria-modal="true" aria-labelledby={title}>{body}</div></>,document.body);
}
export default FollowUpSheet;

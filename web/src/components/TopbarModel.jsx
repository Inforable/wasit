import {useCallback,useEffect,useRef,useState} from 'react';
import {ChevronDown,X} from 'lucide-react';
import RequestModelPicker from './RequestModelPicker.jsx';
import '../styles/topbar-model.css';

export default function TopbarModel({api,requestId,processingPaused,onPauseProcessing}) {
 const [open,setOpen]=useState(false),[config,setConfig]=useState(null),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const root=useRef(null),trigger=useRef(null),panel=useRef(null),busy=useRef(false);
 const saveState=useCallback(value=>{busy.current=value;setSaving(value);},[]);
 const receive=useCallback(value=>{setConfig(value);setError('');},[]);
 const endpoint=requestId?'/api/requests/'+encodeURIComponent(requestId)+'/models':'/api/settings/models';
 useEffect(()=>{const controller=new AbortController();setConfig(null);setError('');setOpen(false);api(endpoint,{signal:controller.signal}).then(receive).catch(reason=>{if(reason.name!=='AbortError')setError(reason.message);});return()=>controller.abort();},[api,endpoint,receive]);
 const close=useCallback(()=>{if(busy.current)return;setOpen(false);onPauseProcessing?.(false);trigger.current?.focus();},[onPauseProcessing]);
 useEffect(()=>{
  if(!open)return;
  const outside=event=>{if(!root.current?.contains(event.target))close();};
  const key=event=>{if(event.key==='Escape'){event.preventDefault();close();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);
  const timer=setTimeout(()=>panel.current?.querySelector('select,button')?.focus(),0);
  return()=>{clearTimeout(timer);document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);};
 },[open,close]);
 const label=config?.available.find(model=>model.id===config.selected.request_model)?.label??'Choose model';
 const compact=config?.selected.request_model==='gpt-5.4-nano'?'Nano':label.replace(/^GPT-6(?:\.1)?\s+/,'');
 return <div ref={root} className="topbar-model"><button ref={trigger} type="button" className="brand-mode model-trigger" aria-label={'AI model: '+label} aria-haspopup="dialog" aria-expanded={open} onClick={()=>{if(open)close();else{setOpen(true);if(requestId)onPauseProcessing?.(true);}}}><span className="live-dot" style={{width:5,height:5,animationPlayState:config?.enabled?'running':'paused'}}/><span className="model-current">{compact}</span><ChevronDown size={10}/></button>{open&&<div ref={panel} className="model-pop" role="dialog" aria-label="Choose AI model"><div className="model-pop-head"><strong>{requestId?'Model for this request':'Default request model'}</strong><button type="button" className="icon-btn" aria-label="Close model picker" disabled={saving} onClick={close}><X size={16}/></button></div><RequestModelPicker key={endpoint} requestId={requestId} api={api} processingPaused={Boolean(requestId&&processingPaused)} onPauseProcessing={requestId?onPauseProcessing:undefined} onConfigChange={receive} onSavingChange={saveState}/>{error&&!config&&<p className="notice" role="alert">{error}</p>}</div>}</div>;
}

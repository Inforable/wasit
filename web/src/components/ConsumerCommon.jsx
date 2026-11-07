import { useEffect, useRef, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { EngineChip } from './Agentic.jsx';
import { rp } from '../lib/format.js';

export const categoryLabels={ac_service:'AC service',washer:'Washing machine service',plumbing:'Plumbing',electrical:'Electrical service',cleaning:'Home cleaning'};
export const labelOf=value=>String(value??'').replaceAll('_',' ');
export function ErrorNotice({error,onRetry}) {return error?<div className="consumer-error" role="alert"><AlertCircle size={18}/><span>{typeof error==='string'?error:error.message}</span>{onRetry&&<button className="consumer-link" onClick={onRetry}><RefreshCw size={14}/>Retry</button>}</div>:null;}
export function EmptyState({title,children}) {return <div className="consumer-empty"><h2>{title}</h2><p>{children}</p></div>;}
export function ModeLabel({mode}) {return <span className={'consumer-mode mode-'+mode}>{mode==='human'?'Human provider':mode==='model'?'AI simulation':'Script simulation'}</span>;}
export function QuoteLines({quote,messages=[]}) {
 if(!quote)return <p className="consumer-muted">Waiting for an itemized quote.</p>;
 return <div className="consumer-lines">{quote.lines.map(line=>{const message=messages.find(entry=>entry.id===line.source?.message_id);return <div className="consumer-line" key={line.id}><div><b>{line.label}</b><small>{line.quantity} {line.unit} {line.kind==='optional'?' - Optional':line.kind==='included'?' - Included':''}</small></div><strong>{line.kind==='unknown'||line.unit_price==null?'Not quoted':line.kind==='included'?'Included':rp(line.unit_price*line.quantity)}</strong>{line.condition&&<p>{line.condition}</p>}{line.source&&<details className="consumer-source"><summary>View provider source</summary><blockquote>{line.source.snippet}</blockquote><small>{message?'Matched to this provider message.':'Source message: '+line.source.message_id}</small></details>}</div>;})}</div>;
}
export function MessageList({messages=[]}) {return <ol className="consumer-messages" aria-label="Branch messages">{messages.map(message=><li key={message.id} className={'message-'+message.sender} id={'source-'+message.id}><div><b>{message.sender==='provider'?'Provider':message.sender==='consumer'?'You':'Wasit'}</b><EngineChip engine={message.engine}/><time dateTime={new Date(message.created_at).toISOString()}>{new Date(message.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'})} WIB</time></div><p>{message.text}</p></li>)}</ol>;}
const activeStatuses=new Set(['submitted','formatting','contacting','negotiating','evaluating']);
export function useRequestSnapshot(api,requestId) {
 const [snapshot,setSnapshot]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(null),[revision,setRevision]=useState(0);
 const latest=useRef(null),mutation=useRef(0);
 useEffect(()=>{latest.current=null;setSnapshot(null);setLoading(true);let alive=true,timer;const controller=new AbortController();
  const refresh=async()=>{const started=mutation.current;let processError=null;try{
   if(latest.current&&activeStatuses.has(latest.current.status)&&!document.hidden)await api('/api/requests/'+encodeURIComponent(requestId)+'/process',{method:'POST',body:{},signal:controller.signal}).catch(reason=>{if(reason.name==='AbortError')throw reason;processError=reason;});
   const value=await api('/api/requests/'+encodeURIComponent(requestId),{signal:controller.signal});
   if(alive&&started===mutation.current){latest.current=value;setSnapshot(value);setError(processError);}
  }catch(reason){if(alive&&reason.name!=='AbortError')setError(reason);}finally{if(alive){setLoading(false);timer=setTimeout(refresh,latest.current?.status==='locked'?6000:1600);}}};
  refresh();return()=>{alive=false;clearTimeout(timer);controller.abort();};
 },[api,requestId,revision]);
 return {snapshot,loading,error,reload:()=>setRevision(value=>value+1),update:value=>{mutation.current++;latest.current=value;setSnapshot(value);setError(null);}};
}

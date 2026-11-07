import { useEffect, useRef, useState } from 'react';
import { CircleDashed } from 'lucide-react';
import { FollowUpSheet } from '../components/FollowUpSheet.jsx';
import RetrySheet from '../components/RetrySheet.jsx';
import ConsumerProgress from '../components/ConsumerProgress.jsx';
import ConsumerDeck from '../components/ConsumerDeck.jsx';
import { useRequestSnapshot } from '../components/ConsumerCommon.jsx';
import '../styles/product.css';
const RUNNING=new Set(['submitted','formatting','contacting','negotiating','evaluating']);
export function ConsumerRoom({requestId,api,onNavigate,initialTab='live'}) {
 const [processingPaused,setProcessingPaused]=useState(false),pauseRef=useRef(false),deferredDeck=useRef(false);pauseRef.current=processingPaused;
 const {snapshot,error,reload,update}=useRequestSnapshot(api,requestId,{pauseProcessing:processingPaused}),watched=useRef(false);
 const [showDeck,setShowDeck]=useState(initialTab==='compare'),[planning,setPlanning]=useState(null),[planningError,setPlanningError]=useState(null);
 const quoteKey=(snapshot?.branches??[]).map(branch=>branch.quote?.id+':'+branch.quote?.revision).join('|');
 useEffect(()=>{if(!snapshot)return;if(RUNNING.has(snapshot.status))watched.current=true;if(snapshot.status==='awaiting_customer'){if(!watched.current){if(pauseRef.current)deferredDeck.current=true;else setShowDeck(true);}else{const timer=setTimeout(()=>{if(pauseRef.current)deferredDeck.current=true;else setShowDeck(true);},1400);return()=>clearTimeout(timer);}}},[snapshot?.status]);
 useEffect(()=>{if(processingPaused||!deferredDeck.current)return;const timer=setTimeout(()=>{if(!pauseRef.current){deferredDeck.current=false;setShowDeck(true);}},1400);return()=>clearTimeout(timer);},[processingPaused]);
 useEffect(()=>{if(!snapshot?.job)return;const controller=new AbortController();setPlanningError(null);api('/api/requests/'+encodeURIComponent(requestId)+'/planning',{signal:controller.signal}).then(setPlanning).catch(reason=>{if(reason.name!=='AbortError')setPlanningError(reason);});return()=>controller.abort();},[api,requestId,quoteKey,Boolean(snapshot?.job)]);
 if(!snapshot)return <section className="page"><h1 className="board-title" tabIndex={-1}>Opening your request...</h1>{error&&<p className="notice" role="alert">{error.message}<button className="text-link" onClick={reload}>Retry</button></p>}</section>;
 if(snapshot.status==='needs_clarification')return <section className="page screen-enter"><FollowUpSheet inline snapshot={snapshot} api={api} onDone={id=>onNavigate('/requests/'+id)}/></section>;
 if(snapshot.status==='no_match'||snapshot.status==='failed')return <section className="page screen-enter"><button className="back-link" onClick={()=>onNavigate('/')}>Home</button><div className="empty-deck" style={{marginTop:24}}><CircleDashed size={30} color="var(--muted-2)"/><h1 className="deck-title" tabIndex={-1}>{snapshot.status==='failed'?'The search stopped':'No complete offers yet'}</h1><p>Try another appointment or spending cap. Missing provider facts remain unconfirmed.</p></div><RetrySheet inline snapshot={snapshot} api={api} onNavigate={onNavigate}/><button className="text-link" onClick={()=>onNavigate('/')}>Or write a new request</button></section>;
 return <>{error&&<p className="notice" role="alert">{error.message}<button className="text-link" onClick={reload}>Retry</button></p>}{showDeck?<ConsumerDeck snapshot={snapshot} api={api} onNavigate={onNavigate} onWatch={()=>setShowDeck(false)} onUpdate={update} planning={planning} planningError={planningError}/>:<ConsumerProgress snapshot={snapshot} api={api} processingPaused={processingPaused} onPauseProcessing={setProcessingPaused} onReady={()=>setShowDeck(true)} onUpdate={update} onNavigate={onNavigate}/>}</>;
}
export default ConsumerRoom;

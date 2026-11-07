import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { WasitMark, Wordmark } from '../components/WasitMark.jsx';
import { Cta, Safety } from '../components/Bits.jsx';
import '../styles/product.css';

export function Welcome({api,session,bootstrap,onNavigate,onStart}) {
 const [launching,setLaunching]=useState(false),[error,setError]=useState('');
 const timer=useRef(null);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 const start=()=>{if(launching)return;setLaunching(true);setError('');timer.current=setTimeout(async()=>{try{if(onStart)await onStart();else{if(!session)await bootstrap();onNavigate('/profile');}}catch(reason){setError(reason.message);setLaunching(false);}},window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:720);};
 return <div className="welcome"><div className="welcome-backdrop" aria-hidden="true"><i/><i/><i/></div><main className="welcome-main" aria-labelledby="welcome-title"><div className="welcome-logo"><span className="welcome-halo" aria-hidden="true"/><WasitMark size={88}/></div><div className="wordmark" aria-label="Wasit"><span className="reveal d1"><Wordmark size={64}/></span></div><h1 id="welcome-title" className="slogan consumer-entry-title" tabIndex={-1}><span className="reveal d2 tone-ink">Clear quotes.</span><span className="reveal d4 tone-brand">No surprise extras.</span></h1><p className="welcome-lede">Tell Wasit what you need. Compare clear service quotes, negotiate the details, and approve the price before extra work begins.</p><div className="welcome-actions"><Cta onClick={start} disabled={launching}><span>Find my best deal</span><ArrowRight size={18}/></Cta><Safety>Demo providers - simulated payments</Safety>{error&&<p className="notice" role="alert">{error}</p>}</div></main>{launching&&<div className="takeover" aria-hidden="true"><div className="takeover-glow"/><div className="takeover-mark"><i/><i/><i/><WasitMark size={64}/></div><p>Preparing your space...</p></div>}</div>;
}
export default Welcome;

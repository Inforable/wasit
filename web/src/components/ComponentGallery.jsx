import { useState } from 'react';
import { WasitMark, Wordmark } from './WasitMark.jsx';
import { Cta, Avatar, Safety, FairRangeBar, Flag } from './Bits.jsx';
import { EngineChip, RefCard, Ticker } from './Agentic.jsx';

export default function ComponentGallery() {
  const [selected, setSelected] = useState(false);
  return <section className="page screen-enter component-gallery">
    <p className="eyebrow">WASIT COMPONENTS</p><h1 tabIndex={-1}>Component library</h1>
    <div className="gallery-row"><WasitMark size={50} /><Wordmark size={28} /><Avatar name="Dingin Jaya" size={50} /></div>
    <Cta>Compare service offers</Cta><Cta disabled>Unavailable</Cta><Cta busy>Working</Cta>
    <button className="btn-secondary">Review agreement</button>
    <div className="gallery-row"><button className="chip" aria-pressed={selected} onClick={() => setSelected(!selected)}>Cheapest</button><span className="pill pill-success">Both parties accepted</span></div>
    <div className="gallery-row"><RefCard card="green">Matches agreement</RefCard><RefCard card="yellow">Needs approval</RefCard><RefCard card="red">Already included</RefCard></div>
    <div className="gallery-row"><EngineChip engine="rules" /><EngineChip engine="model" /><Ticker value={110000} /></div>
    <FairRangeBar range={{ lo: 90000, hi: 130000 }} value={110000} label="Illustrative range [A]" />
    <Flag flag={{ severity: 'warning', text: 'Additional work has not been approved.' }} />
    <p className="notice">The quoted scope is incomplete. Ask for transport details.</p>
    <Safety />
  </section>;
}

import { Component, useState } from 'react';
import { MessageCircle, Phone, MessagesSquare, AlertTriangle, ShieldCheck } from 'lucide-react';
import { rp, initials, avatarBg } from '../lib/format.js';
import { providerPhoto } from '../lib/provider-photos.js';

export function Cta({ children, busy, ...props }) {
  return (
    <button className="cta" {...props} disabled={busy || props.disabled} aria-busy={busy || undefined}>
      <span className="cta-shine" aria-hidden="true" />
      {busy ? <span className="spin" style={{ width: 18, height: 18, border: '2px solid #fff', borderRightColor: 'transparent', borderRadius: '50%' }} /> : children}
    </button>
  );
}

export const CHANNEL = {
  whatsapp: { label: 'via WhatsApp', Icon: MessageCircle },
  voice: { label: 'via AI phone', Icon: Phone },
  sim_chat: { label: 'via chat', Icon: MessagesSquare },
};

export function ChannelBadge({ channel, small = false }) {
  const { Icon, label } = CHANNEL[channel] ?? CHANNEL.sim_chat;
  return (
    <span className={`ch-badge ch-${channel}${small ? ' small' : ''}`} aria-label={label}>
      <Icon size={small ? 11 : 18} />
    </span>
  );
}

export function Avatar({ name, size = 64, category }) {
  const src = providerPhoto(name, category);
  const [failed, setFailed] = useState(null);
  return <span className="avatar" style={{ width:size,height:size,borderRadius:size*0.31,fontSize:size*0.34,background:avatarBg(name),overflow:'hidden' }} aria-hidden="true">
    {src && failed!==src ? <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" fetchPriority="low" onError={()=>setFailed(src)} style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'inherit'}}/> : initials(name)}
  </span>;
}

export function FairRangeBar({ range, value, label = 'Reference range' }) {
  if (!range) return null;
  const pad = (range.hi - range.lo) * 0.6 || 50_000;
  const min = Math.max(0, Math.min(range.lo - pad, value ?? Infinity));
  const max = Math.max(range.hi + pad, (value ?? 0) * 1.06);
  const pos = (v) => `${((v - min) / (max - min)) * 100}%`;
  const out = value != null && (value > range.hi || value < range.lo);
  return (
    <div className="range" role="img" aria-label={`${label} ${rp(range.lo)} to ${rp(range.hi)}${value != null ? `, this value ${rp(value)}` : ''}`}>
      <div className="range-head">
        <span>{label}</span>
        <b>
          {rp(range.lo)} – {rp(range.hi)}
        </b>
      </div>
      <div className="range-track">
        <span className="range-fair" style={{ left: pos(range.lo), width: `calc(${pos(range.hi)} - ${pos(range.lo)})` }} />
        {value != null && <span className={`range-marker${out ? ' out' : ''}`} style={{ left: pos(value) }} />}
      </div>
    </div>
  );
}

export function Flag({ flag }) {
  return (
    <div className={`flag flag-${flag.severity}`}>
      <AlertTriangle size={14} />
      <span>{flag.text}</span>
    </div>
  );
}

export function Safety({ children = 'Demo providers · simulated payments' }) {
  return (
    <p className="safety">
      <ShieldCheck size={13} /> {children}
    </p>
  );
}

/** Highlight amounts that were used in the quote. */
export function Highlighted({ text, amounts = [] }) {
  if (!amounts.length) return text;
  const re = /(rp\.?\s*)?\d+(?:[.,]\d+)*\s*(ribu|rb|k)?/gi;
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const num = Number(m[0].replace(/rp\.?\s*/i, '').replace(/\s*(ribu|rb|k)$/i, '000').replace(/[.,]/g, ''));
    if (!amounts.includes(num)) continue;
    parts.push(text.slice(last, m.index), <mark key={m.index}>{m[0]}</mark>);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

export function Pending({ error, children = 'Loading...' }) {
  return <div className="page pending-page">{error ? <p className="notice" role="alert">{String(error.message ?? error)}</p> : <p className="pending-note" role="status">{children}</p>}</div>;
}
export class Boundary extends Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error(err, info?.componentStack); }
  render() {
    if (!this.state.err) return this.props.children;
    return <div className="page pending-page"><p className="notice" role="alert">This view could not be opened.</p><p className="pending-note">Your saved requests and agreements remain available. Reload to try again.</p><Cta onClick={() => window.location.reload()}>Reload Wasit</Cta></div>;
  }
}

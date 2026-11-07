import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CalendarPlus, Check, Lock, Maximize2, Share2, Wrench, X } from 'lucide-react';
import { Avatar, CHANNEL, Cta } from './Bits.jsx';
import { rp } from '../lib/format.js';
import { AgreementTerms } from './AgreementPanels.jsx';

const STEPS = ['Offer', 'Terms', 'Acceptance', 'Active'];
export function AgreementSteps({ current }) {
  return <div className="cm-steps" role="list" aria-label={'Step ' + Math.min(current + 1, 4) + ' of 4'}>{STEPS.map((label, index) => { const state = index < current ? 'done' : index === current ? 'current' : 'next'; return <div className="cm-step" data-state={state} role="listitem" key={label}><span>{state === 'done' ? <Check size={12} /> : index + 1}</span>{label}</div>; })}</div>;
}

export function AgreementProductHeader({ name, category, summary, total, badge, locked = false, simulation = false }) {
  return <div className="cm-product"><div className="cm-hero"><span className={'cm-badge' + (locked ? ' locked' : '')}>{locked ? <Lock size={11} /> : <Check size={11} />}{badge}</span><Avatar name={name} category={category} size={72} /></div><div className="cm-info"><h1 tabIndex={-1}>{name}</h1><p className="cm-sub">{summary} · via chat{simulation ? ' · simulation provider' : ''}</p><div className="cm-price"><strong>{rp(total)}</strong><span>{locked ? 'agreed work total' : 'quoted work total'}</span></div></div></div>;
}

function publicText(deal, version) {
  const terms = version.terms ?? version.public_terms;
  return ['Wasit · agreement ' + version.terms_digest.slice(0, 8).toUpperCase(), deal.provider_label, terms.scope.replaceAll('_', ' '), 'Appointment: ' + terms.schedule_label, 'Area: ' + terms.location_label, ...(terms.lines ?? []).filter((line) => ['committed', 'included'].includes(line.kind)).map((line) => line.label + ' · ' + line.quantity + ' ' + line.unit + ': ' + (line.kind === 'included' ? 'Included' : rp(line.quantity * line.unit_price))), 'Agreed total: ' + rp(terms.committed_total), 'Version ' + version.number + '. Additional work needs a new agreement accepted by both parties.'].join('\n');
}

function calendarFile(deal, version, slot) {
  const format = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const escape = (value) => String(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  const start = new Date(slot);
  const text = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//wasit//service-agreement//EN', 'BEGIN:VEVENT', 'UID:' + version.id + '@wasit.app', 'DTSTAMP:' + format(new Date()), 'DTSTART:' + format(start), 'SUMMARY:' + escape(deal.provider_label + ' · service appointment'), 'DESCRIPTION:' + escape(publicText(deal, version)), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar' })), anchor = Object.assign(document.createElement('a'), { href: url, download: 'wasit-' + version.terms_digest.slice(0, 8) + '.ics' });
  anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function AgreementTechnician({ deal, version, onClose }) {
  const wake = useRef(null), close = useRef(null);
  useEffect(() => {
    let stopped = false; const previous = document.activeElement, app = document.querySelector('.app-root'), wasInert = app?.inert;
    if (app) app.inert = true;
    close.current?.focus();
    navigator.wakeLock?.request('screen').then((lock) => { if (stopped) lock.release().catch(() => {}); else wake.current = lock; }).catch(() => {});
    const key = (event) => { if (event.key === 'Escape') onClose(); if (event.key === 'Tab') { event.preventDefault(); close.current?.focus(); } };
    window.addEventListener('keydown', key);
    return () => { stopped = true; wake.current?.release().catch(() => {}); window.removeEventListener('keydown', key); if (app) app.inert = wasInert; if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [onClose]);
  const terms = version.terms;
  return createPortal(<div className="tech-view" role="dialog" aria-modal="true" aria-label="Agreed work for the technician"><button ref={close} className="icon-btn tech-close" onClick={onClose} aria-label="Close technician view"><X size={20} /></button><p className="tech-eyebrow">The agreed work and price</p><h2>{deal.provider_label}</h2><p className="tech-slot">{terms.schedule_label}</p><dl>{terms.lines.filter((line) => ['committed', 'included'].includes(line.kind)).map((line) => <div key={line.id}><dt>{line.label} · {line.quantity} {line.unit}</dt><dd>{line.kind === 'included' ? 'Included' : rp(line.quantity * line.unit_price)}</dd></div>)}</dl><p className="tech-code mono">Version {version.number} · {version.terms_digest.slice(0, 8).toUpperCase()}</p><p>Additional work requires a new agreement accepted by both parties.</p></div>, document.body);
}

export function AgreementTicket({ deal, version, category, slot, onCheck, onTechnician, onNotice }) {
  const terms = version.terms, channel = CHANNEL.sim_chat;
  const share = async () => { const text = publicText(deal, version); try { if (navigator.share) await navigator.share({ title: 'Wasit agreement', text }); else { await navigator.clipboard.writeText(text); onNotice?.('Agreement copied. Private spending limits are omitted.'); } } catch (error) { if (error.name !== 'AbortError') onNotice?.('Sharing is unavailable in this browser. Show the agreement directly to the technician.'); } };
  return <><div className="ticket-band band-sim_chat"><channel.Icon size={14} /><span>via chat · <b>{terms.schedule_label}</b></span></div><div className="commerce ticket"><AgreementProductHeader name={deal.provider_label} category={category} summary={terms.scope.replaceAll('_', ' ')} total={terms.committed_total} badge={'Active · version ' + version.number} locked simulation={deal.demo_provider} /><div className="cm-body"><span className="stamp-locked" aria-hidden="true">AGREED</span><span className="cm-eyebrow">Wasit · your agreement ticket</span><AgreementSteps current={4} /><h2>Both parties accepted</h2><p>This version records the agreed work and price. It remains active until both parties accept a new version.</p><div className="receipt-rows"><div><span>Appointment</span><b>{terms.schedule_label}</b></div><div><span>Location</span><b>{terms.location_label}</b></div></div><AgreementTerms version={version} compact /><div className="perforation" aria-hidden="true" /><div className="stub"><span>Agreement code · version {version.number}</span><b className="mono">{version.terms_digest.slice(0, 8).toUpperCase()}</b><small className="mono">{version.terms_digest}</small></div><div className="cm-actions"><Cta onClick={onCheck}><Wrench size={17} /><span>Check extra work on site</span></Cta><div className="ticket-tools"><button className="btn-secondary" onClick={onTechnician}><Maximize2 size={15} />Show technician</button><button className="btn-secondary" disabled={!slot || !Number.isFinite(Date.parse(slot))} title={!slot ? 'A precise confirmed appointment time is required.' : undefined} onClick={() => calendarFile(deal, version, slot)}><CalendarPlus size={15} />Calendar</button><button className="btn-secondary" onClick={share}><Share2 size={15} />Share</button></div></div><span className="cm-foot">Extra work needs approval · payments remain simulated</span></div></div></>;
}

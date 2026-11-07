import { useEffect, useId, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Camera, FileSearch, Plus, Trash2 } from 'lucide-react';
import { Cta } from './Bits.jsx';
import { rp } from '../lib/format.js';
import { AgreementNotice, transactionDate } from './AgreementPanels.jsx';

const id = () => 'bill_' + (globalThis.crypto?.randomUUID?.().replaceAll('-', '') ?? Math.random().toString(36).slice(2).padEnd(12, '0'));
const units = ['job', 'unit', 'pcs', 'service', 'hour', 'm2'];
const statuses = { matches: 'Matches the agreement', already_included: 'Already included', price_changed: 'Price changed', new_work: 'New work requires approval', needs_clarification: 'Needs clarification' };

export function AgreementBill({ active, quote, checks = [], busy, onCheck, onPreview }) {
  const reduce = useReducedMotion();
  const options = [...new Map([...(active.terms.lines ?? []), ...(quote?.lines ?? [])].map((line) => [line.item_code, line])).values()];
  const makeLine = () => ({ id: id(), item_code: options[0]?.item_code ?? 'other', label: options[0]?.label ?? 'Other item', unit: options[0]?.unit ?? 'job', quantity: 1, unit_price: '', explanation: '' });
  const [lines, setLines] = useState(() => [makeLine()]), [confirmed, setConfirmed] = useState(false), [reading, setReading] = useState(false), [error, setError] = useState(null), [readerNote, setReaderNote] = useState('');
  const inputId = useId(), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => setConfirmed(false), [active.id, active.terms_digest]);
  const change = (lineId, fields) => { setLines((current) => current.map((line) => line.id === lineId ? { ...line, ...fields } : line)); setConfirmed(false); };
  const upload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { setError(new Error('Choose a JPG, PNG or WebP image up to 2 MB.')); event.target.value = ''; return; }
    setReading(true); setError(null); setConfirmed(false); setReaderNote('');
    try {
      const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('The image could not be read. Please try manual entry.')); reader.readAsDataURL(file); });
      const result = await onPreview({ expected_active_version_id: active.id, image_base64: data, mime_type: file.type });
      if (!alive.current) return;
      if (!Array.isArray(result?.lines) || !result.lines.length) throw new Error('No bill items were found. Enter the items manually.');
      setLines(result.lines.slice(0, 16).map((line) => { const itemCode = line.item_code ?? line.item ?? 'other', item = options.find((entry) => entry.item_code === itemCode); return { id: id(), item_code: itemCode, label: item?.label ?? line.label ?? 'Unconfirmed item', unit: units.includes(line.unit) ? line.unit : 'job', quantity: line.quantity ?? '', unit_price: line.unit_price ?? '', explanation: line.explanation ?? '' }; }));
      setReaderNote('Image reading is a draft. Check every item, unit, quantity and price before confirming.');
    } catch (failure) { if (alive.current) setError(failure); } finally { if (alive.current) setReading(false); event.target.value = ''; }
  };
  const submit = (event) => {
    event.preventDefault();
    if (!confirmed) return;
    const payload = lines.map((line) => ({ ...line, quantity: Number(line.quantity), unit_price: Number(line.unit_price), explanation: line.explanation.trim() || null }));
    onCheck({ expected_active_version_id: active.id, lines: payload });
  };
  return <section className="agreement-bill"><p className="q-label">Check a bill</p><p className="clarify-intro">Compare with active version {active.number}. This check does not approve additional work or change your agreement.</p>
    <form className="tx-form" onSubmit={submit}>
      {onPreview && <div className="bill-box"><label className="btn-secondary bill-pick" htmlFor={inputId} tabIndex={0} role="button" onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); document.getElementById(inputId)?.click(); } }}><Camera size={16} />{reading ? 'Reading image…' : 'Read a bill photo'}<input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={upload} disabled={busy || reading} hidden /></label><small className="by-line">JPG, PNG or WebP · up to 2 MB · manual entry is always available</small></div>}
      <AgreementNotice error={error} />{readerNote && <AgreementNotice>{readerNote}</AgreementNotice>}
      {lines.map((line, index) => <fieldset className="tx-bill-row" key={line.id} disabled={busy || reading}><legend>Bill item {index + 1}</legend><label>Item<select value={line.item_code} onChange={(event) => { const item = options.find((entry) => entry.item_code === event.target.value); change(line.id, { item_code: event.target.value, label: item?.label ?? 'Other item', unit: item?.unit ?? 'job' }); }}>{!options.some((item) => item.item_code === line.item_code) && line.item_code !== 'other' && <option value={line.item_code}>{line.label}</option>}{options.map((item) => <option key={item.item_code} value={item.item_code}>{item.label}</option>)}<option value="other">Other / needs clarification</option></select></label>{line.item_code === 'other' && <label>Item description<input required value={line.label} maxLength={200} onChange={(event) => change(line.id, { label: event.target.value })} /></label>}<div className="tx-field-grid"><label>Quantity<input type="number" min="1" max="20" step="1" required value={line.quantity} onChange={(event) => change(line.id, { quantity: event.target.value })} /></label><label>Unit<select value={line.unit} onChange={(event) => change(line.id, { unit: event.target.value })}>{units.map((unit) => <option value={unit} key={unit}>{unit}</option>)}</select></label></div><label>Price per unit (Rp)<input type="number" min="0" max="100000000" step="1" required value={line.unit_price} onChange={(event) => change(line.id, { unit_price: event.target.value })} placeholder="Enter the bill price" /></label><label>Provider explanation (optional)<input value={line.explanation} maxLength={1000} onChange={(event) => change(line.id, { explanation: event.target.value })} /></label>{lines.length > 1 && <button type="button" className="tx-link" onClick={() => { setLines((current) => current.filter((entry) => entry.id !== line.id)); setConfirmed(false); }}><Trash2 size={15} />Remove item</button>}</fieldset>)}
      {lines.length < 16 && <button type="button" className="btn-secondary" disabled={busy || reading} onClick={() => { setLines((current) => [...current, makeLine()]); setConfirmed(false); }}><Plus size={16} />Add bill item</button>}
      <label className="confirm-check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I checked the items, units, quantities and prices shown above.</span></label><Cta type="submit" busy={busy || reading} disabled={!confirmed}>Compare with active agreement</Cta>
    </form>
    {checks.length > 0 && <div className="tx-bill-results"><p className="terms-label">Bill check history</p>{[...checks].reverse().map((check) => <details key={check.id} className="tx-details" open={check.id === checks.at(-1)?.id}><summary>{rp(check.submitted_total)} · {transactionDate(check.created_at)}{check.version_id !== active.id && ' · earlier agreement'}</summary>{check.results.map((result) => { const line = check.lines.find((entry) => entry.id === result.bill_line_id), card = result.status === 'matches' ? 'green' : result.status === 'already_included' ? 'red' : 'yellow'; return <div className={'verdict tx-result-' + result.status} key={result.bill_line_id}><div className="verdict-raise"><motion.div className={'raised-card raised-' + card} initial={reduce ? false : { y: 40, rotate: -6, opacity: 0 }} animate={{ y: 0, rotate: -2, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }} aria-hidden="true" /><div><span className="raised-label">Agreement check</span><strong className="raised-verdict">{statuses[result.status] ?? result.status}</strong><span className="raised-item">{line?.label} · {line ? rp(line.quantity * line.unit_price) : ''}</span></div></div><p>{result.reason}</p>{result.source_message_id && <p className="sources mono">Based on the provider message recorded in this version.</p>}</div>; })}</details>)}</div>}
  </section>;
}

export function AgreementChanges({ active, quote, pending, busy, onPropose }) {
  const candidates = (quote?.lines ?? []).filter((line) => line.kind === 'optional' && line.source?.message_id && Number.isSafeInteger(line.unit_price));
  const [selected, setSelected] = useState([]), [limit, setLimit] = useState(String(active.terms.spending_limit)), [confirmed, setConfirmed] = useState(false);
  useEffect(() => { setSelected([]); setLimit(String(active.terms.spending_limit)); setConfirmed(false); }, [active.id, quote?.revision]);
  const chosen = candidates.filter((line) => selected.includes(line.id));
  const total = active.terms.committed_total + chosen.reduce((sum, line) => { const existing = active.terms.lines.find((old) => old.item_code === line.item_code && old.unit === line.unit && old.kind === 'committed'); return sum + line.quantity * line.unit_price - (existing ? existing.quantity * existing.unit_price : 0); }, 0);
  const tooHigh = total > Number(limit);
  const toggle = (line) => { setConfirmed(false); setSelected((current) => current.includes(line.id) ? current.filter((value) => value !== line.id) : [...current.filter((value) => candidates.find((candidate) => candidate.id === value)?.source.message_id === line.source.message_id), line.id]); };
  return <section className="commerce"><div className="cm-body"><h2>Approve a change before work starts</h2><p>Choose additional work explicitly quoted by your selected provider. Both parties must accept the new version.</p>{pending ? <AgreementNotice>Finish or reject the pending proposal before creating another change.</AgreementNotice> : !candidates.length ? <p className="tx-empty">No additional work has been quoted yet. Ask the provider to state the item, quantity, unit and price in this chat.</p> : <form className="tx-form" onSubmit={(event) => { event.preventDefault(); if (!confirmed || !chosen.length || tooHigh) return; onPropose({ expected_active_version_id: active.id, change_message_id: chosen[0].source.message_id, committed_line_ids: chosen.map((line) => line.id), spending_limit: Number(limit) }); }}><div className="tx-change-options">{candidates.map((line) => <label className="tx-change-option" key={line.id}><input type="checkbox" checked={selected.includes(line.id)} onChange={() => toggle(line)} /><span><b>{line.label} · {rp(line.quantity * line.unit_price)}</b><small>{line.quantity} {line.unit} · {line.condition || 'Only after approval'}</small><q>{line.source.snippet}</q></span></label>)}</div><div className="total-card"><span>Proposed agreed total</span><div><strong>{rp(total)}</strong></div></div><label>Your new private spending limit (Rp)<input type="number" required min="0" max="100000000" step="1" value={limit} onChange={(event) => { setLimit(event.target.value); setConfirmed(false); }} /></label>{tooHigh && <AgreementNotice>The proposed total exceeds this limit. Enter the limit you explicitly want to approve before continuing.</AgreementNotice>}<label className="confirm-check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I request this additional work and acknowledge the private spending limit shown above. This creates a proposal for both parties to review.</span></label><Cta busy={busy} disabled={!chosen.length || !confirmed || tooHigh}>Create change proposal</Cta></form>}</div></section>;
}

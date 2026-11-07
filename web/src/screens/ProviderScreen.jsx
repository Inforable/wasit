import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BriefcaseBusiness, FileCheck2, MessageCircle, RefreshCw, Send, Star } from 'lucide-react';
import { createProviderApi } from '../lib/api.js';
import { Avatar, Safety } from '../components/Bits.jsx';
import { AgreementAcceptance, AgreementHistory, AgreementLifecycle, AgreementNotice, AgreementTerms, transactionDate } from '../components/AgreementPanels.jsx';
import { ProviderBusiness, ProviderFeedback } from '../components/ProviderBusiness.jsx';
import '../styles/transactions.css';

const bearerTokens = new Map();
function consumeProviderToken(branchId) {
  if (typeof window === 'undefined') return null;
  const fragment = new URLSearchParams(window.location.hash.slice(1)), token = fragment.get('token');
  if (token) {
    bearerTokens.set(branchId, token); fragment.delete('token');
    const remainder = fragment.toString();
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search + (remainder ? '#' + remainder : ''));
  }
  return bearerTokens.get(branchId) ?? null;
}
const newMessageId = () => 'client_' + (globalThis.crypto?.randomUUID?.().replaceAll('-', '') ?? Math.random().toString(36).slice(2).padEnd(12, '0'));

export function ProviderScreen({ branchId, api: injectedApi, session, onBack, pollInterval = 4000 }) {
  const [hasToken, setHasToken] = useState(() => Boolean(consumeProviderToken(branchId))), [snapshot, setSnapshot] = useState(null), [tab, setTab] = useState('inbox'), [draft, setDraft] = useState(''), [error, setError] = useState(null), [notice, setNotice] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [reviewKey, setReviewKey] = useState(0);
  const alive = useRef(false), controller = useRef(null), fetching = useRef(false), generation = useRef(0), pendingMessage = useRef(null), sending = useRef(false), log = useRef(null), end = useRef(null), followMessages = useRef(true);
  const api = useMemo(() => injectedApi ?? createProviderApi({ getBearerToken: () => bearerTokens.get(branchId) ?? null, onUnauthorized: () => { bearerTokens.delete(branchId); if (alive.current) setHasToken(false); } }), [injectedApi, branchId]);
  const endpoint = '/api/provider/' + encodeURIComponent(branchId);
  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (quiet && fetching.current) return null;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const ticket = ++generation.current; fetching.current = true;
    try { const next = await api(endpoint, { signal: abort.signal }); if (alive.current && ticket === generation.current) { setSnapshot(next); setLoading(false); } return next; }
    catch (failure) { if (alive.current && ticket === generation.current && failure.name !== 'AbortError') { setError(failure); setLoading(false); } return null; }
    finally { if (ticket === generation.current) fetching.current = false; }
  }, [api, endpoint]);
  useEffect(() => { setHasToken(Boolean(consumeProviderToken(branchId))); setDraft(''); pendingMessage.current = null; }, [branchId]);
  useEffect(() => { alive.current = true; if (!injectedApi && !hasToken) { setLoading(false); return () => { alive.current = false; }; } refresh(); const timer = setInterval(() => { if (!sending.current) refresh({ quiet: true }); }, Math.max(2000, pollInterval)); return () => { alive.current = false; clearInterval(timer); controller.current?.abort(); }; }, [refresh, pollInterval, hasToken, injectedApi]);
  useEffect(() => { if (followMessages.current && tab === 'inbox') end.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }, [snapshot?.messages?.at(-1)?.id, tab]);
  const action = async (name, body) => {
    if (sending.current) return false;
    sending.current = true; setBusy(true); setError(null); setNotice(''); controller.current?.abort(); generation.current++;
    try { await api(endpoint + '/' + name, { method: 'POST', body }); await refresh(); if (alive.current) setNotice('Saved. Your current job details are shown below.'); return true; }
    catch (failure) { if (alive.current) { setError(failure); if (failure.status === 409) { setReviewKey((value) => value + 1); await refresh(); setNotice('The agreement changed. Review the current version before accepting again.'); } } return false; }
    finally { sending.current = false; if (alive.current) setBusy(false); }
  };
  const sendMessage = async (event) => {
    event.preventDefault(); const text = draft.trim();
    if (!text || sending.current) return;
    if (pendingMessage.current?.text !== text) pendingMessage.current = { text, client_message_id: newMessageId() };
    const body = pendingMessage.current;
    const success = await action('messages', body);
    if (success && alive.current) { pendingMessage.current = null; setDraft((current) => current.trim() === text ? '' : current); followMessages.current = true; }
  };
  if (!injectedApi && !hasToken) return <section className="page tx-page"><h1 tabIndex={-1}>Open your private provider link</h1><p className="tx-empty">This conversation needs its valid invitation link. Ask the customer to share a fresh provider link, then open it in this tab.</p><AgreementNotice error={error} />{onBack && <button className="tx-button tx-secondary" onClick={onBack}>Back to Wasit</button>}</section>;
  if (loading) return <section className="page tx-page"><h1 tabIndex={-1}>Opening your service request</h1><p role="status" className="tx-empty">Loading your private conversation…</p><AgreementNotice error={error} onReload={() => refresh()} /></section>;
  if (!snapshot) return <section className="page tx-page"><h1 tabIndex={-1}>Conversation unavailable</h1><AgreementNotice error={error ?? new Error('The conversation could not be loaded.')} onReload={() => refresh()} /></section>;
  const active = snapshot.versions?.find((version) => version.id === snapshot.active_version_id), pending = snapshot.versions?.find((version) => version.id === snapshot.pending_version_id), job = snapshot.job_public;
  return <section className="page provider screen-enter">{onBack && <button className="back-link" onClick={onBack}><ArrowLeft size={17} />Back to Wasit</button>}<div className="provider-head"><p className="eyebrow">YOU AS THE PROVIDER</p><div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}><Avatar name={snapshot.provider_label} category={job.category} size={44} /><h1 tabIndex={-1} style={{ margin: 0, fontSize: 20, letterSpacing: '-0.02em' }}>{snapshot.provider_label}</h1></div><div className="provider-job">{job.scope.replaceAll('_', ' ')} · {job.units} requested unit(s) · {job.location_label} · {job.schedule_label}</div><div className="toggle"><span><strong>{snapshot.mode === 'human' ? 'You reply to Wasit' : 'Simulation provider'}</strong><small>{snapshot.mode === 'human' ? 'This private invitation is for your own replies. Optional work needs a separate quote and approval.' : 'This conversation uses a labeled simulation provider.'}</small></span><button className="icon-btn" onClick={() => { setError(null); refresh(); }} disabled={busy} aria-label="Refresh conversation"><RefreshCw size={17} /></button></div></div>
    <nav className="p-tabs" style={{ gridTemplateColumns: 'repeat(4,1fr)' }} aria-label="Provider workspace">{[['inbox', MessageCircle, 'Inbox'], ['agreement', FileCheck2, 'Job'], ['business', BriefcaseBusiness, 'Business'], ['feedback', Star, 'Feedback']].map(([key, Icon, label]) => <button key={key} type="button" aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}><Icon size={15} />{label}</button>)}</nav><AgreementNotice error={error} onReload={error ? () => refresh() : undefined} /><AgreementNotice>{notice}</AgreementNotice>
    {tab === 'inbox' && <><div className="thread" ref={log} role="log" aria-label="Provider conversation" aria-live="polite" onScroll={() => { const node = log.current; if (node) followMessages.current = node.scrollHeight - node.scrollTop - node.clientHeight < 72; }}><div className="bubbles">{snapshot.messages?.length ? snapshot.messages.map((message) => <div className={'bubble ' + (message.sender === 'provider' ? 'out' : 'in')} key={message.id}><span className="who">{message.sender === 'provider' ? 'You' : message.sender === 'agent' ? 'Wasit' : 'Customer'}</span>{message.text}{message.engine && <small className={'engine engine-' + message.engine}>{message.engine === 'model' ? 'Model' : 'Rules'}</small>}</div>) : <p className="composer-hint">The conversation is ready. Send your service quote to get started.</p>}<div ref={end} /></div></div><p className="composer-hint">State the item, quantity, unit and price. Confirm transport, included work and the available appointment. Extra work needs approval.</p><form className="composer" onSubmit={sendMessage}><textarea id="provider-message-draft" rows={1} maxLength={1000} required value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) sendMessage(event); }} placeholder="Write your reply…" disabled={busy} aria-label="Your provider reply" /><button className="send" type="submit" disabled={!draft.trim() || busy} aria-label="Send" aria-busy={busy || undefined}><Send size={18} /></button></form>{pending && <button className="btn-secondary" onClick={() => setTab('agreement')}>Review agreement version {pending.number}</button>}</>}
    {tab === 'agreement' && <><section className="commerce"><div className="cm-body"><span className="cm-eyebrow">Your agreed work</span><h2>{active ? 'Active agreement' : 'Your proposed agreement'}</h2>{active ? <AgreementTerms version={active} provider /> : <p className="tx-empty">No agreement is active yet. The customer can select your quote and send a proposal for review.</p>}</div></section>{pending && <section className="commerce tx-pending"><div className="cm-body"><span className="cm-eyebrow">{pending.status === 'draft' ? 'Draft' : 'Awaiting acceptance'}</span><h2>Proposed version {pending.number}</h2><AgreementTerms version={pending} provider /><AgreementAcceptance key={pending.id + ':' + reviewKey} version={pending} activeVersionId={snapshot.active_version_id} role="provider" busy={busy} onAction={action} /></div></section>}<AgreementLifecycle key={'provider-lifecycle:' + snapshot.active_version_id} value={snapshot.lifecycle} pending={Boolean(pending)} role="provider" busy={busy} onAction={action} /><AgreementHistory versions={snapshot.versions} provider activeVersionId={snapshot.active_version_id} pendingVersionId={snapshot.pending_version_id} /></>}
    {tab === 'business' && <ProviderBusiness key={branchId} api={api} branchId={branchId} />}{tab === 'feedback' && <ProviderFeedback key={branchId} api={api} branchId={branchId} />}
    <Safety>Provider access is private to this invitation. Payment and dispute outcomes are simulations.</Safety>
  </section>;
}

export default ProviderScreen;

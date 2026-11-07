import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, RefreshCw, ShieldCheck, Unlock, Wallet } from 'lucide-react';
import { api as defaultApi } from '../lib/api.js';
import { Cta, Safety } from '../components/Bits.jsx';
import { RefCard } from '../components/Agentic.jsx';
import { AgreementProductHeader, AgreementSteps, AgreementTechnician, AgreementTicket } from '../components/AgreementCommerce.jsx';
import { rp } from '../lib/format.js';
import { AgreementAcceptance, AgreementHistory, AgreementLifecycle, AgreementNotice, AgreementTerms } from '../components/AgreementPanels.jsx';
import { AgreementBill, AgreementChanges } from '../components/AgreementBill.jsx';
import '../styles/transactions.css';

export function AgreementScreen({ dealId, api = defaultApi, session, initialDeal = null, requestSnapshot = null, onBack, onNavigate, onUpdated, initialSection, pollInterval = 5000 }) {
  const [deal, setDeal] = useState(initialDeal), [snapshot, setSnapshot] = useState(requestSnapshot), [checks, setChecks] = useState([]), [loading, setLoading] = useState(!initialDeal), [busy, setBusy] = useState(false), [error, setError] = useState(null), [notice, setNotice] = useState(''), [reviewKey, setReviewKey] = useState(0);
  const alive = useRef(false), fetching = useRef(false), controller = useRef(null), current = useRef(0), busyRef = useRef(false), providerStep = useRef(null);
  const [checkoutStep, setCheckoutStep] = useState(0), [extrasReviewed, setExtrasReviewed] = useState(false), [technician, setTechnician] = useState(false), [localSection, setLocalSection] = useState(null), [providerReview, setProviderReview] = useState(false), [providerInvite, setProviderInvite] = useState(null);
  const closeTechnician = useCallback(() => setTechnician(false), []);
  const endpoint = '/api/deals/' + encodeURIComponent(dealId);
  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (fetching.current && quiet) return null;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const sequence = ++current.current; fetching.current = true;
    try {
      const next = await api(endpoint, { signal: abort.signal });
      const [history, request] = await Promise.all([api(endpoint + '/bill-checks', { signal: abort.signal }), requestSnapshot ? Promise.resolve(requestSnapshot) : api('/api/requests/' + encodeURIComponent(next.request_id), { signal: abort.signal })]);
      if (!alive.current || sequence !== current.current) return null;
      const orderedChecks = [...(Array.isArray(history) ? history : history.checks ?? [])].sort((left, right) => left.created_at - right.created_at || left.id.localeCompare(right.id));
      setDeal(next); setChecks(orderedChecks); setSnapshot(request); setLoading(false);
      return next;
    } catch (failure) { if (failure.name !== 'AbortError' && alive.current && sequence === current.current) { setError(failure); setLoading(false); } return null; }
    finally { if (sequence === current.current) fetching.current = false; }
  }, [api, endpoint, requestSnapshot]);
  useEffect(() => { alive.current = true; setError(null); refresh(); const timer = setInterval(() => { if (!busyRef.current) refresh({ quiet: true }); }, Math.max(2000, pollInterval)); return () => { alive.current = false; clearInterval(timer); controller.current?.abort(); }; }, [refresh, pollInterval]);
  const action = async (name, body) => {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError(null); setNotice(''); controller.current?.abort(); current.current++;
    try {
      await api(endpoint + '/' + name, { method: 'POST', body });
      const next = await refresh();
      if (alive.current) { setNotice('Saved. The current agreement details are shown below.'); onUpdated?.(next); }
      return true;
    } catch (failure) {
      if (alive.current) { setError(failure); if (failure.status === 409) { setReviewKey((value) => value + 1); await refresh(); setNotice('The agreement changed. Review the refreshed version and confirm it again.'); } }
      return false;
    } finally { busyRef.current = false; if (alive.current) setBusy(false); }
  };
  const runDemo = async (name, payload) => {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError(null);
    try { await api('/api/demo/deals/' + encodeURIComponent(dealId) + '/provider-action', { method: 'POST', body: { action: ({ 'disputes/respond': 'respond_dispute', 'reviews/reply': 'reply_review' })[name] ?? name, payload } }); const next = await refresh(); if (alive.current) onUpdated?.(next); return true; }
    catch (failure) { if (alive.current) { setError(failure); if (failure.status === 409) { setReviewKey((value) => value + 1); await refresh(); } } return false; }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  };
  const pendingId = deal?.pending_version_id, pendingState = deal?.versions.find((version) => version.id === pendingId), pendingStatus = pendingState?.status;
  const acceptedBy = (version, role) => version?.[role + '_accepted'] ?? version?.acceptances?.some((entry) => entry.role === role) ?? false;
  const awaitingProvider = pendingStatus === 'pending' && acceptedBy(pendingState, 'consumer') && !acceptedBy(pendingState, 'provider');
  useEffect(() => { setProviderReview(false); setProviderInvite(null); }, [pendingId]);
  useEffect(() => { if (awaitingProvider) requestAnimationFrame(() => providerStep.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })); }, [awaitingProvider, pendingId]);
  const getProviderInvite = async () => {
    if (busyRef.current || !deal) return;
    busyRef.current = true; setBusy(true); setError(null);
    try { const invite = await api('/api/requests/' + encodeURIComponent(deal.request_id) + '/branches/' + encodeURIComponent(deal.branch_id) + '/link'); if (alive.current) setProviderInvite(invite.provider_url); }
    catch (failure) { if (alive.current) setError(failure); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  };
  useEffect(() => { setCheckoutStep(pendingStatus === 'pending' ? 2 : 0); setExtrasReviewed(false); }, [pendingId, pendingStatus]);
  const checkUpdates = async () => {
    if (busyRef.current || !deal) return;
    busyRef.current = true; setBusy(true); setError(null);
    try { await api('/api/requests/' + encodeURIComponent(deal.request_id) + '/process', { method: 'POST', body: { max_steps: 2 } }); await refresh(); if (alive.current) setNotice('Provider updates checked. An accepted agreement changes only after both parties accept a new version.'); }
    catch (failure) { if (alive.current) setError(failure); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  };
  if (loading) return <section className="page"><h1 className="board-title" tabIndex={-1}>Opening your agreement</h1><p className="tx-empty" role="status">Loading the current version and payment simulation…</p><AgreementNotice error={error} onReload={() => refresh()} /></section>;
  if (!deal) return <section className="page"><h1 tabIndex={-1}>Agreement unavailable</h1><AgreementNotice error={error ?? new Error('The agreement could not be loaded.')} onReload={() => refresh()} />{onBack && <button className="btn-secondary" onClick={onBack}>Back to your request</button>}</section>;
  const active = deal.versions.find((version) => version.id === deal.active_version_id), pending = deal.versions.find((version) => version.id === deal.pending_version_id), branch = snapshot?.branches?.find((value) => value.id === deal.branch_id);
  const openSection = (section) => { if (onNavigate) onNavigate('/deals/' + encodeURIComponent(dealId) + (section === 'bill' ? '/check' : '')); else { setLocalSection(section); window.scrollTo({ top: 0 }); } };
  const onSite = (initialSection ?? localSection) === 'bill';
  const proposal = pending && <div className="commerce tx-pending"><div className="cm-body"><span className="cm-eyebrow">Wasit · proposed version {pending.number}</span><h2>{pending.status === 'draft' ? 'Review your change' : 'Awaiting both parties'}</h2><p>Active version {active?.number} continues to apply while this proposal is pending.</p><AgreementTerms version={pending} /><AgreementAcceptance key={pending.id + ':' + reviewKey} version={pending} activeVersionId={deal.active_version_id} busy={busy} onAction={action} /></div></div>;
  const providerNextStep = awaitingProvider && <section className="commerce" ref={providerStep} id="provider-acceptance-step" style={{ scrollMarginTop: 82 }} aria-labelledby="provider-acceptance-title"><div className="cm-body"><span className="cm-eyebrow">One more approval</span><h2 id="provider-acceptance-title">Waiting for provider acceptance</h2><p>Your acceptance is recorded. {deal.provider_label} must review and accept this same version before it becomes active.{active ? ' Your current agreement remains active in the meantime.' : ''}</p>{deal.demo_provider === true ? <><p className="cm-foot">Simulation: you can explicitly review this version as the demo provider.</p>{!providerReview ? <Cta disabled={busy} onClick={() => setProviderReview(true)}>Review as simulated provider</Cta> : <><AgreementTerms version={pending} provider /><AgreementAcceptance key={'next-provider:' + pending.id + ':' + reviewKey} version={pending} activeVersionId={deal.active_version_id} role="provider" busy={busy} onAction={runDemo} /></>}</> : <>{!providerInvite ? <Cta busy={busy} onClick={getProviderInvite}>Get private provider review link</Cta> : <a className="btn-secondary" href={providerInvite} target="_blank" rel="noopener noreferrer">Open private provider review</a>}<p className="cm-foot">Share this private invitation only with the selected provider. They can accept from their own phone or tab.</p></>}</div></section>;
  const alerts = <><AgreementNotice error={error} onReload={error ? () => refresh() : undefined} /><AgreementNotice>{notice}</AgreementNotice></>;
  if (onSite && active) return <section className="page clarify screen-enter"><button className="back-link" onClick={() => openSection(null)}><ArrowLeft size={17} />Agreement</button><h1 tabIndex={-1}>Extra work proposed on site?</h1><p className="clarify-intro">Check the bill against active version {active.number} with {deal.provider_label}. Additional work needs a new proposal and acceptance by both parties.</p>{alerts}{providerNextStep}<button className="btn-secondary" disabled={busy} onClick={checkUpdates}><RefreshCw size={15} />Check provider updates</button><AgreementBill key={'bill:' + active.id} active={active} quote={branch?.quote} checks={checks} busy={busy} onCheck={(body) => action('bill-checks', body)} onPreview={(body) => api(endpoint + '/bill-preview', { method: 'POST', body })} />{proposal}{!['released', 'resolved', 'disputed', 'escalated'].includes(deal.lifecycle?.status) && <AgreementChanges active={active} quote={branch?.quote} pending={Boolean(pending)} busy={busy} onPropose={(body) => action('changes', body)} />}<Safety>Bill checks do not approve work or change the active agreement.</Safety></section>;
  return <section className="page screen-enter">{!active && <button className="back-link" onClick={() => checkoutStep > 0 ? setCheckoutStep((value) => value - 1) : onNavigate ? onNavigate('/requests/' + deal.request_id + '/compare') : onBack?.()}><ArrowLeft size={17} />{checkoutStep > 0 ? 'Previous step' : 'Back to offers'}</button>}{alerts}{providerNextStep}{technician && active && <AgreementTechnician deal={deal} version={active} onClose={closeTechnician} />}
    {active ? <AgreementTicket deal={deal} version={active} category={snapshot?.job?.category} slot={branch?.quote?.slot} onCheck={() => openSection('bill')} onTechnician={() => setTechnician(true)} onNotice={setNotice} /> : pending ? <div className="commerce tx-pending"><AgreementProductHeader name={deal.provider_label} category={snapshot?.job?.category} summary={pending.terms.scope.replaceAll('_', ' ')} total={pending.terms.committed_total} badge="Selected quote" simulation={deal.demo_provider} /><div className="cm-body"><span className="cm-eyebrow">Wasit · review your agreement</span><AgreementSteps current={checkoutStep} />{checkoutStep === 0 && <div className="cm-step-body"><h2>Ready to agree on this work?</h2><p>You selected this quote. Review the exact work, included items and optional prices before either party accepts.</p><div className="cm-chips"><span><Unlock size={13} />Not active yet</span><span><Wallet size={13} />No real payment</span></div><Cta onClick={() => setCheckoutStep(1)}>Review terms</Cta></div>}{checkoutStep === 1 && <div className="cm-step-body"><h2>The work and terms</h2><AgreementTerms version={pending} /><label className="confirm-check"><input type="checkbox" checked={extrasReviewed} onChange={(event) => setExtrasReviewed(event.target.checked)} /><span>I reviewed included work and optional prices. Extra work requires a new accepted version before it is carried out.</span></label><div className="cm-actions"><Cta disabled={!extrasReviewed} onClick={() => setCheckoutStep(2)}>Continue to acceptance</Cta></div></div>}{checkoutStep === 2 && <div className="cm-step-body"><h2>Accept the same version</h2><div className="total-card"><span>Agreed work total</span><div><strong>{rp(pending.terms.committed_total)}</strong><small>Version {pending.number} · optional work excluded</small></div></div><p>Both parties must accept these exact terms. Your private spending limit remains {rp(pending.terms.spending_limit)}.</p><AgreementAcceptance key={pending.id + ':' + reviewKey} version={pending} activeVersionId={deal.active_version_id} busy={busy} onAction={action} /><button className="text-link muted" onClick={() => setCheckoutStep(1)}>Review terms again</button></div>}<span className="cm-foot"><ShieldCheck size={11} style={{ verticalAlign: -1 }} />Two-party acceptance · simulated payments</span></div></div> : <p className="notice">This proposal was rejected. Return to your request to review the available offers.</p>}
    {active && <>{proposal}<AgreementLifecycle key={'lifecycle:' + deal.active_version_id} value={deal.lifecycle} pending={Boolean(pending)} busy={busy} onAction={action} />{checks.length > 0 && <><p className="terms-label">Previous bill checks ({checks.length})</p><ol className="check-stack">{[...checks].reverse().slice(0, 8).map((check) => <li key={check.id}><span>{rp(check.submitted_total)}</span><RefCard card={check.results.every((result) => result.status === 'matches') ? 'green' : 'yellow'}>{check.results.every((result) => result.status === 'matches') ? 'Matches agreement' : 'Review needed'}</RefCard></li>)}</ol></>}</>}
    {deal.demo_provider === true && active && <details className="consumer-demo"><summary>Simulated provider controls</summary><p>These explicit controls act as the demo provider. They do not represent acceptance by a real business.</p>{active && <AgreementLifecycle value={deal.lifecycle} pending={Boolean(pending)} role="provider" busy={busy} onAction={runDemo} />}</details>}
    {active && <AgreementHistory versions={deal.versions} activeVersionId={deal.active_version_id} pendingVersionId={deal.pending_version_id} />}<button className="text-link" style={{ alignSelf: 'center' }} onClick={() => onNavigate ? onNavigate('/') : onBack?.()}>Start a new request</button><Safety>Wasit keeps each accepted version. Payments and dispute outcomes are simulations.</Safety>
  </section>;
}

export default AgreementScreen;

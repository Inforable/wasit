import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Cpu, RefreshCw } from 'lucide-react';

export default function RequestModelPicker({ requestId, api, processingPaused = false, onPauseProcessing, onConfigChange, onSavingChange }) {
  const [config, setConfig] = useState(null), [draft, setDraft] = useState(''), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  const id = useId(), mounted = useRef(false), sequence = useRef(0), reading = useRef(null), writing = useRef(null), savingRef = useRef(false);
  const endpoint = requestId ? '/api/requests/' + encodeURIComponent(requestId) + '/models' : '/api/settings/models';
  const read = useCallback(async ({ preserveDraft = false, quiet = false } = {}) => {
    if (savingRef.current) return;
    reading.current?.abort(); const controller = new AbortController(); reading.current = controller; const ticket = ++sequence.current;
    if (!quiet) { setLoading(true); setError(''); }
    try {
      const value = await api(endpoint, { signal: controller.signal });
      if (mounted.current && ticket === sequence.current && !controller.signal.aborted) { setConfig(value); onConfigChange?.(value); setDraft(current => preserveDraft && current ? current : value.selected.request_model); }
    } catch (reason) { if (mounted.current && ticket === sequence.current && reason.name !== 'AbortError') setError(reason.message); }
    finally { if (mounted.current && ticket === sequence.current && !controller.signal.aborted) setLoading(false); }
  }, [api, endpoint, onConfigChange]);
  useEffect(() => {
    mounted.current = true; setConfig(null); setDraft(''); setSaved(false); setSaving(false); savingRef.current = false; read();
    return () => { mounted.current = false; sequence.current++; reading.current?.abort(); writing.current?.abort(); };
  }, [read]);
  useEffect(() => { if (!config?.busy) return; const timer = setInterval(() => read({ preserveDraft: true, quiet: true }), 2000); return () => clearInterval(timer); }, [config?.busy, read]);
  useEffect(() => () => onPauseProcessing?.(false), [onPauseProcessing]);
  const available = config?.available ?? [], currentLabel = available.find(model => model.id === config?.selected.request_model)?.label ?? config?.selected.request_model;
  const changed = Boolean(config && draft && draft !== config.selected.request_model), valid = available.some(model => model.id === draft);
  async function save(event) {
    event.preventDefault(); if (!changed || !valid || config.busy || savingRef.current) return;
    savingRef.current = true; onSavingChange?.(true); setSaving(true); setError(''); setSaved(false); reading.current?.abort(); sequence.current++;
    const controller = new AbortController(); writing.current = controller;
    try {
      const latest = requestId ? config : await api(endpoint, { signal: controller.signal });
      const body = requestId ? { request_model: draft, expected_revision: config.revision } : { request_model: draft, bill_model: latest.selected.bill_model };
      const value = await api(endpoint, { method: 'PUT', body, signal: controller.signal });
      if (mounted.current && !controller.signal.aborted) { setConfig(value); onConfigChange?.(value); setDraft(value.selected.request_model); setSaved(true); onPauseProcessing?.(false); }
    } catch (reason) {
      if (mounted.current && reason.name !== 'AbortError') {
        setError(reason.code === 'model_busy' ? 'An action is running. Your choice is kept; apply it after that action finishes.' : reason.code === 'stale_model' ? 'The current model changed. Review the refreshed selection and apply your choice again.' : reason.message);
        if (reason.status === 409) { savingRef.current = false; await read({ preserveDraft: true, quiet: true }); }
      }
    } finally { savingRef.current = false; onSavingChange?.(false); if (mounted.current && !controller.signal.aborted) setSaving(false); }
  }
  return <section className="request-model-picker" aria-label={requestId ? "Request AI model" : "Default request AI model"}><form onSubmit={save}><label className="field" htmlFor={id}><span><Cpu size={15} />{requestId ? "This request" : "New requests"}</span>{loading && !config ? <span role="status">Loading available models...</span> : config ? <select id={id} aria-label={requestId ? "Negotiation model" : "Default request model"} value={draft} disabled={saving} onFocus={() => onPauseProcessing?.(true)} onChange={event => { onPauseProcessing?.(true); setDraft(event.target.value); setSaved(false); setError(''); }}>{available.map(model => <option key={model.id} value={model.id}>{model.label}</option>)}</select> : null}</label>{config && <>{!config.enabled && <p className="cost-note">AI processing is currently unavailable. Your selection is saved for when it is available.</p>}<p className="cost-note">Currently {currentLabel}. {requestId ? "Applies to future AI actions in this request. Previous actions and account defaults stay unchanged." : "Sets the default for new requests. Existing requests and the bill image model stay unchanged."}</p>{processingPaused && <p className="cost-note" role="status">Automatic negotiation is paused while you choose. An action already running will finish normally.</p>}{config.busy && <p className="cost-note" role="status">An action is running. Apply your choice after it finishes.</p>}<button type="submit" className="btn-secondary" disabled={!changed || !valid || saving || config.busy} aria-busy={saving || undefined}>{saving ? 'Applying model...' : requestId ? 'Apply to next actions' : 'Save default'}</button>{processingPaused && <button type="button" className="text-link muted" disabled={saving} onClick={() => { setDraft(config.selected.request_model); setError(''); setSaved(false); onPauseProcessing?.(false); }}>{changed ? 'Cancel change and resume' : 'Resume automatic negotiation'}</button>}{saved && <p className="consumer-notice" role="status">{requestId ? "This request will use " + currentLabel + " for its next AI actions." : "New requests will use " + currentLabel + "."}</p>}</>}{error && <p className="notice" role="alert">{error}</p>}{!loading && !config && <button type="button" className="text-link" onClick={() => read()}><RefreshCw size={13} />Try again</button>}</form></section>;
}

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Cpu, RotateCcw } from 'lucide-react';
import { Cta } from './Bits.jsx';

export default function AIModelSettings({ api, onNavigate }) {
  const [config, setConfig] = useState(null), [draft, setDraft] = useState(null), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false), [retry, setRetry] = useState(0);
  const alive = useRef(false), saveController = useRef(null);
  useEffect(() => {
    alive.current = true; const controller = new AbortController();
    setLoading(true); setSaving(false); setError(''); setSaved(false); setConfig(null); setDraft(null);
    api('/api/settings/models', { signal: controller.signal }).then(value => { if (alive.current && !controller.signal.aborted) { setConfig(value); setDraft({ ...value.selected }); } }).catch(reason => { if (alive.current && reason.name !== 'AbortError') setError(reason.message); }).finally(() => { if (alive.current && !controller.signal.aborted) setLoading(false); });
    return () => { alive.current = false; controller.abort(); saveController.current?.abort(); };
  }, [api, retry]);
  const changed = Boolean(config && draft && (draft.request_model !== config.selected.request_model || draft.bill_model !== config.selected.bill_model));
  const available = config?.available ?? [];
  const valid = draft && ['request_model', 'bill_model'].every(key => available.some(model => model.id === draft[key]));
  const update = (key, value) => { setDraft(current => ({ ...current, [key]: value })); setSaved(false); setError(''); };
  async function save(event) {
    event.preventDefault(); if (saving || !valid || !changed) return;
    const controller = new AbortController(); saveController.current = controller;
    setSaving(true); setError(''); setSaved(false);
    try { const value = await api('/api/settings/models', { method: 'PUT', body: { request_model: draft.request_model, bill_model: draft.bill_model }, signal: controller.signal }); if (alive.current && !controller.signal.aborted) { setConfig(value); setDraft({ ...value.selected }); setSaved(true); } }
    catch (reason) { if (alive.current && reason.name !== 'AbortError') setError(reason.message); }
    finally { if (alive.current && !controller.signal.aborted) setSaving(false); }
  }
  return <section className="onboarding nested screen-enter"><div className="ob-top"><button className="back-link" onClick={() => onNavigate('/settings')}><ArrowLeft size={17} />Settings</button></div><div className="ob-heading" style={{ marginTop: 18 }}><h1 tabIndex={-1}>AI models</h1><p>Choose the models for your new requests and new bill previews. Existing requests keep their saved model settings.</p></div>{loading ? <p role="status">Loading your model preferences...</p> : config && draft ? <form onSubmit={save}><fieldset className="consumer-form-fields" disabled={saving}><label className="field"><span><Cpu size={15} />Request &amp; negotiation</span><select aria-label="Request and negotiation model" value={draft.request_model} onChange={event => update('request_model', event.target.value)}>{available.map(model => <option key={model.id} value={model.id}>{model.label}</option>)}</select></label><label className="field"><span><Cpu size={15} />Bill images</span><select aria-label="Bill image model" value={draft.bill_model} onChange={event => update('bill_model', event.target.value)}>{available.map(model => <option key={model.id} value={model.id}>{model.label}</option>)}</select></label></fieldset>{!config.enabled && <p className="ob-note">AI processing is currently unavailable. Your model preferences will apply when it is available.</p>}{config.defaults && <button type="button" className="text-link muted" disabled={saving} onClick={() => { setDraft({ ...config.defaults }); setSaved(false); setError(''); }}><RotateCcw size={14} />Restore defaults</button>}<div className="ob-actions"><Cta type="submit" disabled={saving || !changed || !valid} busy={saving}>Save model preferences</Cta></div>{saved && <p className="consumer-notice" role="status">Model preferences saved for your new requests and new bill previews.</p>}</form> : null}{error && <p className="notice" role="alert">{error}</p>}{!loading && !config && <button className="btn-secondary" onClick={() => setRetry(value => value + 1)}>Try again</button>}</section>;
}

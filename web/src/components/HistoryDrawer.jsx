import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleDashed, Lock, MessageCircle, X } from 'lucide-react';
import { historyDate, historyDestination, REQUEST_STATUS } from '../lib/history.js';

export function HistoryDrawer({ open, onClose, onNavigate, api, actorId, activeId, activeDealId }) {
  const [items, setItems] = useState(null), [error, setError] = useState(null), [retry, setRetry] = useState(0);
  const panel = useRef(null);
  useEffect(() => { setItems(null); setError(null); }, [actorId]);
  useEffect(() => {
    if (!open || !actorId) return;
    const controller = new AbortController(); let alive = true;
    setError(null);
    api('/api/requests', { signal: controller.signal }).then((value) => {
      const rows = Array.isArray(value) ? value : value.requests ?? [];
      if (alive) setItems([...rows].sort((left, right) => Number(right.created_at) - Number(left.created_at)));
    }).catch((failure) => { if (alive && failure.name !== 'AbortError') setError(failure); });
    return () => { alive = false; controller.abort(); };
  }, [open, actorId, api, retry]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector('button')?.focus();
    const key = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const controls = [...panel.current.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]')].filter((node) => node.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [open, onClose]);
  const go = (to) => { onClose(); onNavigate(to); };
  return typeof document === 'undefined' ? null : createPortal(<>
    <div className="drawer-backdrop" data-open={open} onClick={onClose} aria-hidden="true" />
    <aside ref={panel} className="drawer" data-open={open} role="dialog" aria-hidden={!open} aria-modal={open || undefined} aria-label="Your request history" inert={!open}>
      <div className="drawer-head"><div><p className="eyebrow">Wasit · your requests</p><h2>History <span className="drawer-count">{items?.length ?? 0}</span></h2></div><button className="drawer-close" onClick={onClose} aria-label="Close history"><X size={22} /></button></div>
      <div className="drawer-sub"><span>Recent requests</span><button className="drawer-new" onClick={() => go('/request')}>New request</button></div>
      <div className="drawer-list">
        {items === null && !error && <p className="drawer-empty" role="status">Loading your requests…</p>}
        {error && <div className="drawer-empty" role="alert"><p>{error.message}</p><button className="drawer-new" onClick={() => setRetry((value) => value + 1)}>Try again</button></div>}
        {items && !items.length && !error && <p className="drawer-empty">No requests yet. Start a new request to compare your first offers.</p>}
        {items?.map((request) => {
          const locked = request.status === 'locked', muted = ['failed', 'no_match'].includes(request.status);
          return <button key={request.id} className="history-row" aria-current={request.id === activeId || (request.deal_id && request.deal_id === activeDealId) ? 'page' : undefined} onClick={() => go(historyDestination(request))}>
            <span className={'history-icon' + (locked ? ' locked' : muted ? ' muted' : '')}>{locked ? <Lock size={16} /> : muted ? <CircleDashed size={16} /> : <MessageCircle size={16} />}</span>
            <span><strong>{request.request_text?.split('\n')[0] || 'Service request'}</strong><small>{REQUEST_STATUS[request.status] ?? request.status} · {historyDate(request.created_at)}</small></span>
          </button>;
        })}
      </div>
    </aside>
  </>, document.body);
}

export default HistoryDrawer;

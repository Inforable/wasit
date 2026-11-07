import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, Clapperboard, Cpu, LogOut, MapPin, Moon, PanelLeft, Settings, SlidersHorizontal, Sun, UserRound } from 'lucide-react';
import { WasitMark, Wordmark } from './WasitMark.jsx';
import TopbarModel from './TopbarModel.jsx';
import { HistoryDrawer } from './HistoryDrawer.jsx';
import { initials } from '../lib/format.js';
import { useTheme } from '../lib/theme.js';
import '../styles/shell-parity.css';

export function ThemeControl() {
  const [theme, setTheme] = useTheme();
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  return <button className="icon-btn" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={dark ? 'Use light theme' : 'Use dark theme'}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>;
}

function AccountMenu({ session, profile, onNavigate, onLogout, processingPaused, onPauseProcessing }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const root = useRef(null), trigger = useRef(null);
  const name = profile?.display_name || session?.user?.display_name || 'Demo customer';
  useEffect(() => {
    if (!open) return;
    const outside = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    const key = (event) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', key);
    root.current?.querySelector('[role="menuitem"]')?.focus();
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key); };
  }, [open]);
  const go = (path) => { setOpen(false); onNavigate(path); };
  const exit = async () => { setBusy(true); setError(''); try { await onLogout(); go('/account'); } catch (failure) { setError(failure.message); } finally { setBusy(false); } };
  return <div className="account-menu" ref={root}><button ref={trigger} className="account-chip" onClick={() => setOpen((value) => !value)} aria-label="Open account menu" aria-haspopup="menu" aria-expanded={open}>{initials(name) || 'W'}</button>{open && <div className="account-pop" role="menu" aria-label="Your account" onKeyDown={(event) => { const items = [...root.current.querySelectorAll('[role="menuitem"]')], index = items.indexOf(document.activeElement); let next; if (event.key === 'ArrowDown') next = (index + 1) % items.length; if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length; if (event.key === 'Home') next = 0; if (event.key === 'End') next = items.length - 1; if (next != null) { event.preventDefault(); items[next]?.focus(); } }}>
    <div className="account-who"><b>{name}</b><small>{session?.user?.email || 'Demo session · your own requests'}</small></div><p className="account-pop-label">Your workspace</p><button role="menuitem" className="account-pop-row" onClick={() => go('/profile')}><MapPin size={16} /><span>Profile & area</span></button><button role="menuitem" className="account-pop-row" onClick={() => go('/settings/priorities')}><SlidersHorizontal size={16} /><span>Priorities</span></button><button role="menuitem" className="account-pop-row" onClick={() => go('/account')}><UserRound size={16} /><span>{session?.user?.email ? 'Account & sign-in' : 'Sign in or create an account'}<small>{session?.user?.email ? 'Manage or switch your account' : 'Named sign-in is optional'}</small></span></button><button role="menuitem" className="account-pop-row out" onClick={exit} disabled={busy}><LogOut size={16} /><span>{busy ? 'Signing out…' : 'Sign out'}</span></button>{error && <p className="notice" role="alert">{error}</p>}
  </div>}</div>;
}

export function AppShell({ aiMode, children, activeId, activeDealId, api, session, profile, onNavigate, onLogout, processingPaused, onPauseProcessing }) {
  const [open, setOpen] = useState(false), close = useCallback(() => setOpen(false), []);
  return <div className="shell"><header className="shell-header" inert={open}>
    <div className="brand"><button className="brand-home" onClick={() => onNavigate('/')} aria-label="Wasit home"><WasitMark size={30} /></button><span className="brand-stack"><button className="brand-home" onClick={() => onNavigate('/')} aria-label="Wasit home"><Wordmark size={21} /></button><TopbarModel api={api} requestId={activeId} processingPaused={processingPaused} onPauseProcessing={onPauseProcessing} /></span></div>
    <div className="header-actions"><button className="icon-btn" onClick={() => setOpen(true)} aria-label="Open history" aria-expanded={open}><PanelLeft size={18} strokeWidth={1.75} /></button><ThemeControl /><button className="icon-btn" onClick={() => onNavigate('/settings')} aria-label="Settings"><Settings size={18} strokeWidth={1.75} /></button><AccountMenu session={session} profile={profile} onNavigate={onNavigate} onLogout={onLogout} /></div>
  </header><main className="shell-main" inert={open}>{children}</main><HistoryDrawer open={open} onClose={close} onNavigate={onNavigate} api={api} actorId={session?.actor_id} activeId={activeId} activeDealId={activeDealId} /></div>;
}

export function SettingsHub({ profile, session, onNavigate }) {
  const weights = profile?.weights ?? { price: 50, slot: 25, trust: 25 };
  return <section className="onboarding nested screen-enter"><div className="ob-top"><span className="ob-brand"><WasitMark size={24} /><Wordmark size={16} /></span><button className="text-link muted" onClick={() => onNavigate('/')}>Close</button></div><div className="ob-heading" style={{ marginTop: 18 }}><h1 tabIndex={-1}>Settings</h1><p>Set your default service area and priorities. Existing requests keep the preferences you used when you created them.</p></div><div className="hub-list">
    <button className="hub-item" onClick={() => onNavigate('/profile')}><span className="hub-icon"><MapPin size={19} /></span><span className="hub-text"><strong>Profile & area</strong><small>{profile?.display_name || 'Your profile'}{profile?.location_label ? ' · ' + profile.location_label : ''}</small></span><ChevronRight size={18} /></button>
    <button className="hub-item" onClick={() => onNavigate('/settings/priorities')}><span className="hub-icon"><SlidersHorizontal size={19} /></span><span className="hub-text"><strong>Priorities</strong><small>Price {weights.price}% · schedule {weights.slot}% · trust {weights.trust}%</small></span><ChevronRight size={18} /></button>
    <button className="hub-item" onClick={() => onNavigate('/account')}><span className="hub-icon"><UserRound size={19} /></span><span className="hub-text"><strong>Account & sign-in</strong><small>{session?.user?.email || 'Optional account, or continue with your demo profile'}</small></span><ChevronRight size={18} /></button>
    <button className="hub-item" onClick={() => onNavigate('/settings/models')}><span className="hub-icon"><Cpu size={19} /></span><span className="hub-text"><strong>AI models</strong><small>Choose models for new requests and bill previews</small></span><ChevronRight size={18} /></button>
    <button className="hub-item" onClick={() => onNavigate('/demo')}><span className="hub-icon"><Clapperboard size={19} /></span><span className="hub-text"><strong>Demo controls</strong><small>Five service scenarios, labeled providers and your own session reset</small></span><ChevronRight size={18} /></button>
  </div></section>;
}

export default AppShell;

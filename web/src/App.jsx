import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { usePath, navigate } from './lib/router.js';
import { useAppHeight } from './lib/viewport.js';
import { useSession } from './lib/session.js';
import { WasitMark, Wordmark } from './components/WasitMark.jsx';
import { Boundary, Cta, Pending } from './components/Bits.jsx';
import { AppShell, SettingsHub } from './components/AppShell.jsx';
const AIModelSettings = lazy(() => import('./components/AIModelSettings.jsx'));
import { ConsumerDemoControls } from './components/ConsumerDemoControls.jsx';
const ComponentGallery = lazy(() => import('./components/ComponentGallery.jsx'));
import Welcome from './screens/Welcome.jsx';
const AccountScreen = lazy(() => import('./screens/AccountScreen.jsx'));
const ConsumerProfile = lazy(() => import('./components/ConsumerProfile.jsx'));
import ConsumerRequest from './screens/ConsumerRequest.jsx';
const ConsumerRoom = lazy(() => import('./screens/ConsumerRoom.jsx'));
const AgreementScreen = lazy(() => import('./screens/AgreementScreen.jsx'));
const ProviderScreen = lazy(() => import('./screens/ProviderScreen.jsx'));

function RouteView({ children, viewKey }) {
  return <Boundary key={viewKey}><Suspense fallback={<Pending>Opening this view...</Pending>}>{children}</Suspense></Boundary>;
}

const seenWelcome = () => { try { return sessionStorage.getItem('wasit.welcome') === '1'; } catch { return false; } };

function canonicalPath(path) {
  if (path === '/home') return '/';
  if (path === '/settings/profile') return '/profile';
  if (path === '/onboarding') return '/setup';
  if (path.startsWith('/r/')) return path.replace(/^\/r\//, '/requests/').replace(/\/lock$/, '/compare');
  if (path.startsWith('/deal/')) return path.replace(/^\/deal\//, '/deals/');
  return path;
}

function ConsumerApplication({ path, initiallyInApp = false }) {
  const state = useSession();
  const { session, profile, profileLoading, refreshProfile, api, bootstrap, logout, loading } = state;
  const [welcomed, setWelcomed] = useState(() => seenWelcome() || path !== '/' || initiallyInApp);
  const [aiMode, setAiMode] = useState(''), [entryError, setEntryError] = useState(null), [launching, setLaunching] = useState(false);
  const reduce = useReducedMotion(), launchTimer = useRef(null), first = useRef(true);
  const common = { ...state, onNavigate: navigate };
  useEffect(() => { if (!session) return; const controller = new AbortController(); api('/api/health', { signal: controller.signal }).then((value) => setAiMode(value.ai_mode)).catch((error) => { if (error.name !== 'AbortError') setAiMode('Server unavailable'); }); return () => controller.abort(); }, [api, session?.actor_id]);
  useEffect(() => () => clearTimeout(launchTimer.current), []);
  const begin = async () => {
    try { sessionStorage.setItem('wasit.welcome', '1'); } catch {}
    setWelcomed(true); setEntryError(null);
    try {
      if (!session) await bootstrap();
      const saved = session && !profileLoading && !state.profileError ? profile : await refreshProfile();
      navigate(saved?.location_label ? '/' : '/setup');
    } catch (error) { setEntryError(error); throw error; }
  };
  const launch = () => { clearTimeout(launchTimer.current); setLaunching(true); launchTimer.current = setTimeout(() => setLaunching(false), reduce ? 200 : 1250); };
  const finishSetup = () => { refreshProfile().catch(() => {}); if (!/^\/(?:requests|r|deals|deal)\//.test(path)) navigate('/'); };
  const request = path.match(/^\/(?:requests|r)\/([^/]+)(?:\/(compare|lock))?$/), deal = path.match(/^\/(?:deals|deal)\/([^/]+)(?:\/(check))?$/);
  const isAccount = path === '/account', readyProfile = Boolean(profile?.location_label), profileFailure = state.profileError;
  let phase, node;
  if (path === '/welcome' || (!welcomed && path === '/')) {
    phase = 'welcome'; node = <Welcome {...common} onStart={begin} />;
  } else if (loading || (session && profileLoading)) {
    phase = 'loading'; node = <div className="onboarding" style={{ display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 13 }} role="status">Preparing your space…</div>;
  } else if (isAccount && (!session || !readyProfile)) {
    phase = 'onboarding'; node = <RouteView viewKey="account"><AccountScreen {...common} /></RouteView>;
  } else if (!session) {
    phase = 'onboarding'; node = <section className="onboarding screen-enter"><div className="ob-top"><span className="ob-brand"><WasitMark size={24} /><Wordmark size={16} /></span></div><div className="ob-heading"><h1 tabIndex={-1}>Your space in Wasit</h1><p>Set your service area and priorities, then start comparing clear quotes. A named account is optional.</p></div>{entryError && <p className="notice" role="alert">{entryError.message}</p>}<Cta onClick={() => begin().catch(() => {})}>Continue <ArrowRight size={18} /></Cta><button className="text-link muted" onClick={() => navigate('/account')}>Sign in or create an account</button><button className="text-link muted" onClick={() => navigate('/welcome')}>Back to welcome</button></section>;
  } else if (profileFailure) {
    phase = 'onboarding'; node = <section className="onboarding"><div className="ob-heading"><h1 tabIndex={-1}>Your profile could not be loaded</h1><p role="alert">{profileFailure.message ?? profileFailure}</p></div><Cta onClick={() => refreshProfile().catch(() => {})}>Try again</Cta><button className="text-link muted" onClick={() => navigate('/account')}>Open account</button></section>;
  } else if (!readyProfile || path === '/setup') {
    phase = 'onboarding'; node = <RouteView viewKey={'setup:' + session.actor_id}><ConsumerProfile {...common} key={session.actor_id} onDone={finishSetup} onCancel={() => navigate('/account')} /></RouteView>;
  } else {
    phase = 'app'; let screen;
    if (isAccount) screen = <AccountScreen {...common} />;
    else if (path === '/profile' || path === '/settings/profile') screen = <ConsumerProfile {...common} editing nested initialStep={0} onDone={() => navigate('/settings')} onCancel={() => navigate('/settings')} />;
    else if (path === '/settings/priorities') screen = <ConsumerProfile {...common} editing nested initialStep={1} onDone={() => navigate('/settings')} onCancel={() => navigate('/settings')} />;
    else if (path === '/settings/models') screen = <AIModelSettings {...common} />;
    else if (path === '/settings') screen = <SettingsHub profile={profile} session={session} onNavigate={navigate} />;
    else if (path === '/demo') screen = <ConsumerDemoControls {...common} fullPage defaultOpen />;
    else if (request) screen = <ConsumerRoom key={request[1]} requestId={request[1]} initialTab={request[2] ? 'compare' : 'live'} {...common} />;
    else if (deal) screen = <AgreementScreen key={deal[1]} dealId={deal[1]} {...common} initialSection={deal[2] === 'check' ? 'bill' : undefined} onBack={() => navigate('/')} />;
    else if (path === '/' || path === '/request') screen = <ConsumerRequest {...common} onLaunch={launch} />;
    else screen = <section className="page screen-enter"><h1 tabIndex={-1}>Page not found</h1><Cta onClick={() => navigate('/')}>Back to app</Cta><button className="text-link" onClick={() => navigate('/welcome')}>Back to welcome</button></section>;
    node = <AppShell key={session.actor_id} aiMode={aiMode} activeId={request?.[1]} activeDealId={deal?.[1]} api={api} session={session} profile={profile} onNavigate={navigate} onLogout={logout}><div key={path} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}><RouteView viewKey={path}>{screen}</RouteView></div></AppShell>;
  }
  useEffect(() => {
    window.scrollTo({ top: 0 });
    if (first.current) { first.current = false; return; }
    const timer = setTimeout(() => { const heading = document.querySelector('main h1,.app-phase h1'); if (heading) { if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); } }, 120);
    return () => clearTimeout(timer);
  }, [path, phase]);
  return <div className="app-root"><AnimatePresence mode="wait"><motion.div key={phase} className="app-phase" initial={reduce ? false : { opacity: 0, scale: 0.97, filter: 'blur(4px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.02, filter: 'blur(6px)' }} transition={reduce ? { duration: 0 } : { duration: 0.46, ease: [0.22, 1, 0.36, 1] }}>{node}</motion.div></AnimatePresence>{launching && <div className="whistle" aria-hidden="true"><div className="whistle-mark"><i /><i /><i /><WasitMark size={64} /></div><p>The whistle blows · Wasit is getting started</p></div>}</div>;
}

export default function App() {
  useAppHeight(); const rawPath = usePath(), path = canonicalPath(rawPath), provider = path.match(/^\/provider\/([^/]+)$/);
  useEffect(() => { if (rawPath !== path) navigate(path, { replace: true }); }, [rawPath, path]);
  if (provider) return <div className="app-root"><div className="app-phase"><RouteView viewKey={path}><ProviderScreen key={provider[1]} branchId={provider[1]} onBack={() => navigate('/')} /></RouteView></div></div>;
  if (path === '/components') return <div className="app-root"><div className="app-phase"><RouteView viewKey={path}><ComponentGallery /></RouteView></div></div>;
  return <ConsumerApplication path={path} initiallyInApp={rawPath !== '/'} />;
}

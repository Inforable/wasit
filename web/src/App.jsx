import { useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import { usePath, navigate } from './lib/router.js';
import { useAppHeight } from './lib/viewport.js';
import { useTheme } from './lib/theme.js';
import { WasitMark, Wordmark } from './components/WasitMark.jsx';
import { Cta, Safety } from './components/Bits.jsx';
import ComponentGallery from './components/ComponentGallery.jsx';

export default function App() {
  const path = usePath();
  const [theme, setTheme] = useTheme();
  useAppHeight();
  useEffect(() => { document.querySelector('h1')?.focus(); }, [path]);
  return <div className="app-root"><div className="app-phase"><div className="shell">
    <header className="shell-header">
      <button className="brand" onClick={() => navigate('/')} aria-label="Wasit home"><WasitMark size={30} /><Wordmark size={21} /></button>
      <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
    </header>
    <main className="shell-main">{path === '/components' ? <ComponentGallery /> : <section className="page home screen-enter">
      <div className="orb" aria-hidden="true"><WasitMark size={50} /></div>
      <h1 tabIndex={-1} className="greeting">A fair price.<span>From the first quote to the final bill.</span></h1>
      <div className="prompt foundation-intro"><p className="eyebrow">COMPARE · NEGOTIATE · AGREE</p>
        <h2>Find the right service.<br />Stay in control of the bill.</h2>
        <p>Compare clear quotes, negotiate your terms, and approve changes before extra work begins.</p>
        <Cta disabled>Service requests are coming soon</Cta>
      </div><Safety />
    </section>}</main>
  </div></div></div>;
}

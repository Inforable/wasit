import { useEffect, useState } from 'react';

export function navigate(to, { replace = false } = {}) {
  const url = new URL(to, window.location.origin);
  if (url.origin !== window.location.origin) throw new Error('Navigation must stay within Wasit.');
  window.history[replace ? 'replaceState' : 'pushState'](null, '', url.pathname + url.search + url.hash);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
export function usePath() {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  return path;
}

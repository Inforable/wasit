import { useEffect, useState } from 'react';
export function readTheme() {
  try { return ['light', 'dark', 'system'].includes(localStorage.getItem('wasit.theme')) ? localStorage.getItem('wasit.theme') : 'light'; }
  catch { return 'light'; }
}
export function applyTheme(theme = readTheme()) {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = theme;
}
export function useTheme() {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => { applyTheme(theme); try { localStorage.setItem('wasit.theme', theme); } catch {} }, [theme]);
  return [theme, setTheme];
}

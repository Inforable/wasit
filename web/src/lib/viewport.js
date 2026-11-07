import { useEffect } from 'react';

export function useAppHeight() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => document.documentElement.style.setProperty('--app-height', `${viewport?.height ?? window.innerHeight}px`);
    update();
    viewport?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
    };
  }, []);
}

import { useId } from 'react';


export function WasitMark({ size = 32, tile = true }) {
  const uid = useId().replace(/:/g, '');
  const g = `wm-g-${uid}`;
  return (
    <svg className="wasit-mark" width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={g} x1="0" y1="32" x2="32" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3730A3" />
          <stop offset="1" stopColor="#6E5CF6" />
        </linearGradient>
      </defs>
      {tile ? (
        <>
          <rect width="32" height="32" rx="9" fill={`url(#${g})`} />
          <path d="M8.6 12.6 11.9 21 16 14.4 20.1 21 24.6 9.6" stroke="#fff" strokeWidth={size < 24 ? 3.4 : 3.1} strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <path d="M4.5 11.5 9 23.5 16 13 23 23.5 28.5 6.5" stroke={`url(#${g})`} strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}


export function Wordmark({ size = 20 }) {
  return (
    <span className="wordmark-text" style={{ fontSize: size }} aria-label="wasit">
      was
      <span className="wm-i" aria-hidden="true">
        ı<b />
      </span>
      t
    </span>
  );
}

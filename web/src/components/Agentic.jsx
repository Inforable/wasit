import { useEffect, useRef, useState } from 'react';
import { Check, CircleX, Eye, TriangleAlert } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { rp } from '../lib/format.js';

export function RefCard({ card = 'yellow', children, size = 'sm' }) {
  const Icon = card === 'red' ? CircleX : card === 'green' ? Check : card === 'grey' ? Eye : TriangleAlert;
  return (
    <span className={`ref-card ref-${card} ref-${size}`}>
      <i aria-hidden="true">
        <Icon size={size === 'md' ? 10 : 9} strokeWidth={3} />
      </i>
      <span>{children}</span>
    </span>
  );
}


export function Ticker({ value, format = rp }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    if (value == null || prev.current == null || reduce) {
      prev.current = value;
      setShown(value);
      return;
    }
    const from = prev.current;
    const start = performance.now();
    let raf;
    const step = (t) => {
      const k = Math.min(1, (t - start) / 500);
      setShown(Math.round(from + (value - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
      else prev.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce]);
  return <span className="tabular">{shown == null ? '—' : format(shown)}</span>;
}

export function EngineChip({ engine }) {
  if (!engine) return null;
  return <span className={`engine engine-${engine}`}>{engine === 'model' ? 'model' : 'rules'}</span>;
}

